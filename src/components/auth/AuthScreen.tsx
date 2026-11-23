import React, { useState } from 'react';
import { HardDrive, Lock, Mail, Moon, Sun, UserCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { formatFriendlyError } from '../../lib/errors';
import { NexoraLogo } from '../common/NexoraLogo';

type AuthTab = 'signin' | 'register' | 'reset';

export const AuthScreen: React.FC = () => {
  const {
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    sendResetEmail,
    enterLocalOfflineMode,
    firebaseReachable,
  } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();

  const [tab, setTab] = useState<AuthTab>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const handleGoogle = async () => {
    setBusy(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const friendly = formatFriendlyError(err, 'Google Sign-In', false);
      setErrorMsg(`${friendly.title}: ${friendly.whatHappened} ${friendly.nextAction}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNoticeMsg(null);

    if (!email.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    if (tab !== 'reset' && password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (tab === 'register' && !name.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }

    setBusy(true);
    try {
      if (tab === 'signin') {
        await signInWithEmail(email.trim(), password);
      } else if (tab === 'register') {
        await registerWithEmail(name.trim(), email.trim(), password);
        setNoticeMsg('Account created. A verification email has been sent to your inbox.');
      } else {
        await sendResetEmail(email.trim());
        setNoticeMsg('Password reset link sent. Check your inbox to choose a new password.');
      }
    } catch (err) {
      const friendly = formatFriendlyError(err, 'Authentication', false);
      setErrorMsg(`${friendly.title}: ${friendly.whatHappened} ${friendly.nextAction}`);
    } finally {
      setBusy(false);
    }
  };

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
          aria-label="Toggle color theme"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <section className="lg:col-span-6 flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-8">
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
                    <dt className="font-medium text-slate-900 dark:text-white">Private Owner Isolation</dt>
                    <dd className="text-slate-600 dark:text-slate-400">
                      Every financial, academic, and personal record is isolated to your authenticated user ID.
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <HardDrive className="w-4 h-4 mt-0.5 text-blue-600 dark:text-sky-400 shrink-0" />
                  <div>
                    <dt className="font-medium text-slate-900 dark:text-white">Low-Connectivity Engineered</dt>
                    <dd className="text-slate-600 dark:text-slate-400">
                      Local IndexedDB caching and sync queues keep you productive across unstable links.
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

          <section className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0B1220] rounded-lg border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setTab('signin');
                    setErrorMsg(null);
                    setNoticeMsg(null);
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    tab === 'signin'
                      ? 'bg-white dark:bg-[#111C32] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('register');
                    setErrorMsg(null);
                    setNoticeMsg(null);
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    tab === 'register'
                      ? 'bg-white dark:bg-[#111C32] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Create Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('reset');
                    setErrorMsg(null);
                    setNoticeMsg(null);
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    tab === 'reset'
                      ? 'bg-white dark:bg-[#111C32] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Reset Password
                </button>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleGoogle}
                className="mt-6 w-full flex items-center justify-center gap-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                Continue with Google
              </button>

              <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                <span>or use email credentials</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
                >
                  {errorMsg}
                </div>
              )}

              {noticeMsg && (
                <div
                  role="status"
                  className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300"
                >
                  {noticeMsg}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {tab === 'register' && (
                  <div>
                    <label
                      htmlFor="auth-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Full Name
                    </label>
                    <input
                      id="auth-name"
                      type="text"
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
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        id="auth-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        required
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] pl-10 pr-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
                >
                  {busy
                    ? 'Please wait...'
                    : tab === 'signin'
                    ? 'Sign In to NEXORA'
                    : tab === 'register'
                    ? 'Create NEXORA Account'
                    : 'Send Password Reset Link'}
                </button>
              </form>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No internet or prefer device-only storage?
              </p>
              <button
                type="button"
                onClick={enterLocalOfflineMode}
                className="text-xs font-medium text-blue-600 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0 text-left sm:text-right"
              >
                Use Local Offline Workspace
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
