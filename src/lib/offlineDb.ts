import type { SyncQueueItem } from '../types/nexora';

const DB_NAME = 'nexora_offline_store';
const DB_VERSION = 1;
const STORE_RECORDS = 'records';
const STORE_QUEUE = 'sync_queue';
const STORE_DRAFTS = 'note_drafts';

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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
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
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_RECORDS, 'readwrite');
    const store = tx.objectStore(STORE_RECORDS);
    store.put({
      storageKey: `${uid}:${collectionName}`,
      items,
      cachedAt: new Date().toISOString(),
    });
  } catch {
    // Graceful no-op when storage quota or private mode blocks IndexedDB
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
}

export async function removeSyncOperation(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).delete(id);
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
      req.onsuccess = () => resolve((req.result as { title: string; content: string; savedAt: string }) ?? null);
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
  } catch {
    // Ignore
  }
}

export async function clearUserOfflineData(uid: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE_RECORDS, STORE_QUEUE, STORE_DRAFTS], 'readwrite');
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
    const dStore = tx.objectStore(STORE_DRAFTS);
    const dReq = dStore.getAllKeys();
    dReq.onsuccess = () => {
      for (const k of dReq.result) {
        if (String(k).startsWith(`${uid}:`)) dStore.delete(k);
      }
    };
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
