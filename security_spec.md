# NEXORA Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Multi-Tenant User Isolation**: Every collection lives under `/users/{userId}/...`. A user may only read, list, create, update, or delete documents where `request.auth != null && request.auth.uid == userId && incoming().uid == userId`.
2. **No Shadow Fields**: Every document write (`create` and `update`) enforces strict `keys().hasAll(...)` and `keys().hasOnly(...)` allowlists plus `affectedKeys().hasOnly(...)` on updates.
3. **Immutable Ownership & Creation Timestamps**: `uid` and `createdAt` can never be mutated on update (`incoming().uid == existing().uid && incoming().createdAt == existing().createdAt`).
4. **Server Temporal Integrity**: `createdAt == request.time` on create; `updatedAt == request.time` on update.
5. **Relational Parent Verification**: `assignments` and `grades` require an existing parent `courseId` owned by `userId`; `habitEntries` require an existing `habitId`; `developerTasks` require an existing `projectId`.
6. **Exact Integer Currency Bounds**: `transactions.amountMinor`, `budgets.limitMinor`, `savingsGoals.targetMinor`, and `savingsGoals.currentMinor` must be integers within safe non-negative bounds (`>= 0`).
7. **Immutable Audit Logs**: `auditLogs` are append-only (`allow update, delete: if false` on client writes; only `create` and owner `read` allowed, except full account deletion cleanup if explicitly invoked).
8. **ID Poisoning & Resource Exhaustion Prevention**: All path IDs pass `isValidId(id)` (`^[a-zA-Z0-9_\\-]+$`, length `<= 128`) and all strings/arrays enforce strict `.size()` bounds.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Be Denied)
1. **Cross-Tenant Read/List**: User A attempts `get` or `list` on `/users/userB/transactions`. -> **DENIED**
2. **Cross-Tenant Write Spoofing**: User A attempts `create` on `/users/userB/tasks/t1` with `uid: "userA"`. -> **DENIED**
3. **UID Field Tampering**: User A attempts `create` on `/users/userA/tasks/t1` with `uid: "userB"`. -> **DENIED**
4. **Shadow Field Injection**: User A creates a profile with `{ ..., isAdmin: true }`. -> **DENIED**
5. **Path ID Poisoning**: User A writes to `/users/userA/tasks/../../other` or a 500-char ID. -> **DENIED**
6. **Client Timestamp Forgery**: User A creates a transaction with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`. -> **DENIED**
7. **Immutable Field Mutation**: User A updates a task changing `createdAt` or `uid`. -> **DENIED**
8. **Negative / Float Currency Poisoning**: User A submits `amountMinor: -500` or `amountMinor: 12.34` on a transaction. -> **DENIED**
9. **Orphaned Assignment Creation**: User A creates an assignment referencing non-existent `courseId: "fake_course"`. -> **DENIED**
10. **Oversized String Exhaustion**: User A creates a task with a 100KB `title` string. -> **DENIED**
11. **Audit Log Tampering**: User A attempts `update` or `delete` on `/users/userA/auditLogs/log1`. -> **DENIED**
12. **Unauthenticated Access**: Unauthenticated request attempts `read` or `write` on `/users/userA/settings/preferences`. -> **DENIED**
