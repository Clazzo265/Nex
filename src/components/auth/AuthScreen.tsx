import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Link2,
  Lock,
  Mail,
  Moon,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sun,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  evaluatePasswordStrength,
  getProviderLabel,
  mapFirebaseAuthError,
  type SocialProviderId,
} from '../../lib/authUtils';
import { NexoraLogo } from '../common/NexoraLogo';

type AuthTab = 'signin' | 'register' | 'reset';

const ProviderIcon: React.FC<{ providerId: SocialProviderId }> = ({ providerId }) => {
  if (providerId === 'google.com') {
    return (
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
    );
  }

  if (providerId === 'facebook.com') {
    return (
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#1877F2"
          d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971H15.83c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
        />
      </svg>
    );
  }

  if (providerId === 'twitter.com') {
    return (
      <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }

  return (
    <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 0C5.37 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.113.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"
      />
    </svg>
  );
};

export const AuthScreen: React.FC = () => {
  const {
    authMode,
    emailVerified,
    email: activeEmail,
    registrationState,
    firebaseReachable,
    pendingAccountLink,
    clearPendingAccountLink,
    localWorkspaces,
    activeLocalWorkspace,
    preferRedirectAuth,
    setPreferRedirectAuth,
    signInWithProvider,
    signInWithEmail,
    registerWithEmail,
    sendResetEmail,
    resendVerificationEmail,
    refreshAuthUser,
    enterLocalOfflineMode,
    createLocalWorkspaceProfile,
    logout,
  } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();

  const [tab, setTab] = useState<AuthTab>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorActionHint, setErrorActionHint] = useState<
    'switch_to_signin' | 'switch_to_reset' | 'use_redirect_auth' | 'use_local_mode' | null
  >(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  // Local workspace selector panel
  const [localPanelOpen, setLocalPanelOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspacePin, setNewWorkspacePin] = useState('');

  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const isBusy = busyProvider !== null;

  const handleSocial = async (providerId: SocialProviderId, forceRedirect = false) => {
    if (isBusy) return;
    setBusyProvider(providerId);
    setErrorMsg(null);
    setErrorActionHint(null);
    setNoticeMsg(null);
    try {
      await signInWithProvider(providerId, forceRedirect);
    } catch (err) {
      const mapped = mapFirebaseAuthError(err, getProviderLabel(providerId));
      setErrorMsg(`${mapped.title}: ${mapped.message} ${mapped.nextAction}`);
      if (
        mapped.suggestedAction === 'use_redirect_auth' ||
        mapped.suggestedAction === 'use_local_mode'
      ) {
        setErrorActionHint(mapped.suggestedAction);
      }
    } finally {
      setBusyProvider(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;
    setErrorMsg(null);
    setErrorActionHint(null);
    setNoticeMsg(null);

    const trimmedEmail = (pendingAccountLink?.email || email).trim();
    if (!trimmedEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    if (tab !== 'reset' && password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (tab === 'register') {
      if (!name.trim()) {
        setErrorMsg('Please enter your full name.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match. Re-enter your confirmation password.');
        return;
      }
      if (!strength.isAcceptable) {
        setErrorMsg(
          'Please choose a stronger password (at least 8 characters with uppercase, numbers, or symbols).'
        );
        return;
      }
      if (!termsAccepted) {
        setErrorMsg('Please review and accept the Terms of Service and Privacy Policy to create an account.');
        return;
      }
    }

    setBusyProvider('password');
    try {
      if (tab === 'signin') {
        await signInWithEmail(trimmedEmail, password);
      } else if (tab === 'register') {
        await registerWithEmail(name.trim(), trimmedEmail, password);
        setNoticeMsg('Account created. Verify your email address to unlock cloud sync.');
      } else {
        await sendResetEmail(trimmedEmail);
        setNoticeMsg('Password reset link sent. Check your inbox to choose a new password.');
      }
    } catch (err) {
      const mapped = mapFirebaseAuthError(err, 'Email Authentication');
      setErrorMsg(`${mapped.title}: ${mapped.message} ${mapped.nextAction}`);
      if (
        mapped.suggestedAction === 'switch_to_signin' ||
        mapped.suggestedAction === 'switch_to_reset' ||
        mapped.suggestedAction === 'use_local_mode'
      ) {
        setErrorActionHint(mapped.suggestedAction);
      }
    } finally {
      setBusyProvider(null);
    }
  };

  // Explicit Email Verification Gate before cloud workspace initialization
  if (authMode === 'cloud' && !emailVerified) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-slate-100 flex flex-col">
        <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <NexoraLogo size={32} />
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              NEXORA
            </span>
          </div>
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] px-3 py-2 text-xs font-medium"
          >
            {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <section className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 sm:p-8 space-y-5">
            <div className="flex items-start gap-3">
              <Mail className="w-6 h-6 text-blue-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-blue-600 dark:text-sky-400">
                  State: {registrationState.replace('_', ' ')}
                </p>
                <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
                  Verify Your Email Address
                </h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {activeEmail ? (
                    <>
                      We sent a verification link to{' '}
                      <span className="font-medium text-slate-900 dark:text-white">
                        {activeEmail}
                      </span>
                      . Cloud profile and database synchronization stay paused until email
                      verification is confirmed.
                    </>
                  ) : (
                    'Your sign-in provider did not supply a verified email address. Please verify or link a verified email provider in Firebase Authentication to enable cloud storage.'
                  )}
                </p>
              </div>
            </div>

            {noticeMsg && (
              <div
                role="status"
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300"
              >
                {noticeMsg}
              </div>
            )}
            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
              >
                {errorMsg}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={isBusy}
                onClick={async () => {
                  setBusyProvider('verify');
                  setErrorMsg(null);
                  setNoticeMsg(null);
                  try {
                    const ok = await refreshAuthUser();
                    if (!ok) {
                      setErrorMsg(
                        'Verification is not confirmed yet. Click the link in your inbox, then press Refresh Verification Status.'
                      );
                    }
                  } catch (err) {
                    const mapped = mapFirebaseAuthError(err, 'Verification Check');
                    setErrorMsg(`${mapped.title}: ${mapped.message}`);
                  } finally {
                    setBusyProvider(null);
                  }
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                {busyProvider === 'verify' ? 'Checking...' : 'I Verified — Refresh & Continue'}
              </button>

              {activeEmail && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={async () => {
                    setBusyProvider('resend');
                    setErrorMsg(null);
                    setNoticeMsg(null);
                    try {
                      await resendVerificationEmail();
                      setNoticeMsg('Verification email resent. Check your inbox and spam folder.');
                    } catch (err) {
                      const mapped = mapFirebaseAuthError(err, 'Resend Verification');
                      setErrorMsg(`${mapped.title}: ${mapped.message}`);
                    } finally {
                      setBusyProvider(null);
                    }
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {busyProvider === 'resend' ? 'Sending...' : 'Resend Link'}
                </button>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <button
                type="button"
                onClick={() => enterLocalOfflineMode()}
                className="font-medium text-blue-600 dark:text-sky-400 hover:underline"
              >
                Use Local Offline Workspace Instead
              </button>
              <button
                type="button"
                onClick={logout}
                className="font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Sign Out &amp; Switch Account
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const strengthColors = [
    'bg-slate-300 dark:bg-slate-700',
    'bg-rose-500',
    'bg-amber-500',
    'bg-sky-500',
    'bg-emerald-500',
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="flex items-center justify-between gap-8 px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <NexoraLogo size={32} />
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            NEXORA
          </span>
        </div>
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle color theme"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
        >
          {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <section className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 sm:p-8">
            <div>
              <p className="text-xs font-medium text-blue-600 dark:text-sky-400">
                Intelligent Personal Operating System
              </p>
              <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                Your Life. Connected.
              </h1>
              <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Unify daily planning, academic coursework, MWK &amp; multi-currency personal finance,
                goals, engineering projects, and offline-resilient knowledge in one dependable workspace.
              </p>

              <dl className="mt-8 space-y-4 border-t border-slate-200 dark:border-slate-800 pt-6 text-sm">
                <div className="flex items-start gap-3">
                  <UserCheck className="w-4 h-4 mt-0.5 text-blue-600 dark:text-sky-400 shrink-0" />
                  <div>
                    <dt className="font-medium text-slate-900 dark:text-white">
                      Verified Multi-Provider Access
                    </dt>
                    <dd className="text-slate-600 dark:text-slate-400">
                      Sign in with Email, Google, Facebook, X, or GitHub with safe account linking
                      and strict per-user Firestore isolation.
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <HardDrive className="w-4 h-4 mt-0.5 text-blue-600 dark:text-sky-400 shrink-0" />
                  <div>
                    <dt className="font-medium text-slate-900 dark:text-white">
                      Low-Connectivity Engineered
                    </dt>
                    <dd className="text-slate-600 dark:text-slate-400">
                      Local IndexedDB caching, exponential backoff queues, and isolated device
                      profiles keep your workflow resilient offline.
                    </dd>
                  </div>
                </div>
              </dl>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-4">
              <span>Cloud status: {firebaseReachable ? 'Firestore Reachable' : 'Offline Mode'}</span>
              <span>Default Currency: MWK</span>
            </div>
          </section>

          <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 sm:p-8 flex flex-col justify-between">
            <div>
              {/* Pending Account Link Banner */}
              {pendingAccountLink && (
                <div
                  role="alert"
                  className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1.5">
                      <Link2 className="w-4 h-4" />
                      Link Existing Account Required
                    </span>
                    <button
                      type="button"
                      onClick={clearPendingAccountLink}
                      className="underline text-amber-700 dark:text-amber-300"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-amber-800 dark:text-amber-200 leading-relaxed">
                    <strong>{pendingAccountLink.email}</strong> already exists with another sign-in
                    method
                    {pendingAccountLink.existingMethods.length > 0
                      ? ` (${pendingAccountLink.existingMethods.map(getProviderLabel).join(', ')})`
                      : ''}
                    . Sign in with your original method below and NEXORA will securely link{' '}
                    {getProviderLabel(pendingAccountLink.attemptedProviderId)} to the same account.
                  </p>
                </div>
              )}

              {/* Mode Switcher */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0B1220] rounded-lg border border-slate-200 dark:border-slate-800">
                {(
                  [
                    ['signin', 'Sign In'],
                    ['register', 'Create Account'],
                    ['reset', 'Reset Password'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setTab(id);
                      setErrorMsg(null);
                      setErrorActionHint(null);
                      setNoticeMsg(null);
                    }}
                    className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap min-h-[38px] ${
                      tab === id
                        ? 'bg-white dark:bg-[#111C32] text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Error & Notice Banners */}
              {errorMsg && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 space-y-2"
                >
                  <p>{errorMsg}</p>
                  {errorActionHint && (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {errorActionHint === 'switch_to_signin' && (
                        <button
                          type="button"
                          onClick={() => {
                            setTab('signin');
                            setErrorMsg(null);
                            setErrorActionHint(null);
                          }}
                          className="font-semibold underline"
                        >
                          Switch to Sign In with {email}
                        </button>
                      )}
                      {(errorActionHint === 'switch_to_signin' ||
                        errorActionHint === 'switch_to_reset') && (
                        <button
                          type="button"
                          onClick={() => {
                            setTab('reset');
                            setErrorMsg(null);
                            setErrorActionHint(null);
                          }}
                          className="font-semibold underline"
                        >
                          Reset Password
                        </button>
                      )}
                      {errorActionHint === 'use_redirect_auth' && (
                        <button
                          type="button"
                          onClick={() => setPreferRedirectAuth(true)}
                          className="font-semibold underline"
                        >
                          Enable Redirect Sign-In Mode
                        </button>
                      )}
                      {errorActionHint === 'use_local_mode' && (
                        <button
                          type="button"
                          onClick={() => enterLocalOfflineMode()}
                          className="font-semibold underline"
                        >
                          Open Local Offline Workspace
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {noticeMsg && (
                <div
                  role="status"
                  className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300"
                >
                  {noticeMsg}
                </div>
              )}

              {/* Email & Password Form */}
              <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
                {tab === 'register' && (
                  <div>
                    <label
                      htmlFor="auth-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Full Name
                    </label>
                    <input
                      id="auth-name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Chisomo Banda"
                      required
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      value={pendingAccountLink?.email ?? email}
                      onChange={(e) => setEmail(e.target.value)}
                      readOnly={Boolean(pendingAccountLink)}
                      placeholder="you@domain.com"
                      required
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] pl-10 pr-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {tab !== 'reset' && (
                  <div>
                    <label
                      htmlFor="auth-password"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={tab === 'register' ? 'Minimum 8 characters recommended' : 'Enter password'}
                        required
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] pl-10 pr-10 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {tab === 'register' && password.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
                          {[1, 2, 3, 4].map((step) => (
                            <div
                              key={step}
                              className={`h-1.5 rounded-full transition-colors ${
                                strength.score >= step
                                  ? strengthColors[strength.score]
                                  : 'bg-slate-200 dark:bg-slate-800'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                          <span>Password strength: {strength.label}</span>
                          <span>8+ chars, number/symbol</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {tab === 'register' && (
                  <>
                    <div>
                      <label
                        htmlFor="auth-confirm-password"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Confirm Password
                      </label>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                        <input
                          id="auth-confirm-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter your password"
                          required
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] pl-10 pr-10 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((s) => !s)}
                          aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                          className="absolute right-2.5 top-2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 pt-1">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 dark:border-slate-700"
                      />
                      <span>
                        I agree to the NEXORA Terms of Service and Privacy Policy (personal data is
                        isolated strictly to my account and never sold or shared).
                      </span>
                    </label>
                  </>
                )}

                <button
                  type="submit"
                  disabled={isBusy}
                  className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  {busyProvider === 'password'
                    ? 'Processing...'
                    : tab === 'signin'
                    ? 'Sign In'
                    : tab === 'register'
                    ? 'Create Account'
                    : 'Send Password Reset Link'}
                </button>
              </form>

              {tab === 'register' && (
                <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setTab('signin');
                      setErrorMsg(null);
                    }}
                    className="font-medium text-blue-600 dark:text-sky-400 hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              )}

              {/* Clear OR Divider */}
              {tab !== 'reset' && (
                <>
                  <div className="my-5 flex items-center gap-3 text-xs font-medium text-slate-400">
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                    <span>OR</span>
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  </div>

                  {/* Multi-Provider Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(
                      [
                        ['google.com', 'Continue with Google'],
                        ['facebook.com', 'Continue with Facebook'],
                        ['twitter.com', 'Continue with X'],
                        ['github.com', 'Continue with GitHub'],
                      ] as const
                    ).map(([providerId, label]) => (
                      <button
                        key={providerId}
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleSocial(providerId)}
                        className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3.5 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 min-h-[44px] whitespace-nowrap"
                      >
                        <ProviderIcon providerId={providerId} />
                        <span>{busyProvider === providerId ? 'Connecting...' : label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferRedirectAuth}
                        onChange={(e) => setPreferRedirectAuth(e.target.checked)}
                      />
                      Use full-page redirect (recommended if popups are blocked)
                    </label>
                  </div>
                </>
              )}
            </div>

            {/* Explicitly Separated Local Offline Workspace */}
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Local Offline Workspace (Device-Only)
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Isolated IndexedDB profiles stored strictly on this device without cloud sync.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setLocalPanelOpen((o) => !o)}
                    className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline whitespace-nowrap"
                  >
                    {localPanelOpen ? 'Hide Profiles' : `Profiles (${localWorkspaces.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => enterLocalOfflineMode(activeLocalWorkspace?.id)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Open Local Workspace
                  </button>
                </div>
              </div>

              {localPanelOpen && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1220] p-4 space-y-3">
                  <div className="space-y-1.5">
                    {localWorkspaces.map((ws) => (
                      <div
                        key={ws.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                            {ws.label}
                            {ws.pinHash && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                            {ws.id}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => enterLocalOfflineMode(ws.id)}
                          className="rounded bg-blue-600 hover:bg-blue-700 px-2.5 py-1 text-white font-medium whitespace-nowrap shrink-0"
                        >
                          Open
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      Create Isolated Local Profile
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        placeholder="Workspace name (e.g. Study Device)"
                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C32] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                      <input
                        type="password"
                        value={newWorkspacePin}
                        onChange={(e) => setNewWorkspacePin(e.target.value)}
                        placeholder="Optional PIN (4+)"
                        className="sm:w-32 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111C32] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (!newWorkspaceName.trim()) return;
                          await createLocalWorkspaceProfile(newWorkspaceName, newWorkspacePin || undefined);
                          setNewWorkspaceName('');
                          setNewWorkspacePin('');
                        }}
                        className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-900 dark:bg-blue-600 text-white px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
