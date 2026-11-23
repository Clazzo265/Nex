import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');
const PROJECT_ID = 'gen-lang-client-0126821819';

function parseEmulatorHost(): { host: string; port: number } | null {
  const raw = process.env.FIRESTORE_EMULATOR_HOST;
  if (!raw) return null;
  const [host, portStr] = raw.split(':');
  const port = Number.parseInt(portStr ?? '8080', 10);
  if (host && Number.isFinite(port)) return { host, port };
  return null;
}

async function isEmulatorReachable(host: string, port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const res = await fetch(`http://${host}:${port}/`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok || res.status === 404 || res.status === 400;
  } catch {
    return false;
  }
}

test('firestore.rules static security invariants match Dirty Dozen & Phase 8 blueprint', () => {
  const rules = fs.readFileSync(RULES_PATH, 'utf-8');
  assert.match(rules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  assert.match(rules, /function isVerifiedOwner\(userId\)\s*\{\s*return isOwner\(userId\) && request\.auth\.token\.email_verified == true;/);
  assert.match(rules, /allow list: if false;/); // users root list denied
  assert.match(rules, /data\.type in \['income', 'expense', 'transfer'\]/);
  assert.match(rules, /match \/auditLogs\/\{logId\}[\s\S]*allow update: if false;\s*allow delete: if false;/);
  assert.match(rules, /driveParentId/);
  assert.match(rules, /driveWebViewLink/);
});

test('Firestore Emulator Live Security Rules Suite (Dirty Dozen + Multi-User Isolation)', async (t) => {
  const endpoint = parseEmulatorHost();
  const reachable = endpoint ? await isEmulatorReachable(endpoint.host, endpoint.port) : false;

  if (!reachable || !endpoint) {
    t.skip(
      'Firestore Emulator not running (requires Java + FIRESTORE_EMULATOR_HOST or 127.0.0.1:8080). Run via: firebase emulators:exec --only firestore "npm run test:rules"'
    );
    return;
  }

  let testEnv: RulesTestEnvironment | undefined;
  try {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host: endpoint.host,
        port: endpoint.port,
        rules: fs.readFileSync(RULES_PATH, 'utf-8'),
      },
    });

    await testEnv.clearFirestore();

    const aliceVerified = testEnv.authenticatedContext('alice', {
      email: 'alice@example.com',
      email_verified: true,
    });
    const aliceUnverified = testEnv.authenticatedContext('alice', {
      email: 'alice@example.com',
      email_verified: false,
    });
    const bobVerified = testEnv.authenticatedContext('bob', {
      email: 'bob@example.com',
      email_verified: true,
    });
    const anonCtx = testEnv.unauthenticatedContext();

    // 1. Default deny: unauthenticated read/write must fail
    await assertFails(getDoc(doc(anonCtx.firestore(), 'users', 'alice')));
    await assertFails(
      setDoc(doc(anonCtx.firestore(), 'users/alice/tasks', 'task_anon'), {
        uid: 'alice',
        title: 'Unauthorized',
      })
    );

    // 2. Unverified owner cannot create domain tasks
    await assertFails(
      setDoc(doc(aliceUnverified.firestore(), 'users/alice/tasks', 'task_unverified'), {
        uid: 'alice',
        title: 'Unverified task',
        priority: 'medium',
        status: 'todo',
        recurring: 'none',
        version: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 3. Verified owner can create valid user root + task + transfer transaction + auditLog
    await assertSucceeds(
      setDoc(doc(aliceVerified.firestore(), 'users', 'alice'), {
        uid: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    await assertSucceeds(
      setDoc(doc(aliceVerified.firestore(), 'users/alice/tasks', 'task_1'), {
        uid: 'alice',
        title: 'Prepare report',
        priority: 'high',
        status: 'todo',
        recurring: 'none',
        version: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    await assertSucceeds(
      setDoc(doc(aliceVerified.firestore(), 'users/alice/transactions', 'tx_transfer_1'), {
        uid: 'alice',
        type: 'transfer',
        amountMinor: 250000,
        currency: 'MWK',
        category: 'Internal Transfer',
        transferAccount: 'Savings Vault',
        transactionDate: '2026-11-22',
        isEstimate: false,
        idempotencyKey: 'tx_transfer_1',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 4. Cross-user access denied (Bob cannot read or mutate Alice's docs)
    await assertFails(getDoc(doc(bobVerified.firestore(), 'users/alice/tasks', 'task_1')));
    await assertFails(
      updateDoc(doc(bobVerified.firestore(), 'users/alice/tasks', 'task_1'), {
        status: 'completed',
        version: 2,
        updatedAt: serverTimestamp(),
      })
    );

    // 5. Server timestamp integrity: forged past updatedAt must fail
    await assertFails(
      setDoc(doc(aliceVerified.firestore(), 'users/alice/tasks', 'task_forged_time'), {
        uid: 'alice',
        title: 'Forged timestamp',
        priority: 'low',
        status: 'todo',
        recurring: 'none',
        version: 1,
        createdAt: new Date('2020-01-01T00:00:00Z'),
        updatedAt: new Date('2020-01-01T00:00:00Z'),
      })
    );

    // 6. Transaction negative amountMinor rejected
    await assertFails(
      setDoc(doc(aliceVerified.firestore(), 'users/alice/transactions', 'tx_bad'), {
        uid: 'alice',
        type: 'expense',
        amountMinor: -100,
        currency: 'MWK',
        category: 'Food',
        transactionDate: '2026-11-22',
        isEstimate: false,
        idempotencyKey: 'tx_bad',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 7. Audit logs are append-only: create succeeds, update & delete must fail
    const auditRef = doc(aliceVerified.firestore(), 'users/alice/auditLogs', 'log_1');
    await assertSucceeds(
      setDoc(auditRef, {
        uid: 'alice',
        entityType: 'transaction',
        entityId: 'tx_transfer_1',
        action: 'create',
        summary: 'Created internal transfer',
        createdAt: serverTimestamp(),
      })
    );
    await assertFails(updateDoc(auditRef, { summary: 'Tampered' }));
    await assertFails(deleteDoc(auditRef));
  } finally {
    await testEnv?.cleanup();
  }
});
