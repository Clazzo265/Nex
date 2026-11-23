import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export interface VerifiedCaller {
  uid: string;
  email?: string;
  emailVerified: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingInWindow: number;
  limit: number;
}

export interface UsageSnapshot {
  uid: string;
  requestsTotal: number;
  estimatedTokensTotal: number;
  requestsInWindow: number;
  windowLimit: number;
  remainingInWindow: number;
}

export const AssistRequestSchema = z
  .object({
    prompt: z.string().trim().min(1, 'Prompt is required').max(4000, 'Prompt exceeds 4,000 characters'),
    mode: z.enum(['chat', 'plan_tasks', 'study_plan', 'finance_explain']).default('chat'),
    consentAcknowledged: z.boolean().optional(),
    consentedContext: z
      .object({
        tasksSummary: z.string().max(2000).optional(),
        academicSummary: z.string().max(2000).optional(),
        financeSummary: z.string().max(2000).optional(),
        goalsSummary: z.string().max(1500).optional(),
        notesSummary: z.string().max(2000).optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const c = data.consentedContext;
    const hasContext = Boolean(
      c &&
        (c.tasksSummary || c.academicSummary || c.financeSummary || c.goalsSummary || c.notesSummary)
    );
    if (hasContext && data.consentAcknowledged !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Explicit user consent acknowledgment is required before sharing personal workspace context.',
      });
    }
  });

export class SlidingWindowLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  consume(key: string, nowMs = Date.now()): RateLimitResult {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= nowMs) {
      this.buckets.set(key, { count: 1, resetAt: nowMs + this.windowMs });
      return {
        allowed: true,
        retryAfterSeconds: 0,
        remainingInWindow: Math.max(0, this.limit - 1),
        limit: this.limit,
      };
    }

    if (existing.count >= this.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000));
      return {
        allowed: false,
        retryAfterSeconds,
        remainingInWindow: 0,
        limit: this.limit,
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingInWindow: Math.max(0, this.limit - existing.count),
      limit: this.limit,
    };
  }

  peekCount(key: string, nowMs = Date.now()): number {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= nowMs) return 0;
    return existing.count;
  }
}

export class UsageTracker {
  private readonly stats = new Map<string, { requestsTotal: number; estimatedTokensTotal: number }>();

  record(uid: string, promptChars: number, replyChars: number): void {
    const prev = this.stats.get(uid) ?? { requestsTotal: 0, estimatedTokensTotal: 0 };
    const estTokens = Math.max(1, Math.ceil((promptChars + replyChars) / 4));
    this.stats.set(uid, {
      requestsTotal: prev.requestsTotal + 1,
      estimatedTokensTotal: prev.estimatedTokensTotal + estTokens,
    });
  }

  snapshot(uid: string, limiter: SlidingWindowLimiter, windowLimit: number): UsageSnapshot {
    const base = this.stats.get(uid) ?? { requestsTotal: 0, estimatedTokensTotal: 0 };
    const requestsInWindow = limiter.peekCount(uid);
    return {
      uid,
      requestsTotal: base.requestsTotal,
      estimatedTokensTotal: base.estimatedTokensTotal,
      requestsInWindow,
      windowLimit,
      remainingInWindow: Math.max(0, windowLimit - requestsInWindow),
    };
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match && match[1] ? match[1].trim() : null;
}

export function createFirebaseTokenVerifier(projectId: string) {
  return async (token: string): Promise<VerifiedCaller> => {
    const app = getApps().length > 0 ? getApp() : initializeApp({ projectId });
    const decoded = await getAuth(app).verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
      emailVerified: Boolean(decoded.email_verified),
    };
  };
}

export function createVerifyFirebaseAuthMiddleware(
  verifyToken: (token: string) => Promise<VerifiedCaller>
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'Sign in with a verified cloud account to use NEXORA AI Assistant.',
      });
      return;
    }

    try {
      const caller = await verifyToken(token);
      if (!caller.emailVerified) {
        res.status(403).json({
          error: 'EMAIL_VERIFICATION_REQUIRED',
          message: 'Verify your email address before sending requests to NEXORA AI Assistant.',
        });
        return;
      }
      (req as Request & { verifiedCaller?: VerifiedCaller }).verifiedCaller = caller;
      next();
    } catch {
      res.status(401).json({
        error: 'INVALID_AUTH_TOKEN',
        message: 'Your authentication session expired or is invalid. Refresh and sign in again.',
      });
    }
  };
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('AI_REQUEST_TIMEOUT'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
