import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  AssistRequestSchema,
  createFirebaseTokenVerifier,
  createVerifyFirebaseAuthMiddleware,
  SlidingWindowLimiter,
  UsageTracker,
  withTimeout,
  type VerifiedCaller,
} from './src/server/aiSecurity.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';
const AI_TIMEOUT_MS = 25_000;
const USER_RATE_LIMIT = 15;
const GLOBAL_RATE_LIMIT = 120;

function readFirebaseProjectId(): string {
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    return parsed.projectId || '';
  } catch {
    return '';
  }
}

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
  app.use(express.json({ limit: '128kb' }));

  const projectId = readFirebaseProjectId();
  const verifyAuth = createVerifyFirebaseAuthMiddleware(createFirebaseTokenVerifier(projectId));
  const userLimiter = new SlidingWindowLimiter(USER_RATE_LIMIT, 60_000);
  const globalLimiter = new SlidingWindowLimiter(GLOBAL_RATE_LIMIT, 60_000);
  const usageTracker = new UsageTracker();

  app.get('/api/health', (_req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const aiConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
    res.json({
      status: 'ok',
      aiConfigured,
      authVerificationConfigured: Boolean(projectId),
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/ai/assist', verifyAuth, async (req: Request, res: Response) => {
    const caller = (req as Request & { verifiedCaller?: VerifiedCaller }).verifiedCaller;
    if (!caller) {
      res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Authentication required.' });
      return;
    }

    const globalCheck = globalLimiter.consume('global');
    if (!globalCheck.allowed) {
      res.setHeader('Retry-After', String(globalCheck.retryAfterSeconds));
      res.status(429).json({
        error: 'GLOBAL_RATE_LIMITED',
        message: 'AI Assistant capacity is busy right now. Retry shortly.',
      });
      return;
    }

    const userCheck = userLimiter.consume(caller.uid);
    if (!userCheck.allowed) {
      res.setHeader('Retry-After', String(userCheck.retryAfterSeconds));
      res.status(429).json({
        error: 'USER_RATE_LIMITED',
        message: `Rate limit reached (${USER_RATE_LIMIT} requests/min). Retry in ${userCheck.retryAfterSeconds}s.`,
      });
      return;
    }

    const parsed = AssistRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: parsed.error.issues[0]?.message ?? 'Invalid assistant payload.',
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
        const response = await withTimeout(
          ai.models.generateContent({
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
          }),
          AI_TIMEOUT_MS
        );

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

        const replyText =
          typeof structured.reply === 'string'
            ? structured.reply
            : 'Here is a suggested plan for your review.';
        usageTracker.record(caller.uid, prompt.length, replyText.length);

        res.json({
          reply: replyText,
          proposedTasks: safeTasks,
          isAiSuggestion: true,
          usage: usageTracker.snapshot(caller.uid, userLimiter, USER_RATE_LIMIT),
        });
        return;
      }

      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction,
          },
        }),
        AI_TIMEOUT_MS
      );

      const replyText = response.text ?? 'No response generated.';
      usageTracker.record(caller.uid, prompt.length, replyText.length);

      res.json({
        reply: replyText,
        proposedTasks: [],
        isAiSuggestion: true,
        usage: usageTracker.snapshot(caller.uid, userLimiter, USER_RATE_LIMIT),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assistant request failed';
      if (message === 'AI_REQUEST_TIMEOUT') {
        res.status(504).json({
          error: 'AI_TIMEOUT',
          message: 'The assistant request timed out. Please try a shorter prompt.',
        });
        return;
      }
      console.error('Gemini API route error:', message);
      res.status(502).json({
        error: 'AI_REQUEST_FAILED',
        message: 'Could not reach the Gemini assistant right now. Your local workspace data is safe.',
      });
    }
  });

  const httpServer = http.createServer(app);

  if (!isProd) {
    const disableHmr =
      process.env.DISABLE_HMR === 'true' ||
      Boolean(process.env.K_SERVICE || process.env.APP_URL);
    if (disableHmr) {
      process.env.DISABLE_HMR = 'true';
    }
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: disableHmr ? false : { server: httpServer },
        ...(disableHmr ? { watch: null } : {}),
      },
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXORA server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NEXORA server:', err);
  process.exit(1);
});
