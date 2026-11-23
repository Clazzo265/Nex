import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_PROVIDERS,
  canTransitionRegistrationState,
  evaluatePasswordStrength,
  mapFirebaseAuthError,
  shouldPreferRedirectAuth,
} from './authUtils';
import {
  buildDriveListQuery,
  buildResumableRangeHeader,
  escapeDriveQueryValue,
  formatDriveFileSize,
  mapDriveApiError,
  parseRangeHeaderEnd,
} from './driveUtils';
import {
  computeBudgetStatuses,
  computeFinanceSummary,
  findPotentialDuplicateTransaction,
  parseMajorToMinor,
} from './finance';
import { computeBackoffDelayMs, isQuotaExceededError } from './offlineSyncUtils';
import { hashWorkspacePin } from './localWorkspaces';
import { TransactionInputSchema } from './validation';
import type { Budget, Transaction } from '../types/nexora';

test('auth provider catalog includes Email, Google, Facebook, X, and GitHub', () => {
  const ids = AUTH_PROVIDERS.map((p) => p.id);
  assert.deepEqual(ids, ['password', 'google.com', 'facebook.com', 'twitter.com', 'github.com']);
});

test('password strength evaluator enforces length and character diversity', () => {
  assert.equal(evaluatePasswordStrength('12345').label, 'Too Short');
  assert.equal(evaluatePasswordStrength('12345').isAcceptable, false);

  const weak = evaluatePasswordStrength('abcdefgh');
  assert.equal(weak.isAcceptable, false);

  const strong = evaluatePasswordStrength('Nexora2026!Secure');
  assert.equal(strong.isAcceptable, true);
  assert.ok(strong.score >= 3);
});

test('registration state machine enforces explicit transitions', () => {
  assert.equal(canTransitionRegistrationState('idle', 'registration_started'), true);
  assert.equal(canTransitionRegistrationState('registration_started', 'verification_pending'), true);
  assert.equal(canTransitionRegistrationState('verification_pending', 'verified'), true);
  assert.equal(canTransitionRegistrationState('verified', 'profile_initializing'), true);
  assert.equal(canTransitionRegistrationState('profile_initializing', 'authenticated'), true);
  assert.equal(canTransitionRegistrationState('idle', 'profile_initializing'), false);
});

test('redirect preference detects mobile viewports and embedded WebViews cleanly', () => {
  assert.equal(
    shouldPreferRedirectAuth(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      390
    ),
    true
  );
  assert.equal(
    shouldPreferRedirectAuth('Mozilla/5.0 Instagram 300.0 (iPhone)', 1024),
    true
  );
  assert.equal(
    shouldPreferRedirectAuth('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/122.0', 1280),
    false
  );
});

test('mapFirebaseAuthError provides actionable recovery guidance across critical auth errors', () => {
  const codes = [
    'auth/email-already-in-use',
    'auth/invalid-email',
    'auth/weak-password',
    'auth/wrong-password',
    'auth/invalid-credential',
    'auth/user-not-found',
    'auth/user-disabled',
    'auth/account-exists-with-different-credential',
    'auth/credential-already-in-use',
    'auth/requires-recent-login',
    'auth/popup-closed-by-user',
    'auth/popup-blocked',
    'auth/network-request-failed',
    'auth/too-many-requests',
    'auth/operation-not-allowed',
    'auth/unauthorized-domain',
  ];

  for (const code of codes) {
    const mapped = mapFirebaseAuthError({ code, message: code });
    assert.equal(mapped.code, code);
    assert.ok(mapped.title.length > 3);
    assert.ok(mapped.message.length > 10);
    assert.ok(mapped.nextAction.length > 10);
  }

  assert.equal(
    mapFirebaseAuthError({ code: 'auth/email-already-in-use' }).suggestedAction,
    'switch_to_signin'
  );
  assert.equal(
    mapFirebaseAuthError({ code: 'auth/account-exists-with-different-credential' }).suggestedAction,
    'link_existing_account'
  );
});

