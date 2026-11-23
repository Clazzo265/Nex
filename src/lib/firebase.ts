import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import {
  FacebookAuthProvider,
  getAuth,
  GithubAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  TwitterAuthProvider,
  type AuthCredential,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { SocialProviderId } from './authUtils';

const app = initializeApp(firebaseConfig);

export interface AppCheckStatus {
  configured: boolean;
  initialized: boolean;
  mode: 'active' | 'disabled_missing_site_key';
}

function initGuardedAppCheck(): { instance: AppCheck | null; status: AppCheckStatus } {
  const siteKey =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RECAPTCHA_SITE_KEY) ||
    firebaseConfig.recaptchaSiteKey ||
    '';

  if (!siteKey) {
    return {
      instance: null,
      status: {
        configured: false,
        initialized: false,
        mode: 'disabled_missing_site_key',
      },
    };
  }

  try {
    if (
      typeof window !== 'undefined' &&
      typeof import.meta !== 'undefined' &&
      import.meta.env?.DEV &&
      import.meta.env?.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN
    ) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
    }

    const instance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return {
      instance,
      status: {
        configured: true,
        initialized: true,
        mode: 'active',
      },
    };
  } catch (err) {
    console.warn('App Check initialization skipped:', err);
    return {
      instance: null,
      status: {
        configured: true,
        initialized: false,
        mode: 'disabled_missing_site_key',
      },
    };
  }
}

const appCheckInit = initGuardedAppCheck();
export const appCheck = appCheckInit.instance;
export const appCheckStatus = appCheckInit.status;

const configuredDbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = configuredDbId ? getFirestore(app, configuredDbId) : getFirestore(app);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'] as const;

export const driveGoogleProvider = new GoogleAuthProvider();
for (const scope of GOOGLE_DRIVE_SCOPES) {
  driveGoogleProvider.addScope(scope);
}
driveGoogleProvider.setCustomParameters({ prompt: 'consent select_account' });

export const facebookProvider = new FacebookAuthProvider();
facebookProvider.addScope('email');
facebookProvider.addScope('public_profile');

export const twitterProvider = new TwitterAuthProvider();

export const githubProvider = new GithubAuthProvider();
githubProvider.addScope('user:email');

export function getAuthProviderInstance(providerId: SocialProviderId) {
  switch (providerId) {
    case 'google.com':
      return googleProvider;
    case 'facebook.com':
      return facebookProvider;
    case 'twitter.com':
      return twitterProvider;
    case 'github.com':
      return githubProvider;
  }
}

export function extractPendingCredential(error: unknown): AuthCredential | null {
  try {
    return (
      OAuthProvider.credentialFromError(error as Parameters<typeof OAuthProvider.credentialFromError>[0]) ||
      GoogleAuthProvider.credentialFromError(
        error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]
      ) ||
      FacebookAuthProvider.credentialFromError(
        error as Parameters<typeof FacebookAuthProvider.credentialFromError>[0]
      ) ||
      TwitterAuthProvider.credentialFromError(
        error as Parameters<typeof TwitterAuthProvider.credentialFromError>[0]
      ) ||
      GithubAuthProvider.credentialFromError(
        error as Parameters<typeof GithubAuthProvider.credentialFromError>[0]
      ) ||
      null
    );
  } catch {
    return null;
  }
}

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationTypeValue = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationTypeValue;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationTypeValue,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<{ reachable: boolean; error?: string }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { reachable: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: client is offline.');
      return { reachable: false, error: msg };
    }
    return { reachable: true };
  }
}

export { app, firebaseConfig };
