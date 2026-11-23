import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  AssistRequestSchema,
  SlidingWindowLimiter,
  UsageTracker,
  createVerifyFirebaseAuthMiddleware,
  extractBearerToken,
  withTimeout,
} from './aiSecurity.ts';

test('extractBearerToken parses Authorization Bearer headers case-insensitively', () => {
  assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken('bearer   token-123  '), 'token-123');
  assert.equal(extractBearerToken('Basic xyz'), null);
  assert.equal(extractBearerToken(undefined), null);
});

test('AssistRequestSchema rejects unconsented workspace context payloads', () => {
  const denied = AssistRequestSchema.safeParse({
    prompt: 'Summarize my finances',
    mode: 'finance_explain',
    consentAcknowledged: false,
    consentedContext: { financeSummary: 'Net: 500 MWK' },
  });
  assert.equal(denied.success, false);

  const allowedWithoutContext = AssistRequestSchema.safeParse({
    prompt: 'What is compound interest?',
    mode: 'chat',
  });
  assert.equal(allowedWithoutContext.success, true);

  const allowedWithConsent = AssistRequestSchema.safeParse({
    prompt: 'Review tasks',
    mode: 'plan_tasks',
    consentAcknowledged: true,
    consentedContext: { tasksSummary: '3 tasks due tomorrow' },
  });
  assert.equal(allowedWithConsent.success, true);
});

test('SlidingWindowLimiter enforces per-user quotas and computes retryAfterSeconds', () => {
  const limiter = new SlidingWindowLimiter(2, 60_000);
  const now = 1_000_000;

  const first = limiter.consume('user_1', now);
  assert.equal(first.allowed, true);
  assert.equal(first.remainingInWindow, 1);

  const second = limiter.consume('user_1', now + 1000);
  assert.equal(second.allowed, true);
  assert.equal(second.remainingInWindow, 0);

  const blocked = limiter.consume('user_1', now + 2000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 57 && blocked.retryAfterSeconds <= 60);

  // Separate user has independent bucket
  assert.equal(limiter.consume('user_2', now + 2000).allowed, true);

  // Window resets after expiry
  assert.equal(limiter.consume('user_1', now + 61_000).allowed, true);
});

test('UsageTracker accumulates requests and token estimates per user', () => {
  const limiter = new SlidingWindowLimiter(15, 60_000);
  const tracker = new UsageTracker();
  limiter.consume('u1');
  tracker.record('u1', 120, 280);
  const snap = tracker.snapshot('u1', limiter, 15);
  assert.equal(snap.requestsTotal, 1);
  assert.equal(snap.estimatedTokensTotal, 100);
  assert.equal(snap.remainingInWindow, 14);
});

test('withTimeout rejects cleanly when async work exceeds timeout', async () => {
  await assert.rejects(
    () => withTimeout(new Promise((resolve) => setTimeout(() => resolve('late'), 200)), 25),
    /AI_REQUEST_TIMEOUT/
  );
  const ok = await withTimeout(Promise.resolve('fast'), 100);
  assert.equal(ok, 'fast');
});

test('Express auth middleware blocks missing tokens (401), unverified emails (403), and passes verified users (200)', async () => {
  const app = express();
  app.use(express.json());

  const verifyAuth = createVerifyFirebaseAuthMiddleware(async (token) => {
    if (token === 'verified-token') {
      return { uid: 'uid-verified', email: 'verified@example.com', emailVerified: true };
    }
    if (token === 'unverified-token') {
      return { uid: 'uid-unverified', email: 'unverified@example.com', emailVerified: false };
    }
    throw new Error('Invalid token');
  });

  app.post('/api/ai/assist', verifyAuth, (req, res) => {
    const caller = (req as express.Request & { verifiedCaller?: { uid: string } }).verifiedCaller;
    res.json({ ok: true, uid: caller?.uid });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const resMissing = await fetch(`${baseUrl}/api/ai/assist`, { method: 'POST' });
    assert.equal(resMissing.status, 401);

    const resInvalid = await fetch(`${baseUrl}/api/ai/assist`, {
      method: 'POST',
      headers: { Authorization: 'Bearer bad-token' },
    });
    assert.equal(resInvalid.status, 401);

    const resUnverified = await fetch(`${baseUrl}/api/ai/assist`, {
      method: 'POST',
      headers: { Authorization: 'Bearer unverified-token' },
    });
    assert.equal(resUnverified.status, 403);

    const resVerified = await fetch(`${baseUrl}/api/ai/assist`, {
      method: 'POST',
      headers: { Authorization: 'Bearer verified-token' },
    });
    assert.equal(resVerified.status, 200);
    const body = (await resVerified.json()) as { ok: boolean; uid: string };
    assert.equal(body.ok, true);
    assert.equal(body.uid, 'uid-verified');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