test('finance excludes transfer records from income/expenses/budgets while tracking transfer volume', () => {
  const txs: Transaction[] = [
    {
      id: 'tx1',
      uid: 'u1',
      type: 'income',
      amountMinor: 100000,
      currency: 'USD',
      category: 'Salary',
      transactionDate: '2026-11-01',
      isEstimate: false,
      idempotencyKey: 'tx1',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'tx2',
      uid: 'u1',
      type: 'expense',
      amountMinor: 25000,
      currency: 'USD',
      category: 'Utilities',
      transactionDate: '2026-11-03',
      isEstimate: false,
      idempotencyKey: 'tx2',
      createdAt: '2026-11-03T00:00:00Z',
      updatedAt: '2026-11-03T00:00:00Z',
    },
    {
      id: 'tx3',
      uid: 'u1',
      type: 'transfer',
      amountMinor: 50000,
      currency: 'USD',
      category: 'Utilities',
      transferAccount: 'Savings Account',
      transactionDate: '2026-11-04',
      isEstimate: false,
      idempotencyKey: 'tx3',
      createdAt: '2026-11-04T00:00:00Z',
      updatedAt: '2026-11-04T00:00:00Z',
    },
  ];

  const summary = computeFinanceSummary(txs, 'USD', '2026-11');
  assert.equal(summary.actualIncomeMinor, 100000);
  assert.equal(summary.actualExpenseMinor, 25000);
  assert.equal(summary.actualNetMinor, 75000);
  assert.equal(summary.transferVolumeMinor, 50000);
  assert.equal(summary.reconciliation.transferCount, 1);
  assert.equal(summary.reconciliation.isBalanced, true);

  const budgets: Budget[] = [
    {
      id: 'b1',
      uid: 'u1',
      category: 'Utilities',
      limitMinor: 30000,
      currency: 'USD',
      monthKey: '2026-11',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];
  const statuses = computeBudgetStatuses(budgets, txs);
  assert.equal(statuses[0].spentMinor, 25000);
  assert.equal(statuses[0].isOverspent, false);

  const dup = findPotentialDuplicateTransaction(
    {
      type: 'expense',
      amountMinor: 25000,
      currency: 'USD',
      category: 'Utilities',
      transactionDate: '2026-11-03',
    },
    txs
  );
  assert.equal(dup?.id, 'tx2');

  // Large-value safe integer parsing and transfer schema acceptance
  assert.equal(parseMajorToMinor('999999999.99'), 99999999999);
  assert.equal(
    TransactionInputSchema.safeParse({
      type: 'transfer',
      amountMajor: '500.00',
      currency: 'USD',
      category: 'Internal Transfer',
      transferAccount: 'Savings Vault',
      transactionDate: '2026-11-05',
      isEstimate: false,
    }).success,
    true
  );
});

test('offline sync backoff respects exponential cap + jitter and detects quota errors', () => {
  const zeroRng = () => 0.5; // zero jitter
  assert.equal(computeBackoffDelayMs(0, 1000, 30000, 0.25, zeroRng), 1000);
  assert.equal(computeBackoffDelayMs(1, 1000, 30000, 0.25, zeroRng), 2000);
  assert.equal(computeBackoffDelayMs(3, 1000, 30000, 0.25, zeroRng), 8000);
  assert.equal(computeBackoffDelayMs(10, 1000, 30000, 0.25, zeroRng), 30000);

  const err = new Error('Storage quota exceeded');
  err.name = 'QuotaExceededError';
  assert.equal(isQuotaExceededError(err), true);
  assert.equal(isQuotaExceededError(new Error('Network offline')), false);
});

test('local workspace PIN hashing scopes hashes per workspace ID', async () => {
  const hashA = await hashWorkspacePin('local_ws_a', '1234');
  const hashB = await hashWorkspacePin('local_ws_b', '1234');
  assert.notEqual(hashA, hashB);
  assert.equal(hashA, await hashWorkspacePin('local_ws_a', '1234'));
});

test('Google Drive helpers escape queries, build resumable headers, and map HTTP errors cleanly', () => {
  assert.equal(escapeDriveQueryValue("Clarence's\\Notes"), "Clarence\\'s\\\\Notes");
  assert.equal(
    buildDriveListQuery({ folderId: 'folder_123' }),
    "trashed = false and 'folder_123' in parents"
  );
  assert.equal(
    buildDriveListQuery({ searchQuery: "budget'26" }),
    "trashed = false and name contains 'budget\\'26'"
  );

  assert.equal(buildResumableRangeHeader(0, 524288, 1048576), 'bytes 0-524287/1048576');
  assert.equal(parseRangeHeaderEnd('bytes=0-524287'), 524287);
  assert.equal(parseRangeHeaderEnd(null), null);

  assert.equal(mapDriveApiError(401).requiresReauth, true);
  assert.equal(
    mapDriveApiError(
      403,
      JSON.stringify({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } })
    ).code,
    'drive_quota_exceeded'
  );
  assert.equal(mapDriveApiError(404).code, 'drive_not_found');
  assert.equal(formatDriveFileSize(1536), '1.5 KB');
});
