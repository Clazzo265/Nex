# NEXORA Security Architecture

## 1. Identity & Email Verification Gate

- Unverified cloud accounts are routed to an explicit Verification Gate in `AuthScreen.tsx` and blocked from mounting `WorkspaceProvider`, reading/writing domain Firestore collections, or invoking `/api/ai/assist`.
- Clicking **I've Verified — Refresh Status** calls `user.reload()` followed by `user.getIdToken(true)` so updated `email_verified` claims reach Firestore Rules and Express immediately.

## 2. Firestore Security Rules

Defined in `firestore.rules`:
- **Global Default Deny**: `match /{document=**} { allow read, write: if false; }`
- **Owner & Verified Owner Enforcement**: Every domain subcollection under `users/{userId}` (`tasks`, `events`, `courses`, `assignments`, `grades`, `transactions`, `budgets`, `savingsGoals`, `goals`, `habits`, `habitEntries`, `projects`, `developerTasks`, `notes`, `vaultFiles`, `notifications`, `auditLogs`) requires `isVerifiedOwner(userId)`.
- **Schema & Type Validation**: Strict `hasOnly`, type checks, string length bounds, non-negative integers for `amountMinor`, referential parent `exists(...)` checks on assignments/grades/habitEntries/developerTasks, and `request.time` timestamp enforcement.
- **Immutable Audit Logs**: `auditLogs` permit verified owner `create` only (`allow update: if false; allow delete: if false;`).

## 3. Server-Side AI Security (`/api/ai/assist`)

Implemented in `server.ts` and `src/server/aiSecurity.ts`:
- `createVerifyFirebaseAuthMiddleware` validates `Authorization: Bearer <idToken>` using `firebase-admin/auth` (`401` if missing/invalid, `403` if `email_verified !== true`).
- `SlidingWindowLimiter` enforces **15 requests/minute per UID** and **120 requests/minute globally** (`429` with `retryAfterSeconds`).
- Request bodies are capped at `128kb` and validated via `AssistRequestSchema` (max prompt length `4000`, bounded context summaries, mandatory `consentAcknowledged: true` when personal workspace context is attached).
- Outbound Gemini calls are bounded by a **25-second timeout** (`504`).
- `GEMINI_API_KEY` stays strictly server-side.

## 4. Client & Offline Isolation

- Google Drive OAuth tokens exist only in memory (`src/lib/googleDrive.ts`).
- Local Offline Workspaces use isolated `local_ws_*` IDs and optional per-workspace salted SHA-256 PIN hashes (`src/lib/localWorkspaces.ts`).
- External URLs in Developer Projects and Knowledge notes reject dangerous schemes such as `javascript:`.
