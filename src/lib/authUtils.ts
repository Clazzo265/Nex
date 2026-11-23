export type AuthProviderId =
  | 'password'
  | 'google.com'
  | 'facebook.com'
  | 'twitter.com'
  | 'github.com';

export type SocialProviderId = Exclude<AuthProviderId, 'password'>;

export type RegistrationState =
  | 'idle'
  | 'registration_started'
  | 'verification_pending'
  | 'verified'
  | 'profile_initializing'
  | 'authenticated'
  | 'registration_failed';

export interface ProviderMetadata {
  id: AuthProviderId;
  label: string;
  shortLabel: string;
  isSocial: boolean;
}

export const AUTH_PROVIDERS: ProviderMetadata[] = [
  { id: 'password', label: 'Email & Password', shortLabel: 'Email', isSocial: false },
  { id: 'google.com', label: 'Google', shortLabel: 'Google', isSocial: true },
  { id: 'facebook.com', label: 'Facebook', shortLabel: 'Facebook', isSocial: true },
  { id: 'twitter.com', label: 'X (Twitter)', shortLabel: 'X', isSocial: true },
  { id: 'github.com', label: 'GitHub', shortLabel: 'GitHub', isSocial: true },
];

export function getProviderLabel(providerId: string): string {
  const found = AUTH_PROVIDERS.find((p) => p.id === providerId);
  return found ? found.label : providerId;
}

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too Short' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  checks: {
    minLength: boolean;
    hasLower: boolean;
    hasUpper: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
  };
  isAcceptable: boolean;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    minLength: password.length >= 8,
    hasLower: /[a-z]/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSymbol: /[^a-zA-Z0-9]/.test(password),
  };

  if (password.length < 6) {
    return {
      score: 0,
      label: 'Too Short',
      checks,
      isAcceptable: false,
    };
  }

  let points = 0;
  if (checks.minLength) points += 1;
  if (checks.hasLower && checks.hasUpper) points += 1;
  if (checks.hasNumber) points += 1;
  if (checks.hasSymbol) points += 1;
  if (password.length >= 12) points += 1;

  const score = Math.min(4, Math.max(1, points)) as 1 | 2 | 3 | 4;
  const labels: Record<1 | 2 | 3 | 4, PasswordStrengthResult['label']> = {
    1: 'Weak',
    2: 'Fair',
    3: 'Strong',
    4: 'Very Strong',
  };

  return {
    score,
    label: labels[score],
    checks,
    isAcceptable: password.length >= 8 && (checks.hasNumber || checks.hasSymbol || checks.hasUpper),
  };
}

const VALID_REGISTRATION_TRANSITIONS: Record<RegistrationState, RegistrationState[]> = {
  idle: ['registration_started', 'verification_pending', 'authenticated'],
  registration_started: ['verification_pending', 'registration_failed', 'authenticated'],
  verification_pending: ['verified', 'verification_pending', 'registration_failed', 'idle'],
  verified: ['profile_initializing', 'authenticated', 'registration_failed'],
  profile_initializing: ['authenticated', 'registration_failed'],
  authenticated: ['idle', 'profile_initializing'],
  registration_failed: ['idle', 'registration_started', 'verification_pending'],
};

export function canTransitionRegistrationState(
  from: RegistrationState,
  to: RegistrationState
): boolean {
  return VALID_REGISTRATION_TRANSITIONS[from].includes(to);
}

export function shouldPreferRedirectAuth(userAgent: string, viewportWidth = 1024): boolean {
  const ua = userAgent.toLowerCase();
  const isMobileUa = /android|iphone|ipad|ipod|mobile|wv|webview/.test(ua);
  const isEmbeddedWebView = /fban|fbav|instagram|line|twitter|micromessenger/.test(ua);
  return isEmbeddedWebView || (isMobileUa && viewportWidth < 768);
}

export interface AuthErrorGuidance {
  code: string;
  title: string;
  message: string;
  nextAction: string;
  suggestedAction?:
    | 'switch_to_signin'
    | 'switch_to_reset'
    | 'use_redirect_auth'
    | 'link_existing_account'
    | 'reauthenticate'
    | 'use_local_mode';
}

export function extractFirebaseErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  const msg = error instanceof Error ? error.message : String(error);
  const match = /\b(auth\/[a-z0-9-]+)\b/i.exec(msg);
  return match ? match[1].toLowerCase() : 'unknown';
}

