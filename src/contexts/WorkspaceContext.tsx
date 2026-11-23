import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  clearUserOfflineData,
  detectVersionConflict,
  enqueueSyncOperation,
  readCachedCollection,
  readSyncConflicts,
  readSyncQueue,
  removeSyncConflict,
  removeSyncOperation,
  saveSyncConflict,
  updateSyncOperation,
  writeCachedCollection,
} from '../lib/offlineDb';
import {
  checkStorageQuota,
  computeBackoffDelayMs,
  type StorageQuotaStatus,
  type SyncConflict,
} from '../lib/offlineSyncUtils';
import { computeNextRecurrenceDate, getTodayKey } from '../lib/planner';
import { useAuth } from './AuthContext';
import { useTheme } from './ThemeContext';
import type {
  Assignment,
  AuditLog,
  Budget,
  CalendarEvent,
  Course,
  DashboardWidgetConfig,
  DevProject,
  DevTask,
  Goal,
  GradeRecord,
  Habit,
  HabitEntry,
  KnowledgeNote,
  NotificationItem,
  SavingsGoal,
  SyncQueueItem,
  SyncState,
  Task,
  Transaction,
  UserProfile,
  UserSettings,
  VaultFileRef,
} from '../types/nexora';

export const DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
  { id: 'priorities', label: 'Daily Priorities & Tasks', visible: true, order: 0 },
  { id: 'events', label: 'Upcoming Schedule', visible: true, order: 1 },
  { id: 'academic', label: 'Academic Deadlines', visible: true, order: 2 },
  { id: 'finance', label: 'Financial Overview', visible: true, order: 3 },
  { id: 'goals', label: 'Goals & Habit Progress', visible: true, order: 4 },
  { id: 'projects', label: 'Developer Projects', visible: true, order: 5 },
  { id: 'documents', label: 'Recent Notes & Documents', visible: true, order: 6 },
  { id: 'ai_insights', label: 'AI Planning Shortcuts', visible: true, order: 7 },
];

function buildDefaultSettings(uid: string): UserSettings {
  return {
    uid,
    theme: 'dark',
    currency: 'MWK',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Blantyre',
    dateFormat: 'YYYY-MM-DD',
    language: 'en',
    notificationsEnabled: true,
    deadlineAlerts: true,
    budgetAlerts: true,
    dashboardWidgets: DEFAULT_WIDGETS,
    updatedAt: new Date().toISOString(),
  };
}

