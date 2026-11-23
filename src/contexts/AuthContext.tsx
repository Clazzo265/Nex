import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, testConnection } from '../lib/firebase';

export type AuthMode = 'loading' | 'unauthenticated' | 'cloud' | 'local';

interface AuthContextValue {
  user: User | null;
  authMode: AuthMode;
  firebaseReachable: boolean;
  uid: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  sendResetEmail: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshAuthUser: () => Promise<void>;
  enterLocalOfflineMode: () => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOCAL_UID = 'local_offline_user';
const LOCAL_STORAGE_FLAG = 'nexora_local_offline_mode';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('loading');
  const [firebaseReachable, setFirebaseReachable] = useState<boolean>(true);

  useEffect(() => {
    testConnection().then((res) => setFirebaseReachable(res.reachable));

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
        try {
          localStorage.removeItem(LOCAL_STORAGE_FLAG);
        } catch {
          // Ignore
        }
      } else {
        setUser(null);
        if (autostart || savedLocal) {
          setAuthMode('local');
        } else {
          setAuthMode('unauthenticated');
        }
      }
    });

    return () => unsub();
  }, []);

  const signInWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    setUser(cred.user);
    setAuthMode('cloud');
  };

  const signInWithEmail = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    setUser(cred.user);
    setAuthMode('cloud');
  };

  const registerWithEmail = async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name.trim() });
    await sendEmailVerification(cred.user);
    setUser(cred.user);
    setAuthMode('cloud');
  };

  const sendResetEmail = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const resendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const refreshAuthUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setUser({ ...auth.currentUser } as User);
    }
  };

  const enterLocalOfflineMode = () => {
    try {
      localStorage.setItem(LOCAL_STORAGE_FLAG, '1');
    } catch {
      // Ignore
    }
    setAuthMode('local');
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
    setUser(null);
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
    setAuthMode('unauthenticated');
  };

  const uid = authMode === 'cloud' && user ? user.uid : LOCAL_UID;
  const displayName =
    authMode === 'cloud' && user
      ? user.displayName || user.email?.split('@')[0] || 'NEXORA User'
      : 'Local Workspace';
  const email = authMode === 'cloud' && user ? user.email || '' : 'local@device.offline';
  const emailVerified = authMode === 'cloud' && user ? user.emailVerified : true;

  return (
    <AuthContext.Provider
      value={{
        user,
        authMode,
        firebaseReachable,
        uid,
        displayName,
        email,
        emailVerified,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        sendResetEmail,
        resendVerificationEmail,
        refreshAuthUser,
        enterLocalOfflineMode,
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
