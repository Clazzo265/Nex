export interface LocalWorkspaceProfile {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string;
  pinHash?: string;
}

const REGISTRY_KEY = 'nexora_local_workspaces_v1';
const ACTIVE_LOCAL_ID_KEY = 'nexora_active_local_workspace_id';
const LEGACY_LOCAL_UID = 'local_offline_user';

function safeStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, val);
  } catch {
    // Ignore when storage unavailable
  }
}

export function listLocalWorkspaces(): LocalWorkspaceProfile[] {
  const raw = safeStorageGet(REGISTRY_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as LocalWorkspaceProfile[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Fall through to legacy default
    }
  }

  const now = new Date().toISOString();
  const initial: LocalWorkspaceProfile[] = [
    {
      id: LEGACY_LOCAL_UID,
      label: 'Personal Device Workspace',
      createdAt: now,
      lastUsedAt: now,
    },
  ];
  safeStorageSet(REGISTRY_KEY, JSON.stringify(initial));
  return initial;
}

export function getActiveLocalWorkspaceId(): string {
  const active = safeStorageGet(ACTIVE_LOCAL_ID_KEY);
  const all = listLocalWorkspaces();
  if (active && all.some((w) => w.id === active)) {
    return active;
  }
  const fallback = all[0].id;
  safeStorageSet(ACTIVE_LOCAL_ID_KEY, fallback);
  return fallback;
}

export function setActiveLocalWorkspaceId(id: string): void {
  const all = listLocalWorkspaces();
  const now = new Date().toISOString();
  const updated = all.map((w) => (w.id === id ? { ...w, lastUsedAt: now } : w));
  safeStorageSet(REGISTRY_KEY, JSON.stringify(updated));
  safeStorageSet(ACTIVE_LOCAL_ID_KEY, id);
}

export async function hashWorkspacePin(workspaceId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`nexora_pin:${workspaceId}:${pin.trim()}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic fallback for restricted non-secure environments
  let hash = 0;
  for (const byte of data) {
    hash = (hash * 31 + byte) >>> 0;
  }
  return hash.toString(16);
}

export async function verifyWorkspacePin(
  profile: LocalWorkspaceProfile,
  candidatePin: string
): Promise<boolean> {
  if (!profile.pinHash) return true;
  const candidateHash = await hashWorkspacePin(profile.id, candidatePin);
  return candidateHash === profile.pinHash;
}

export async function createLocalWorkspace(
  label: string,
  pin?: string
): Promise<LocalWorkspaceProfile> {
  const cleanLabel = label.trim().slice(0, 60) || 'Offline Workspace';
  const id = `local_ws_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const pinHash = pin && pin.trim().length >= 4 ? await hashWorkspacePin(id, pin.trim()) : undefined;
  const profile: LocalWorkspaceProfile = {
    id,
    label: cleanLabel,
    createdAt: now,
    lastUsedAt: now,
    ...(pinHash ? { pinHash } : {}),
  };
  const all = [...listLocalWorkspaces(), profile];
  safeStorageSet(REGISTRY_KEY, JSON.stringify(all));
  safeStorageSet(ACTIVE_LOCAL_ID_KEY, id);
  return profile;
}

export function renameLocalWorkspace(id: string, nextLabel: string): LocalWorkspaceProfile[] {
  const clean = nextLabel.trim().slice(0, 60);
  if (!clean) return listLocalWorkspaces();
  const updated = listLocalWorkspaces().map((w) => (w.id === id ? { ...w, label: clean } : w));
  safeStorageSet(REGISTRY_KEY, JSON.stringify(updated));
  return updated;
}

export async function setLocalWorkspacePin(id: string, pin: string | null): Promise<LocalWorkspaceProfile[]> {
  const all = listLocalWorkspaces();
  const updated = await Promise.all(
    all.map(async (w) => {
      if (w.id !== id) return w;
      if (!pin || pin.trim().length < 4) {
        const { pinHash: _removed, ...rest } = w;
        return rest;
      }
      return { ...w, pinHash: await hashWorkspacePin(id, pin.trim()) };
    })
  );
  safeStorageSet(REGISTRY_KEY, JSON.stringify(updated));
  return updated;
}