function buildDefaultProfile(uid: string, displayName: string, email: string): UserProfile {
  const now = new Date().toISOString();
  return {
    uid,
    displayName,
    email,
    bio: '',
    roleTitle: '',
    institution: '',
    location: 'Lilongwe, Malawi',
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeTimestamp(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

interface WorkspaceContextValue {
  isOnline: boolean;
  syncState: SyncState;
  pendingSyncCount: number;
  conflicts: SyncConflict[];
  storageQuota: StorageQuotaStatus | null;
  loadingData: boolean;
  syncError: string | null;
  profile: UserProfile;
  settings: UserSettings;
  tasks: Task[];
  events: CalendarEvent[];
  courses: Course[];
  assignments: Assignment[];
  grades: GradeRecord[];
  transactions: Transaction[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  goals: Goal[];
  habits: Habit[];
  habitEntries: HabitEntry[];
  projects: DevProject[];
  devTasks: DevTask[];
  notes: KnowledgeNote[];
  vaultFiles: VaultFileRef[];
  notifications: NotificationItem[];
  auditLogs: AuditLog[];
  updateProfileData: (patch: Partial<UserProfile>) => Promise<void>;
  updateSettingsData: (patch: Partial<UserSettings>) => Promise<void>;
  saveRecord: <T extends { id: string; uid: string }>(
    col: string,
    record: Omit<T, 'id' | 'uid' | 'createdAt' | 'updatedAt'> & { id?: string },
    isUpdate?: boolean
  ) => Promise<T>;
  deleteRecord: (col: string, id: string) => Promise<void>;
  toggleTaskCompletion: (task: Task) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  logAudit: (entityType: string, entityId: string, action: AuditLog['action'], summary: string) => Promise<void>;
  retrySyncNow: (forceAll?: boolean) => Promise<void>;
  resolveConflict: (conflictId: string, strategy: 'keep_local' | 'use_cloud') => Promise<void>;
  exportAllUserData: () => Promise<string>;
  purgeCloudAndLocalAccountData: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const SYNCED_COLLECTIONS = [
  'tasks',
  'events',
  'courses',
  'assignments',
  'grades',
  'transactions',
  'budgets',
  'savingsGoals',
  'goals',
  'habits',
  'habitEntries',
  'projects',
  'developerTasks',
  'notes',
  'vaultFiles',
  'notifications',
  'auditLogs',
] as const;

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authMode, uid, displayName, email, emailVerified, getIdToken, deleteAccount } = useAuth();
  const { setTheme } = useTheme();

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncState, setSyncState] = useState<SyncState>('local_saved');
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [storageQuota, setStorageQuota] = useState<StorageQuotaStatus | null>(null);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile>(() =>
    buildDefaultProfile(uid, displayName, email)
  );
  const [settings, setSettings] = useState<UserSettings>(() => buildDefaultSettings(uid));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitEntries, setHabitEntries] = useState<HabitEntry[]>([]);
  const [projects, setProjects] = useState<DevProject[]>([]);
  const [devTasks, setDevTasks] = useState<DevTask[]>([]);
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [vaultFiles, setVaultFiles] = useState<VaultFileRef[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const isSyncingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  const getSetter = useCallback((col: string): React.Dispatch<React.SetStateAction<any[]>> | null => {
    switch (col) {
      case 'tasks': return setTasks;
      case 'events': return setEvents;
      case 'courses': return setCourses;
      case 'assignments': return setAssignments;
      case 'grades': return setGrades;
      case 'transactions': return setTransactions;
      case 'budgets': return setBudgets;
      case 'savingsGoals': return setSavingsGoals;
      case 'goals': return setGoals;
      case 'habits': return setHabits;
      case 'habitEntries': return setHabitEntries;
      case 'projects': return setProjects;
      case 'developerTasks': return setDevTasks;
      case 'notes': return setNotes;
      case 'vaultFiles': return setVaultFiles;
      case 'notifications': return setNotifications;
      case 'auditLogs': return setAuditLogs;
      default: return null;
    }
  }, []);

  const persistCacheSafe = useCallback(async <T,>(targetUid: string, col: string, items: T[]) => {
    const res = await writeCachedCollection(targetUid, col, items);
    if (!res.ok && res.error) {
      setSyncError(res.error);
    }
    const quota = await checkStorageQuota();
    setStorageQuota(quota);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    checkStorageQuota().then(setStorageQuota);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Load isolated IndexedDB cache whenever uid/authMode changes
  useEffect(() => {
    if (authMode === 'loading' || authMode === 'unauthenticated') {
      setLoadingData(false);
      return;
    }
    let cancelled = false;
    setLoadingData(true);

    (async () => {
      const [cachedProfile] = await readCachedCollection<UserProfile>(uid, 'profile');
      const [cachedSettings] = await readCachedCollection<UserSettings>(uid, 'settings');
      if (!cancelled) {
        setProfile(cachedProfile ?? buildDefaultProfile(uid, displayName, email));
        if (cachedSettings) {
          setSettings(cachedSettings);
          setTheme(cachedSettings.theme);
        } else {
          setSettings(buildDefaultSettings(uid));
        }
      }

      for (const col of SYNCED_COLLECTIONS) {
        const items = await readCachedCollection<any>(uid, col);
        if (!cancelled) {
          getSetter(col)?.(items);
        }
      }
      const q = await readSyncQueue(uid);
      const savedConflicts = await readSyncConflicts(uid);
      if (!cancelled) {
        setPendingSyncCount(q.length);
        setConflicts(savedConflicts);
        setSyncState(
          savedConflicts.length > 0
            ? 'conflict'
            : authMode === 'local'
            ? 'local_saved'
            : q.length > 0
            ? 'waiting_sync'
            : 'synced'
        );
        setLoadingData(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authMode, uid, displayName, email, getSetter, setTheme]);

  // Attach Firestore listeners ONLY when authenticated AND emailVerified
  useEffect(() => {
    if (authMode !== 'cloud' || !uid || !emailVerified) return;

    let active = true;
    const unsubs: Array<() => void> = [];

    const bootstrapAndListen = async () => {
      // Ensure ID token reflects email_verified: true before initial writes
      await getIdToken(false);

      try {
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid,
            email: email || `${uid}@nexora.app`,
            displayName: displayName || 'NEXORA User',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        const profRef = doc(db, 'users', uid, 'profile', 'main');
        const profSnap = await getDoc(profRef);
        if (!profSnap.exists()) {
          await setDoc(profRef, {
            uid,
            displayName: displayName || 'NEXORA User',
            email: email || `${uid}@nexora.app`,
            bio: '',
            roleTitle: '',
            institution: '',
            location: 'Lilongwe, Malawi',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        const setRef = doc(db, 'users', uid, 'settings', 'preferences');
        const setSnap = await getDoc(setRef);
        if (!setSnap.exists()) {
          const def = buildDefaultSettings(uid);
          await setDoc(setRef, {
            ...def,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn('Initial cloud profile bootstrap note:', err);
      }

      if (!active) return;

      unsubs.push(
        onSnapshot(
          doc(db, 'users', uid, 'profile', 'main'),
          (snap) => {
            if (!active || !snap.exists()) return;
            const data = snap.data();
            const nextProfile: UserProfile = {
              uid: data.uid,
              displayName: data.displayName,
              email: data.email,
              bio: data.bio ?? '',
              roleTitle: data.roleTitle ?? '',
              institution: data.institution ?? '',
              location: data.location ?? '',
              createdAt: normalizeTimestamp(data.createdAt),
              updatedAt: normalizeTimestamp(data.updatedAt),
            };
            setProfile(nextProfile);
            persistCacheSafe(uid, 'profile', [nextProfile]);
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, `users/${uid}/profile/main`);
          }
        )
      );

      unsubs.push(
        onSnapshot(
          doc(db, 'users', uid, 'settings', 'preferences'),
          (snap) => {
            if (!active || !snap.exists()) return;
            const data = snap.data();
            const nextSettings: UserSettings = {
              uid: data.uid,
              theme: data.theme ?? 'dark',
              currency: data.currency ?? 'MWK',
              timezone: data.timezone ?? 'Africa/Blantyre',
              dateFormat: data.dateFormat ?? 'YYYY-MM-DD',
              language: data.language ?? 'en',
              notificationsEnabled: Boolean(data.notificationsEnabled ?? true),
              deadlineAlerts: Boolean(data.deadlineAlerts ?? true),
              budgetAlerts: Boolean(data.budgetAlerts ?? true),
              dashboardWidgets: Array.isArray(data.dashboardWidgets)
                ? data.dashboardWidgets
                : DEFAULT_WIDGETS,
              updatedAt: normalizeTimestamp(data.updatedAt),
            };
            setSettings(nextSettings);
            setTheme(nextSettings.theme);
            persistCacheSafe(uid, 'settings', [nextSettings]);
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, `users/${uid}/settings/preferences`);
          }
        )
      );

      for (const col of SYNCED_COLLECTIONS) {
        const pathStr = `users/${uid}/${col}`;
        const q = query(collection(db, pathStr), where('uid', '==', uid));
        const unsub = onSnapshot(
          q,
          (snapshot) => {
            if (!active) return;
            const items = snapshot.docs.map((d) => {
              const raw = d.data();
              return {
                ...raw,
                id: d.id,
                createdAt: normalizeTimestamp(raw.createdAt),
                updatedAt: raw.updatedAt ? normalizeTimestamp(raw.updatedAt) : undefined,
              };
            });
            getSetter(col)?.(items);
            persistCacheSafe(uid, col, items);
            setSyncError(null);
          },
          (err) => {
            console.error(`Snapshot error on ${pathStr}:`, err);
            setSyncState('sync_failed');
            setSyncError(`Unable to sync ${col}. Cached data remains safe.`);
            handleFirestoreError(err, OperationType.LIST, pathStr);
          }
        );
        unsubs.push(unsub);
      }
    };

    bootstrapAndListen();

    return () => {
      active = false;
      for (const u of unsubs) u();
    };
  }, [authMode, uid, emailVerified, displayName, email, getIdToken, getSetter, persistCacheSafe, setTheme]);

  const flushSyncQueue = useCallback(
    async (forceAll = false) => {
      if (authMode !== 'cloud' || !isOnline || !emailVerified || isSyncingRef.current) return;
      const queueItems = await readSyncQueue(uid);
      const currentConflicts = await readSyncConflicts(uid);

      if (queueItems.length === 0) {
        setPendingSyncCount(0);
        setSyncState(currentConflicts.length > 0 ? 'conflict' : 'synced');
        return;
      }

      isSyncingRef.current = true;
      setSyncState('syncing');

      let minNextDelayMs: number | null = null;

      for (const item of queueItems) {
        if (!forceAll && item.nextRetryAt) {
          const waitMs = Date.parse(item.nextRetryAt) - Date.now();
          if (waitMs > 0) {
            minNextDelayMs = minNextDelayMs === null ? waitMs : Math.min(minNextDelayMs, waitMs);
            continue;
          }
        }

        try {
          const ref = doc(db, `users/${uid}/${item.collectionName}`, item.docId);

          if (item.operation === 'update' && item.payload) {
            // Check remote document for version/timestamp conflicts before overwriting
            const remoteSnap = await getDoc(ref);
            if (remoteSnap.exists()) {
              const remoteData = remoteSnap.data();
              const remoteUpdatedAt = normalizeTimestamp(remoteData.updatedAt);
              const remoteVersion =
                typeof remoteData.version === 'number' ? remoteData.version : undefined;
              const baseUpdatedAt = item.baseUpdatedAt ?? item.createdAt;
              if (
                detectVersionConflict(
                  baseUpdatedAt,
                  remoteUpdatedAt,
                  item.baseVersion,
                  remoteVersion
                )
              ) {
                const conflict: SyncConflict = {
                  id: `conf_${item.id}`,
                  collectionName: item.collectionName,
                  docId: item.docId,
                  label: String(item.payload.title || item.payload.name || item.payload.category || item.docId),
                  localPayload: item.payload,
                  remotePayload: {
                    ...remoteData,
                    id: remoteSnap.id,
                    createdAt: normalizeTimestamp(remoteData.createdAt),
                    updatedAt: remoteUpdatedAt,
                  },
                  localUpdatedAt: String(item.payload.updatedAt ?? item.createdAt),
                  remoteUpdatedAt,
                  detectedAt: new Date().toISOString(),
                };
                await saveSyncConflict(uid, conflict);
                await removeSyncOperation(item.id);
                setConflicts(await readSyncConflicts(uid));
                setSyncState('conflict');
                continue;
              }
            }
          }

          if (item.operation === 'delete') {
            await deleteDoc(ref);
          } else if (item.operation === 'create' && item.payload) {
            const cleanPayload: Record<string, unknown> = { ...item.payload };
            delete cleanPayload.id;
            delete cleanPayload.syncState;
            cleanPayload.createdAt = serverTimestamp();
            if ('updatedAt' in cleanPayload) {
              cleanPayload.updatedAt = serverTimestamp();
            }
            await setDoc(ref, cleanPayload);
          } else if (item.operation === 'update' && item.payload) {
            const cleanPayload: Record<string, unknown> = { ...item.payload };
            delete cleanPayload.id;
            delete cleanPayload.uid;
            delete cleanPayload.createdAt;
            delete cleanPayload.syncState;
            if ('updatedAt' in cleanPayload) {
              cleanPayload.updatedAt = serverTimestamp();
            }
            await updateDoc(ref, cleanPayload);
          }

          await removeSyncOperation(item.id);
        } catch (err) {
          const attempts = (item.attempts || 0) + 1;
          const delayMs = computeBackoffDelayMs(attempts);
          const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
          const msg = err instanceof Error ? err.message : 'Sync failed';
          await updateSyncOperation({
            ...item,
            attempts,
            nextRetryAt,
            lastError: msg,
          });
          minNextDelayMs = minNextDelayMs === null ? delayMs : Math.min(minNextDelayMs, delayMs);
          setSyncState('sync_failed');
          setSyncError(
            `${msg}. Retrying automatically in ${Math.max(1, Math.round(delayMs / 1000))}s.`
          );
        }
      }

      const remaining = await readSyncQueue(uid);
      const nextConflicts = await readSyncConflicts(uid);
      setPendingSyncCount(remaining.length);
      setConflicts(nextConflicts);

      if (nextConflicts.length > 0) {
        setSyncState('conflict');
      } else if (remaining.length === 0) {
        setSyncState('synced');
        setSyncError(null);
      } else if (minNextDelayMs !== null && isOnline) {
        setSyncState('waiting_sync');
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          flushSyncQueue(false);
        }, minNextDelayMs);
      }

      isSyncingRef.current = false;
    },
    [authMode, isOnline, emailVerified, uid]
  );

  useEffect(() => {
    if (isOnline && authMode === 'cloud' && emailVerified) {
      flushSyncQueue(false);
    }
    return () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    };
  }, [isOnline, authMode, emailVerified, flushSyncQueue]);

  const resolveConflict = async (conflictId: string, strategy: 'keep_local' | 'use_cloud') => {
    const conflict = conflicts.find((c) => c.id === conflictId);
    if (!conflict) return;

    const ref = doc(db, `users/${uid}/${conflict.collectionName}`, conflict.docId);
    if (strategy === 'keep_local') {
      const cleanPayload: Record<string, unknown> = { ...conflict.localPayload };
      delete cleanPayload.id;
      delete cleanPayload.uid;
      delete cleanPayload.createdAt;
      delete cleanPayload.syncState;
      cleanPayload.updatedAt = serverTimestamp();
      if (typeof cleanPayload.version === 'number') {
        const remoteVer = Number(conflict.remotePayload.version || 1);
        cleanPayload.version = Math.max(cleanPayload.version, remoteVer) + 1;
      }
      await updateDoc(ref, cleanPayload);
    } else {
      const setter = getSetter(conflict.collectionName);
      if (setter) {
        setter((prev) => {
          const updated = prev.map((item) =>
            item.id === conflict.docId ? conflict.remotePayload : item
          );
          persistCacheSafe(uid, conflict.collectionName, updated);
          return updated;
        });
      }
    }

    await removeSyncConflict(conflictId);
    const remainingConflicts = await readSyncConflicts(uid);
    setConflicts(remainingConflicts);
    const remainingQueue = await readSyncQueue(uid);
    setSyncState(
      remainingConflicts.length > 0
        ? 'conflict'
        : remainingQueue.length > 0
        ? 'waiting_sync'
        : 'synced'
    );
  };

  const updateProfileData = async (patch: Partial<UserProfile>) => {
    const now = new Date().toISOString();
    const next: UserProfile = {
      ...profile,
      ...patch,
      uid,
      updatedAt: now,
    };
    setProfile(next);
    await persistCacheSafe(uid, 'profile', [next]);

    if (authMode === 'cloud' && isOnline && emailVerified) {
      const pathStr = `users/${uid}/profile/main`;
      try {
        await setDoc(
          doc(db, `users/${uid}/profile`, 'main'),
          {
            uid,
            displayName: next.displayName,
            email: next.email,
            bio: next.bio ?? '',
            roleTitle: next.roleTitle ?? '',
            institution: next.institution ?? '',
            location: next.location ?? '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, pathStr);
      }
    }
  };

  const updateSettingsData = async (patch: Partial<UserSettings>) => {
    const now = new Date().toISOString();
    const next: UserSettings = {
      ...settings,
      ...patch,
      uid,
      updatedAt: now,
    };
    setSettings(next);
    if (patch.theme) setTheme(patch.theme);
    await persistCacheSafe(uid, 'settings', [next]);

    if (authMode === 'cloud' && isOnline && emailVerified) {
      const pathStr = `users/${uid}/settings/preferences`;
      try {
        await setDoc(
          doc(db, `users/${uid}/settings`, 'preferences'),
          {
            uid,
            theme: next.theme,
            currency: next.currency,
            timezone: next.timezone,
            dateFormat: next.dateFormat,
            language: next.language,
            notificationsEnabled: next.notificationsEnabled,
            deadlineAlerts: next.deadlineAlerts,
            budgetAlerts: next.budgetAlerts,
            dashboardWidgets: next.dashboardWidgets,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, pathStr);
      }
    }
  };

  const saveRecord = async <T extends { id: string; uid: string }>(
    col: string,
    recordInput: Omit<T, 'id' | 'uid' | 'createdAt' | 'updatedAt'> & { id?: string },
    isUpdate = false
  ): Promise<T> => {
    const now = new Date().toISOString();
    const docId = recordInput.id || makeId(col.slice(0, 4));
    const hasUpdatedAt = col !== 'habitEntries' && col !== 'notifications' && col !== 'auditLogs';

    const setter = getSetter(col);
    let existingCreatedAt = now;
    let baseUpdatedAt = now;
    let baseVersion: number | undefined;

    if (setter) {
      setter((prev) => {
        const existingItem = prev.find((item) => item.id === docId);
        if (existingItem?.createdAt) existingCreatedAt = existingItem.createdAt;
        if (existingItem?.updatedAt) baseUpdatedAt = existingItem.updatedAt;
        if (typeof existingItem?.version === 'number') baseVersion = existingItem.version;
        const fullItem = {
          ...existingItem,
          ...recordInput,
          id: docId,
          uid,
          createdAt: existingCreatedAt,
          ...(hasUpdatedAt ? { updatedAt: now } : {}),
        };
        const updatedList = isUpdate
          ? prev.map((item) => (item.id === docId ? fullItem : item))
          : [fullItem, ...prev.filter((item) => item.id !== docId)];
        persistCacheSafe(uid, col, updatedList);
        return updatedList;
      });
    }

    const fullRecord = {
      ...recordInput,
      id: docId,
      uid,
      createdAt: existingCreatedAt,
      ...(hasUpdatedAt ? { updatedAt: now } : {}),
    } as unknown as T;

    if (authMode !== 'cloud') {
      setSyncState('local_saved');
      return fullRecord;
    }

    if (!isOnline || !emailVerified) {
      const qItem: SyncQueueItem = {
        id: makeId('sync'),
        uid,
        collectionName: col,
        docId,
        operation: isUpdate ? 'update' : 'create',
        payload: fullRecord as unknown as Record<string, unknown>,
        createdAt: now,
        attempts: 0,
        baseUpdatedAt,
        baseVersion,
      };
      await enqueueSyncOperation(qItem);
      const q = await readSyncQueue(uid);
      setPendingSyncCount(q.length);
      setSyncState('waiting_sync');
      return fullRecord;
    }

    const docPath = `users/${uid}/${col}/${docId}`;
    try {
      setSyncState('syncing');
      const ref = doc(db, `users/${uid}/${col}`, docId);
      const cleanPayload: Record<string, unknown> = { ...(recordInput as Record<string, unknown>), uid };
      delete cleanPayload.id;
      delete cleanPayload.syncState;
      for (const k of Object.keys(cleanPayload)) {
        if (cleanPayload[k] === undefined) delete cleanPayload[k];
      }

      if (isUpdate) {
        if (hasUpdatedAt) cleanPayload.updatedAt = serverTimestamp();
        delete cleanPayload.uid;
        delete cleanPayload.createdAt;
        await updateDoc(ref, cleanPayload);
      } else {
        cleanPayload.createdAt = serverTimestamp();
        if (hasUpdatedAt) cleanPayload.updatedAt = serverTimestamp();
        await setDoc(ref, cleanPayload);
      }
      setSyncState(conflicts.length > 0 ? 'conflict' : 'synced');
      return fullRecord;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('offline')) {
        await enqueueSyncOperation({
          id: makeId('sync'),
          uid,
          collectionName: col,
          docId,
          operation: isUpdate ? 'update' : 'create',
          payload: fullRecord as unknown as Record<string, unknown>,
          createdAt: now,
          attempts: 1,
          nextRetryAt: new Date(Date.now() + computeBackoffDelayMs(1)).toISOString(),
          baseUpdatedAt,
          baseVersion,
          lastError: msg,
        });
        const q = await readSyncQueue(uid);
        setPendingSyncCount(q.length);
        setSyncState('waiting_sync');
        return fullRecord;
      }
      setSyncState('sync_failed');
      handleFirestoreError(err, isUpdate ? OperationType.UPDATE : OperationType.CREATE, docPath);
    }
  };

  const deleteRecord = async (col: string, id: string): Promise<void> => {
    const setter = getSetter(col);
    if (setter) {
      setter((prev) => {
        const next = prev.filter((item) => item.id !== id);
        persistCacheSafe(uid, col, next);
        return next;
      });
    }

    if (authMode !== 'cloud') {
      setSyncState('local_saved');
      return;
    }

    if (!isOnline || !emailVerified) {
      await enqueueSyncOperation({
        id: makeId('sync'),
        uid,
        collectionName: col,
        docId: id,
        operation: 'delete',
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      const q = await readSyncQueue(uid);
      setPendingSyncCount(q.length);
      setSyncState('waiting_sync');
      return;
    }

    const docPath = `users/${uid}/${col}/${id}`;
    try {
      await deleteDoc(doc(db, `users/${uid}/${col}`, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  };

  const toggleTaskCompletion = async (task: Task): Promise<void> => {
    const nextStatus: Task['status'] = task.status === 'completed' ? 'todo' : 'completed';
    await saveRecord<Task>(
      'tasks',
      {
        id: task.id,
        title: task.title,
        notes: task.notes,
        priority: task.priority,
        status: nextStatus,
        dueDate: task.dueDate,
        category: task.category,
        recurring: task.recurring,
        subtasks: task.subtasks,
        version: (task.version || 1) + 1,
      },
      true
    );

    if (nextStatus === 'completed' && task.recurring !== 'none') {
      const todayKey = getTodayKey(settings.timezone);
      const nextDue = computeNextRecurrenceDate(task.dueDate, task.recurring, todayKey);
      if (nextDue) {
        await saveRecord<Task>(
          'tasks',
          {
            title: task.title,
            notes: task.notes,
            priority: task.priority,
            status: 'todo',
            dueDate: nextDue,
            category: task.category,
            recurring: task.recurring,
            subtasks: task.subtasks?.map((s) => ({ ...s, completed: false })),
            version: 1,
          },
          false
        );
      }
    }
  };

  const markNotificationRead = async (id: string) => {
    const item = notifications.find((n) => n.id === id);
    if (!item || item.read) return;
    await saveRecord<NotificationItem>(
      'notifications',
      { id: item.id, title: item.title, body: item.body, category: item.category, read: true },
      true
    );
  };

  const clearAllNotifications = async () => {
    for (const n of notifications) {
      await deleteRecord('notifications', n.id);
    }
  };

  const logAudit = async (
    entityType: string,
    entityId: string,
    action: AuditLog['action'],
    summary: string
  ) => {
    await saveRecord<AuditLog>(
      'auditLogs',
      {
        entityType: entityType.slice(0, 40),
        entityId: entityId.slice(0, 128),
        action,
        summary: summary.slice(0, 300),
      },
      false
    );
  };

  const exportAllUserData = async (): Promise<string> => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      application: 'NEXORA',
      profile,
      settings,
      tasks,
      events,
      courses,
      assignments,
      grades,
      transactions,
      budgets,
      savingsGoals,
      goals,
      habits,
      habitEntries,
      projects,
      developerTasks: devTasks,
      notes,
      vaultFiles,
      notifications,
      auditLogs,
    };
    await logAudit('account', uid, 'export', 'Exported complete personal NEXORA data archive');
    return JSON.stringify(bundle, null, 2);
  };

  const purgeCloudAndLocalAccountData = async () => {
    if (authMode === 'cloud') {
      const deletableCols = SYNCED_COLLECTIONS.filter((c) => c !== 'auditLogs');
      for (const col of deletableCols) {
        const snap = await getDocs(query(collection(db, `users/${uid}/${col}`), where('uid', '==', uid)));
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
        }
      }
      await deleteDoc(doc(db, `users/${uid}/profile`, 'main')).catch(() => {});
      await deleteDoc(doc(db, `users/${uid}/settings`, 'preferences')).catch(() => {});
      await deleteDoc(doc(db, 'users', uid)).catch(() => {});
    }
    await clearUserOfflineData(uid);
    await deleteAccount();
  };

  return (
    <WorkspaceContext.Provider
      value={{
        isOnline,
        syncState,
        pendingSyncCount,
        conflicts,
        storageQuota,
        loadingData,
        syncError,
        profile,
        settings,
        tasks,
        events,
        courses,
        assignments,
        grades,
        transactions,
        budgets,
        savingsGoals,
        goals,
        habits,
        habitEntries,
        projects,
        devTasks,
        notes,
        vaultFiles,
        notifications,
        auditLogs,
        updateProfileData,
        updateSettingsData,
        saveRecord,
        deleteRecord,
        toggleTaskCompletion,
        markNotificationRead,
        clearAllNotifications,
        logAudit,
        retrySyncNow: flushSyncQueue,
        resolveConflict,
        exportAllUserData,
        purgeCloudAndLocalAccountData,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
