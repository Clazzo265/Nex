import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Simple in-memory rate limiter for AI endpoints
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }
  if (bucket.count >= 25) {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please wait a minute before sending another assistant request.',
    });
    return;
  }
  bucket.count += 1;
  next();
}

const AssistRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  mode: z.enum(['chat', 'plan_tasks', 'study_plan', 'finance_explain']).default('chat'),
  consentedContext: z
    .object({
      tasksSummary: z.string().max(2000).optional(),
      academicSummary: z.string().max(2000).optional(),
      financeSummary: z.string().max(2000).optional(),
      goalsSummary: z.string().max(1500).optional(),
      notesSummary: z.string().max(2000).optional(),
    })
    .optional(),
});

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const aiConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
    res.json({
      status: 'ok',
      aiConfigured,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/ai/assist', rateLimit, async (req: Request, res: Response) => {
    const parsed = AssistRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Please provide a valid prompt within 4,000 characters.',
        issues: parsed.error.issues,
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'AI_UNAVAILABLE',
        message:
          'Gemini AI service is not configured in this environment. Core NEXORA modules remain fully operational.',
      });
      return;
    }

    const { prompt, mode, consentedContext } = parsed.data;
    const contextSections: string[] = [];
    if (consentedContext?.tasksSummary) {
      contextSections.push(`Authorized Tasks Context:\n${consentedContext.tasksSummary}`);
    }
    if (consentedContext?.academicSummary) {
      contextSections.push(`Authorized Academic Context:\n${consentedContext.academicSummary}`);
    }
    if (consentedContext?.financeSummary) {
      contextSections.push(`Authorized Finance Context:\n${consentedContext.financeSummary}`);
    }
    if (consentedContext?.goalsSummary) {
      contextSections.push(`Authorized Goals Context:\n${consentedContext.goalsSummary}`);
    }
    if (consentedContext?.notesSummary) {
      contextSections.push(`Authorized Knowledge Notes Context:\n${consentedContext.notesSummary}`);
    }

    const systemInstruction = [
      'You are the NEXORA AI Assistant inside a personal operating system.',
      'Rules:',
      '1. Only reference context explicitly provided below. Never invent completed tasks, grades, or transactions.',
      '2. Clearly label suggestions as recommendations for user review; you cannot directly alter records.',
      '3. Be concise, practical, encouraging, and structured.',
      contextSections.length > 0
        ? `\n${contextSections.join('\n\n')}`
        : '\nNo personal workspace data was shared for this query.',
    ].join('\n');

    try {
      if (mode === 'plan_tasks' || mode === 'study_plan') {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: {
                  type: Type.STRING,
                  description: 'Helpful explanation and guidance for the user.',
                },
                proposedTasks: {
                  type: Type.ARRAY,
                  description: 'Suggested actionable tasks for the user to review before saving.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      priority: { type: Type.STRING },
                      category: { type: Type.STRING },
                      notes: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });

        const rawText = (response.text ?? '{}').trim();
        let structured: { reply?: string; proposedTasks?: unknown[] } = {};
        try {
          structured = JSON.parse(rawText);
        } catch {
          structured = { reply: rawText, proposedTasks: [] };
        }

        const safeTasks = Array.isArray(structured.proposedTasks)
          ? structured.proposedTasks
              .filter(
                (t): t is { title: string; priority?: string; category?: string; notes?: string } =>
                  Boolean(t && typeof t === 'object' && typeof (t as { title?: unknown }).title === 'string')
              )
              .slice(0, 8)
              .map((t) => ({
                title: t.title.slice(0, 180),
                priority: ['low', 'medium', 'high', 'urgent'].includes(String(t.priority))
                  ? String(t.priority)
                  : 'medium',
                category: typeof t.category === 'string' ? t.category.slice(0, 50) : 'General',
                notes: typeof t.notes === 'string' ? t.notes.slice(0, 500) : '',
              }))
          : [];

        res.json({
          reply: typeof structured.reply === 'string' ? structured.reply : 'Here is a suggested plan for your review.',
          proposedTasks: safeTasks,
          isAiSuggestion: true,
        });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
        },
      });

      res.json({
        reply: response.text ?? 'No response generated.',
        proposedTasks: [],
        isAiSuggestion: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assistant request failed';
      console.error('Gemini API route error:', message);
      res.status(502).json({
        error: 'AI_REQUEST_FAILED',
        message: 'Could not reach the Gemini assistant right now. Your local workspace data is safe.',
      });
    }
  });

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXORA server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NEXORA server:', err);
  process.exit(1);
});