export function mapFirebaseAuthError(error: unknown, contextLabel = 'Authentication'): AuthErrorGuidance {
  const code = extractFirebaseErrorCode(error);

  switch (code) {
    case 'auth/email-already-in-use':
      return {
        code,
        title: 'Account already exists',
        message: 'An account is already registered with this email address.',
        nextAction: 'Sign in with your password, reset your password, or continue with a linked social provider.',
        suggestedAction: 'switch_to_signin',
      };
    case 'auth/invalid-email':
      return {
        code,
        title: 'Invalid email address',
        message: 'Please enter a valid email address (for example, name@domain.com).',
        nextAction: 'Check for typos or extra spaces in your email address.',
      };
    case 'auth/weak-password':
      return {
        code,
        title: 'Password is too weak',
        message: 'Firebase requires a stronger password to protect your personal records.',
        nextAction: 'Use at least 8 characters combining uppercase, lowercase, numbers, and symbols.',
      };
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return {
        code,
        title: 'Incorrect email or password',
        message: 'The credentials entered did not match an active account.',
        nextAction: 'Verify your password, reset it, or sign in with the social provider originally used.',
        suggestedAction: 'switch_to_reset',
      };
    case 'auth/user-not-found':
      return {
        code,
        title: 'No account found',
        message: 'No NEXORA account matches that email address.',
        nextAction: 'Check the email spelling or switch to Create Account to register.',
      };
    case 'auth/user-disabled':
      return {
        code,
        title: 'Account disabled',
        message: 'This account has been disabled by an administrator.',
        nextAction: 'Contact support or use a local offline workspace while resolving account access.',
        suggestedAction: 'use_local_mode',
      };
    case 'auth/account-exists-with-different-credential':
      return {
        code,
        title: 'Account exists with another sign-in method',
        message:
          'This email is already associated with another provider. Sign in with your original method to safely link accounts.',
        nextAction: 'Complete sign-in with the existing provider to attach this login method to the same profile.',
        suggestedAction: 'link_existing_account',
      };
    case 'auth/credential-already-in-use':
      return {
        code,
        title: 'Provider already connected elsewhere',
        message: 'That social account is already linked to a different NEXORA user ID.',
        nextAction: 'Sign in with that account directly or choose a different social profile to link.',
      };
    case 'auth/requires-recent-login':
      return {
        code,
        title: 'Recent verification required',
        message: 'For your security, sensitive account changes require a fresh login.',
        nextAction: 'Reauthenticate below and retry your security action.',
        suggestedAction: 'reauthenticate',
      };
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return {
        code,
        title: 'Sign-in window closed',
        message: 'The provider sign-in popup was closed before completing authorization.',
        nextAction: 'Click the provider button again or switch to redirect sign-in.',
      };
    case 'auth/popup-blocked':
      return {
        code,
        title: 'Popup blocked by browser',
        message: 'Your browser prevented the sign-in popup window from opening.',
        nextAction: 'Allow popups for NEXORA or retry using full-page redirect sign-in.',
        suggestedAction: 'use_redirect_auth',
      };
    case 'auth/network-request-failed':
      return {
        code,
        title: 'Network connection interrupted',
        message: `Could not reach Firebase Authentication during ${contextLabel}.`,
        nextAction: 'Check your internet connection or switch to Local Offline Workspace.',
        suggestedAction: 'use_local_mode',
      };
    case 'auth/too-many-requests':
      return {
        code,
        title: 'Too many attempts',
        message: 'Access to this account has been temporarily throttled due to repeated attempts.',
        nextAction: 'Wait a few minutes before trying again or reset your password.',
      };
    case 'auth/operation-not-allowed':
      return {
        code,
        title: 'Sign-in provider not configured',
        message:
          'This authentication provider is not yet enabled in the Firebase Authentication console for this project.',
        nextAction: 'Choose another configured sign-in method, enable this provider in Firebase Console, or use Local Offline Workspace.',
      };
    case 'auth/unauthorized-domain':
      return {
        code,
        title: 'Domain not authorized',
        message: 'This preview or hosting domain is not listed under Authorized Domains in Firebase Authentication.',
        nextAction: 'Add this domain to Firebase Console -> Authentication -> Settings -> Authorized domains.',
      };
    default:
      return {
        code,
        title: `${contextLabel} could not be completed`,
        message: error instanceof Error ? error.message : String(error),
        nextAction: 'Review your details and try again.',
      };
  }
}
