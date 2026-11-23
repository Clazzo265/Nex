import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  getRedirectResult,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  unlink,
  updateProfile,
  type AuthCredential,
  type User,
} from 'firebase/auth';
import {
  extractFirebaseErrorCode,
  mapFirebaseAuthError,
  shouldPreferRedirectAuth,
  type AuthProviderId,
  type RegistrationState,
  type SocialProviderId,
} from '../lib/authUtils';
import { auth, extractPendingCredential, getAuthProviderInstance, testConnection } from '../lib/firebase';
import {
  createLocalWorkspace,
  getActiveLocalWorkspaceId,
  listLocalWorkspaces,
  renameLocalWorkspace,
  setActiveLocalWorkspaceId,
  setLocalWorkspacePin,
  verifyWorkspacePin,
  type LocalWorkspaceProfile,
} from '../lib/localWorkspaces';

export type AuthMode = 'loading' | 'unauthenticated' | 'cloud' | 'local';

export interface PendingAccountLink {
  email: string;
  attemptedProviderId: SocialProviderId;
  pendingCredential: AuthCredential;
  existingMethods: string[];
}

export interface ConnectedProviderInfo {
  providerId: string;
  email: string | null;
  displayName: string | null;
  uid: string;
}

interface AuthContextValue {
  user: User | null;
  authMode: AuthMode;
  registrationState: RegistrationState;
  firebaseReachable: boolean;
  uid: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  connectedProviders: ConnectedProviderInfo[];
  pendingAccountLink: PendingAccountLink | null;
  localWorkspaces: LocalWorkspaceProfile[];
  activeLocalWorkspace: LocalWorkspaceProfile | null;
  localWorkspaceLocked: boolean;
  preferRedirectAuth: boolean;
  setPreferRedirectAuth: (prefer: boolean) => void;
  signInWithProvider: (providerId: SocialProviderId, forceRedirect?: boolean) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  sendResetEmail: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshAuthUser: () => Promise<boolean>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  linkProviderWithPopup: (providerId: SocialProviderId) => Promise<void>;
  unlinkAuthProvider: (providerId: string) => Promise<void>;
  reauthenticateWithSocialPopup: (providerId: SocialProviderId) => Promise<void>;
  reauthenticateWithPassword: (password: string) => Promise<void>;
  clearPendingAccountLink: () => void;
  enterLocalOfflineMode: (workspaceId?: string) => void;
  createLocalWorkspaceProfile: (label: string, pin?: string) => Promise<LocalWorkspaceProfile>;
  switchLocalWorkspace: (workspaceId: string) => void;
  unlockLocalWorkspace: (pin: string) => Promise<boolean>;
  lockLocalWorkspace: () => void;
  renameActiveLocalWorkspace: (label: string) => void;
  updateActiveLocalWorkspacePin: (pin: string | null) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOCAL_STORAGE_FLAG = 'nexora_local_offline_mode';
const PENDING_REDIRECT_KEY = 'nexora_pending_redirect_provider';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('loading');
  const [registrationState, setRegistrationState] = useState<RegistrationState>('idle');
  const [firebaseReachable, setFirebaseReachable] = useState<boolean>(true);
  const [pendingAccountLink, setPendingAccountLink] = useState<PendingAccountLink | null>(null);
  const [preferRedirectAuth, setPreferRedirectAuth] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? shouldPreferRedirectAuth(navigator.userAgent || '', window.innerWidth)
      : false
  );

  const [localWorkspaces, setLocalWorkspaces] = useState<LocalWorkspaceProfile[]>(() =>
    listLocalWorkspaces()
  );
  const [activeLocalId, setActiveLocalId] = useState<string>(() => getActiveLocalWorkspaceId());
  const [localWorkspaceLocked, setLocalWorkspaceLocked] = useState<boolean>(false);

  const activeLocalWorkspace =
    localWorkspaces.find((w) => w.id === activeLocalId) ?? localWorkspaces[0] ?? null;

  const completePendingLinkIfPresent = useCallback(
    async (signedInUser: User, pending: PendingAccountLink | null) => {
      if (!pending) return;
      await linkWithCredential(signedInUser, pending.pendingCredential);
      await signedInUser.reload();
      await signedInUser.getIdToken(true);
      setPendingAccountLink(null);
      setUser(auth.currentUser ? ({ ...auth.currentUser } as User) : signedInUser);
    },
    []
  );

  const handleProviderCollision = useCallback(
    async (error: unknown, attemptedProviderId: SocialProviderId): Promise<never> => {
      const code = extractFirebaseErrorCode(error);
      if (code === 'auth/account-exists-with-different-credential') {
        const rawEmail =
          error &&
          typeof error === 'object' &&
          'customData' in error
            ? (error as { customData?: { email?: unknown } }).customData?.email
            : undefined;
        const customEmail = typeof rawEmail === 'string' && rawEmail.trim().length > 0 ? rawEmail.trim() : null;
        const pendingCred = extractPendingCredential(error);
        if (customEmail && pendingCred) {
          let existingMethods: string[] = [];
          try {
            existingMethods = await fetchSignInMethodsForEmail(auth, customEmail);
          } catch {
            existingMethods = [];
          }
          setPendingAccountLink({
            email: customEmail,
            attemptedProviderId,
            pendingCredential: pendingCred,
            existingMethods,
          });
        }
      }
      throw error;
    },
    []
  );

  useEffect(() => {
    testConnection().then((res) => setFirebaseReachable(res.reachable));

    // Handle redirect-based OAuth callback if returning from signInWithRedirect
    (async () => {
      let attemptedProvider: SocialProviderId = 'google.com';
      try {
        const stored = sessionStorage.getItem(PENDING_REDIRECT_KEY) as SocialProviderId | null;
        if (stored) attemptedProvider = stored;
        sessionStorage.removeItem(PENDING_REDIRECT_KEY);
      } catch {
        // Ignore
      }
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          setUser(result.user);
          setAuthMode('cloud');
          setRegistrationState(result.user.emailVerified ? 'authenticated' : 'verification_pending');
        }
      } catch (err) {
        const code = extractFirebaseErrorCode(err);
        if (code === 'auth/account-exists-with-different-credential') {
          await handleProviderCollision(err, attemptedProvider).catch(() => {});
        }
      }
    })();

    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart') === '1';
    const savedLocal = (() => {
      try {
        return localStorage.getItem(LOCAL_STORAGE_FLAG) === '1';
      } catch {
        return false;
      }
    })();

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setAuthMode('cloud');
        setRegistrationState(firebaseUser.emailVerified ? 'authenticated' : 'verification_pending');
        try {
          localStorage.removeItem(LOCAL_STORAGE_FLAG);
        } catch {
          // Ignore
        }
      } else {
        setUser(null);
        if (autostart || savedLocal) {
          const active = listLocalWorkspaces().find((w) => w.id === getActiveLocalWorkspaceId());
          setLocalWorkspaceLocked(Boolean(active?.pinHash && !autostart));
          setAuthMode('local');
          setRegistrationState('idle');
        } else {
          setAuthMode('unauthenticated');
          setRegistrationState('idle');
        }
      }
    });

    return () => unsub();
  }, [handleProviderCollision]);

  const signInWithProvider = async (providerId: SocialProviderId, forceRedirect = false) => {
    const provider = getAuthProviderInstance(providerId);
    const useRedirect = forceRedirect || preferRedirectAuth;
    if (useRedirect) {
      try {
        sessionStorage.setItem(PENDING_REDIRECT_KEY, providerId);
      } catch {
        // Ignore
      }
      await signInWithRedirect(auth, provider);
      return;
    }

    try {
      const cred = await signInWithPopup(auth, provider);
      if (pendingAccountLink) {
        await completePendingLinkIfPresent(cred.user, pendingAccountLink);
      }
      await cred.user.getIdToken(true);
      setUser(cred.user);
      setAuthMode('cloud');
      setRegistrationState(cred.user.emailVerified ? 'authenticated' : 'verification_pending');
    } catch (err) {
      const code = extractFirebaseErrorCode(err);
      if (code === 'auth/popup-blocked') {
        setPreferRedirectAuth(true);
      }
      if (code === 'auth/account-exists-with-different-credential') {
        await handleProviderCollision(err, providerId);
      }
      throw err;
    }
  };

  const signInWithEmail = async (emailVal: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, emailVal, password);
    if (pendingAccountLink) {
      await completePendingLinkIfPresent(cred.user, pendingAccountLink);
    }
    await cred.user.reload();
    await cred.user.getIdToken(true);
    setUser(cred.user);
    setAuthMode('cloud');
    setRegistrationState(cred.user.emailVerified ? 'authenticated' : 'verification_pending');
  };

  const registerWithEmail = async (name: string, emailVal: string, password: string) => {
    setRegistrationState('registration_started');
    try {
      const cred = await createUserWithEmailAndPassword(auth, emailVal, password);
      await updateProfile(cred.user, { displayName: name.trim() });
      await sendEmailVerification(cred.user);
      setUser(cred.user);
      setAuthMode('cloud');
      setRegistrationState('verification_pending');
    } catch (err) {
      setRegistrationState('registration_failed');
      throw err;
    }
  };

  const sendResetEmail = async (emailVal: string) => {
    await sendPasswordResetEmail(auth, emailVal);
  };

  const resendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const refreshAuthUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    // Force token refresh so Firestore security rules immediately observe email_verified == true
    await auth.currentUser.getIdToken(true);
    const refreshed = auth.currentUser;
    setUser({ ...refreshed } as User);
    if (refreshed.emailVerified) {
      setRegistrationState('verified');
      setRegistrationState('profile_initializing');
      setRegistrationState('authenticated');
      return true;
    }
    setRegistrationState('verification_pending');
    return false;
  };

  const getIdToken = async (forceRefresh = false): Promise<string | null> => {
    if (authMode !== 'cloud' || !auth.currentUser) return null;
    try {
      return await auth.currentUser.getIdToken(forceRefresh);
    } catch {
      return null;
    }
  };

  const linkProviderWithPopup = async (providerId: SocialProviderId) => {
    if (!auth.currentUser) {
      throw new Error('Sign in with a cloud account before linking additional providers.');
    }
    const provider = getAuthProviderInstance(providerId);
    const result = await linkWithPopup(auth.currentUser, provider);
    await result.user.reload();
    await result.user.getIdToken(true);
    setUser({ ...result.user } as User);
  };

  const unlinkAuthProvider = async (providerId: string) => {
    if (!auth.currentUser) {
      throw new Error('No authenticated cloud account.');
    }
    if ((auth.currentUser.providerData?.length ?? 0) <= 1) {
      throw new Error('Cannot unlink your only remaining sign-in method.');
    }
    const updated = await unlink(auth.currentUser, providerId);
    await updated.reload();
    setUser({ ...updated } as User);
  };

  const reauthenticateWithSocialPopup = async (providerId: SocialProviderId) => {
    if (!auth.currentUser) throw new Error('No active session.');
    const provider = getAuthProviderInstance(providerId);
    const res = await reauthenticateWithPopup(auth.currentUser, provider);
    await res.user.getIdToken(true);
    setUser({ ...res.user } as User);
  };

  const reauthenticateWithPassword = async (password: string) => {
    if (!auth.currentUser || !auth.currentUser.email) {
      throw new Error('Email credential unavailable for reauthentication.');
    }
    const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
    const res = await reauthenticateWithCredential(auth.currentUser, cred);
    await res.user.getIdToken(true);
    setUser({ ...res.user } as User);
  };

  const clearPendingAccountLink = () => setPendingAccountLink(null);

  const enterLocalOfflineMode = (workspaceId?: string) => {
    const all = listLocalWorkspaces();
    const targetId = workspaceId && all.some((w) => w.id === workspaceId) ? workspaceId : getActiveLocalWorkspaceId();
    setActiveLocalWorkspaceId(targetId);
    setActiveLocalId(targetId);
    setLocalWorkspaces(listLocalWorkspaces());
    const target = all.find((w) => w.id === targetId);
    setLocalWorkspaceLocked(Boolean(target?.pinHash));
    try {
      localStorage.setItem(LOCAL_STORAGE_FLAG, '1');
    } catch {
      // Ignore
    }
    setAuthMode('local');
  };

  const createLocalWorkspaceProfile = async (label: string, pin?: string) => {
    const created = await createLocalWorkspace(label, pin);
    setLocalWorkspaces(listLocalWorkspaces());
    setActiveLocalId(created.id);
    setLocalWorkspaceLocked(false);
    try {
      localStorage.setItem(LOCAL_STORAGE_FLAG, '1');
    } catch {
      // Ignore
    }
    setAuthMode('local');
    return created;
  };

  const switchLocalWorkspace = (workspaceId: string) => {
    setActiveLocalWorkspaceId(workspaceId);
    const all = listLocalWorkspaces();
    setLocalWorkspaces(all);
    setActiveLocalId(workspaceId);
    const target = all.find((w) => w.id === workspaceId);
    setLocalWorkspaceLocked(Boolean(target?.pinHash));
  };

  const unlockLocalWorkspace = async (pin: string): Promise<boolean> => {
    if (!activeLocalWorkspace) return false;
    const valid = await verifyWorkspacePin(activeLocalWorkspace, pin);
    if (valid) setLocalWorkspaceLocked(false);
    return valid;
  };

  const lockLocalWorkspace = () => {
    if (activeLocalWorkspace?.pinHash) {
      setLocalWorkspaceLocked(true);
    } else {
      setAuthMode('unauthenticated');
      try {
        localStorage.removeItem(LOCAL_STORAGE_FLAG);
      } catch {
        // Ignore
      }
    }
  };

  const renameActiveLocalWorkspace = (label: string) => {
    if (!activeLocalWorkspace) return;
    setLocalWorkspaces(renameLocalWorkspace(activeLocalWorkspace.id, label));
  };

  const updateActiveLocalWorkspacePin = async (pin: string | null) => {
    if (!activeLocalWorkspace) return;
    const updated = await setLocalWorkspacePin(activeLocalWorkspace.id, pin);
    setLocalWorkspaces(updated);
  };

  const logout = async () => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_FLAG);
    } catch {
      // Ignore
    }
    if (auth.currentUser) {
      await signOut(auth);
    }
    setPendingAccountLink(null);
    setUser(null);
    setRegistrationState('idle');
    setAuthMode('unauthenticated');
  };

  const deleteAccount = async () => {
    if (auth.currentUser) {
      await deleteUser(auth.currentUser);
    }
    try {
      localStorage.removeItem(LOCAL_STORAGE_FLAG);
    } catch {
      // Ignore
    }
    setUser(null);
    setRegistrationState('idle');
    setAuthMode('unauthenticated');
  };

  const uid = authMode === 'cloud' && user ? user.uid : activeLocalId;
  const displayName =
    authMode === 'cloud' && user
      ? user.displayName || user.email?.split('@')[0] || 'NEXORA User'
      : activeLocalWorkspace?.label || 'Local Workspace';
  const email = authMode === 'cloud' && user ? user.email || '' : `${activeLocalId}@device.offline`;
  const emailVerified = authMode === 'cloud' && user ? Boolean(user.emailVerified) : true;
  const connectedProviders: ConnectedProviderInfo[] =
    authMode === 'cloud' && user
      ? user.providerData.map((p) => ({
          providerId: p.providerId,
          email: p.email,
          displayName: p.displayName,
          uid: p.uid,
        }))
      : [];

  return (
    <AuthContext.Provider
      value={{
        user,
        authMode,
        registrationState,
        firebaseReachable,
        uid,
        displayName,
        email,
        emailVerified,
        connectedProviders,
        pendingAccountLink,
        localWorkspaces,
        activeLocalWorkspace,
        localWorkspaceLocked,
        preferRedirectAuth,
        setPreferRedirectAuth,
        signInWithProvider,
        signInWithEmail,
        registerWithEmail,
        sendResetEmail,
        resendVerificationEmail,
        refreshAuthUser,
        getIdToken,
        linkProviderWithPopup,
        unlinkAuthProvider,
        reauthenticateWithSocialPopup,
        reauthenticateWithPassword,
        clearPendingAccountLink,
        enterLocalOfflineMode,
        createLocalWorkspaceProfile,
        switchLocalWorkspace,
        unlockLocalWorkspace,
        lockLocalWorkspace,
        renameActiveLocalWorkspace,
        updateActiveLocalWorkspacePin,
        logout,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { mapFirebaseAuthError, type AuthProviderId, type RegistrationState };
