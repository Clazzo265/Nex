export interface SyncConflict {
  id: string;
  collectionName: string;
  docId: string;
  label: string;
  localPayload: Record<string, unknown>;
  remotePayload: Record<string, unknown>;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  detectedAt: string;
}

export interface StorageQuotaStatus {
  supported: boolean;
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  isNearLimit: boolean;
}

/**
 * Exponential backoff with bounded symmetric jitter to prevent thundering-herd retries.
 */
export function computeBackoffDelayMs(
  attempts: number,
  baseMs = 1500,
  maxMs = 60_000,
  jitterRatio = 0.25,
  rng: () => number = Math.random
): number {
  const safeAttempt = Math.max(0, Math.trunc(attempts));
  const raw = Math.min(maxMs, baseMs * 2 ** safeAttempt);
  const spread = raw * Math.max(0, Math.min(0.5, jitterRatio));
  const delta = (rng() * 2 - 1) * spread;
  return Math.max(250, Math.round(raw + delta));
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String((err as { name?: unknown }).name) : '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    msg.toLowerCase().includes('quota')
  );
}

export async function checkStorageQuota(): Promise<StorageQuotaStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return {
      supported: false,
      usageBytes: 0,
      quotaBytes: 0,
      percentUsed: 0,
      isNearLimit: false,
    };
  }

  try {
    const est = await navigator.storage.estimate();
    const usageBytes = est.usage ?? 0;
    const quotaBytes = est.quota ?? 0;
    const percentUsed = quotaBytes > 0 ? Math.round((usageBytes * 100) / quotaBytes) : 0;
    return {
      supported: true,
      usageBytes,
      quotaBytes,
      percentUsed,
      isNearLimit: percentUsed >= 85,
    };
  } catch {
    return {
      supported: false,
      usageBytes: 0,
      quotaBytes: 0,
      percentUsed: 0,
      isNearLimit: false,
    };
  }
}
