import type { SyncQueueItem } from '../types/nexora';
import type { SyncConflict } from './offlineSyncUtils';
import { isQuotaExceededError } from './offlineSyncUtils';

const DB_NAME = 'nexora_offline_store';
const DB_VERSION = 2;
const STORE_RECORDS = 'records';
const STORE_QUEUE = 'sync_queue';
const STORE_DRAFTS = 'note_drafts';
const STORE_CONFLICTS = 'sync_conflicts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        db.createObjectStore(STORE_RECORDS, { keyPath: 'storageKey' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: 'draftKey' });
      }
      if (!db.objectStoreNames.contains(STORE_CONFLICTS)) {
        db.createObjectStore(STORE_CONFLICTS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function awaitTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      const err = tx.error ?? new Error('IndexedDB transaction failed');
      if (isQuotaExceededError(err)) {
        reject(new Error('Device storage quota exceeded while saving offline data.'));
      } else {
        reject(err);
      }
    };
    tx.onabort = () => {
      const err = tx.error ?? new Error('IndexedDB transaction aborted');
      if (isQuotaExceededError(err)) {
        reject(new Error('Device storage quota exceeded while saving offline data.'));
      } else {
        reject(err);
      }
    };
  });
}

export async function readCachedCollection<T>(uid: string, collectionName: string): Promise<T[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_RECORDS, 'readonly');
    const store = tx.objectStore(STORE_RECORDS);
    const storageKey = `${uid}:${collectionName}`;
    return await new Promise<T[]>((resolve, reject) => {
      const req = store.get(storageKey);
      req.onsuccess = () => {
        const result = req.result as { storageKey: string; items: T[] } | undefined;
        resolve(Array.isArray(result?.items) ? result.items : []);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function writeCachedCollection<T>(
  uid: string,
  collectionName: string,
  items: T[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_RECORDS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDS);
    store.put({
      storageKey: `${uid}:${collectionName}`,
      items,
      cachedAt: new Date().toISOString(),
    });
    await awaitTx(tx);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to write offline cache',
    };
  }
}

export async function readSyncQueue(uid: string): Promise<SyncQueueItem[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const store = tx.objectStore(STORE_QUEUE);
    return await new Promise<SyncQueueItem[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as SyncQueueItem[]) || [];
        resolve(all.filter((item) => item.uid === uid));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function enqueueSyncOperation(item: SyncQueueItem): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).put(item);
  await awaitTx(tx);
}

export async function updateSyncOperation(item: SyncQueueItem): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).put(item);
  await awaitTx(tx);
}

export async function removeSyncOperation(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).delete(id);
  await awaitTx(tx);
}

export async function readSyncConflicts(uid: string): Promise<Array<SyncConflict & { uid: string }>> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_CONFLICTS, 'readonly');
    return await new Promise<Array<SyncConflict & { uid: string }>>((resolve, reject) => {
      const req = tx.objectStore(STORE_CONFLICTS).getAll();
      req.onsuccess = () => {
        const all = (req.result as Array<SyncConflict & { uid: string }>) || [];
        resolve(all.filter((c) => c.uid === uid));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveSyncConflict(uid: string, conflict: SyncConflict): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_CONFLICTS, 'readwrite');
  tx.objectStore(STORE_CONFLICTS).put({ ...conflict, uid });
  await awaitTx(tx);
}

export async function removeSyncConflict(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_CONFLICTS, 'readwrite');
  tx.objectStore(STORE_CONFLICTS).delete(id);
  await awaitTx(tx);
}

export async function saveNoteDraft(
  uid: string,
  noteId: string,
  title: string,
  content: string
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_DRAFTS, 'readwrite');
    tx.objectStore(STORE_DRAFTS).put({
      draftKey: `${uid}:${noteId}`,
      title,
      content,
      savedAt: new Date().toISOString(),
    });
    await awaitTx(tx);
  } catch {
    // Ignore if unavailable
  }
}

export async function loadNoteDraft(
  uid: string,
  noteId: string
): Promise<{ title: string; content: string; savedAt: string } | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_DRAFTS, 'readonly');
    return await new Promise((resolve) => {
      const req = tx.objectStore(STORE_DRAFTS).get(`${uid}:${noteId}`);
      req.onsuccess = () =>
        resolve((req.result as { title: string; content: string; savedAt: string }) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearNoteDraft(uid: string, noteId: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_DRAFTS, 'readwrite');
    tx.objectStore(STORE_DRAFTS).delete(`${uid}:${noteId}`);
    await awaitTx(tx);
  } catch {
    // Ignore
  }
}

export async function clearUserOfflineData(uid: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE_RECORDS, STORE_QUEUE, STORE_DRAFTS, STORE_CONFLICTS], 'readwrite');
    const recStore = tx.objectStore(STORE_RECORDS);
    const recReq = recStore.getAllKeys();
    recReq.onsuccess = () => {
      for (const k of recReq.result) {
        if (String(k).startsWith(`${uid}:`)) recStore.delete(k);
      }
    };
    const qStore = tx.objectStore(STORE_QUEUE);
    const qReq = qStore.getAll();
    qReq.onsuccess = () => {
      for (const item of qReq.result as SyncQueueItem[]) {
        if (item.uid === uid) qStore.delete(item.id);
      }
    };
    const cStore = tx.objectStore(STORE_CONFLICTS);
    const cReq = cStore.getAll();
    cReq.onsuccess = () => {
      for (const item of cReq.result as Array<{ id: string; uid: string }>) {
        if (item.uid === uid) cStore.delete(item.id);
      }
    };
    const dStore = tx.objectStore(STORE_DRAFTS);
    const dReq = dStore.getAllKeys();
    dReq.onsuccess = () => {
      for (const k of dReq.result) {
        if (String(k).startsWith(`${uid}:`)) dStore.delete(k);
      }
    };
    await awaitTx(tx);
  } catch {
    // Ignore
  }
}

/**
 * Conflict resolution helper: never silently overwrite newer cloud data.
 */
export function detectVersionConflict(
  localUpdatedAt: string,
  remoteUpdatedAt: string,
  localVersion?: number,
  remoteVersion?: number
): boolean {
  if (localVersion !== undefined && remoteVersion !== undefined && remoteVersion > localVersion) {
    return true;
  }
  return remoteUpdatedAt > localUpdatedAt;
}
