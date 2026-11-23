# Offline-First Sync & Local Workspace Isolation

NEXORA is engineered for intermittent or low-bandwidth connectivity (including rural and mobile networks).

## 1. IndexedDB Durability (`src/lib/offlineDb.ts`)

- Schema version `2` adds a dedicated `sync_conflicts` object store alongside `records` and `sync_queue`.
- Every write, delete, and queue mutation awaits `tx.oncomplete` (rejecting on `tx.onerror` / `tx.onabort`) via `awaitTx` rather than resolving on request success prematurely.
- `QuotaExceededError` / `NS_ERROR_DOM_QUOTA_REACHED` errors are detected explicitly and surfaced with actionable cleanup guidance.
- **Settings -> Offline & Storage** displays live `navigator.storage.estimate()` usage and quota alerts when usage exceeds 85%.

## 2. Retry Queue with Exponential Backoff & Jitter

Implemented in `src/lib/offlineSyncUtils.ts` and `WorkspaceContext.tsx`:
- Failed sync items increment `attempts` and compute `nextRetryAt = now + computeBackoffDelayMs(attempts)` (base 1,500ms, capped at 60,000ms, symmetric ±25% jitter).
- Scheduled flush timers retry queued items automatically when online, without hammering Firestore.

## 3. Conflict Detection & Resolution

Before flushing an `update` queued while offline:
1. `WorkspaceContext` reads the latest cloud document with `getDoc`.
2. `detectVersionConflict(baseUpdatedAt, remoteUpdatedAt, baseVersion, remoteVersion)` checks whether the cloud record changed more recently or holds a higher version than the local edit's baseline.
3. If a conflict is detected, the remote write is paused, saved to `sync_conflicts`, and surfaced as a **Sync Conflict Banner** + **Comparison Modal** in `AppShell.tsx` allowing the user to **Keep Cloud Copy** or **Overwrite with Local Copy**.

## 4. Isolated Local Offline Workspaces

- Stored locally per profile ID (`local_ws_*`, preserving legacy `local_offline_user` records via automatic migration in `localWorkspaces.ts`).
- Switching cloud accounts or creating multiple device-only profiles never mixes records.
- Optional 4+ digit PIN protection uses Web Crypto SHA-256 salted per workspace ID (`nexora_pin:<workspaceId>:<pin>`) and presents `LocalWorkspaceUnlockGate` before mounting workspace data.
