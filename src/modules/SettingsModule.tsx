import React, { useState } from 'react';
import {
  Download,
  KeyRound,
  Link2,
  Lock,
  MailCheck,
  ShieldCheck,
  Trash2,
  Unlink,
} from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  AUTH_PROVIDERS,
  extractFirebaseErrorCode,
  mapFirebaseAuthError,
  type SocialProviderId,
} from '../lib/authUtils';
import { SUPPORTED_CURRENCIES } from '../lib/finance';
import { appCheckStatus } from '../lib/firebase';
import { ProfileInputSchema } from '../lib/validation';
import type { DateFormatOption, ThemePreference } from '../types/nexora';

export const SettingsModule: React.FC = () => {
  const {
    authMode,
    emailVerified,
    connectedProviders,
    localWorkspaces,
    activeLocalWorkspace,
    resendVerificationEmail,
    refreshAuthUser,
    linkProviderWithPopup,
    unlinkAuthProvider,
    reauthenticateWithSocialPopup,
    reauthenticateWithPassword,
    switchLocalWorkspace,
    renameActiveLocalWorkspace,
    updateActiveLocalWorkspacePin,
    lockLocalWorkspace,
  } = useAuth();
  const { theme, setTheme } = useTheme();
  const {
    profile,
    settings,
    storageQuota,
    updateProfileData,
    updateSettingsData,
    exportAllUserData,
    purgeCloudAndLocalAccountData,
  } = useWorkspace();

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [roleTitle, setRoleTitle] = useState(profile.roleTitle ?? '');
  const [institution, setInstitution] = useState(profile.institution ?? '');
  const [location, setLocation] = useState(profile.location ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');

  const [savingProfile, setSavingProfile] = useState(false);
  const [securityBusy, setSecurityBusy] = useState<string | null>(null);
  const [reauthPassword, setReauthPassword] = useState('');
  const [needsReauth, setNeedsReauth] = useState(false);

  const [localLabelInput, setLocalLabelInput] = useState(activeLocalWorkspace?.label ?? '');
  const [localPinInput, setLocalPinInput] = useState('');

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    const parsed = ProfileInputSchema.safeParse({
      displayName,
      roleTitle: roleTitle || undefined,
      institution: institution || undefined,
      location: location || undefined,
      bio: bio || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid profile fields.');
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfileData(parsed.data);
      setFeedback('Profile updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLinkProvider = async (providerId: SocialProviderId) => {
    setError(null);
    setFeedback(null);
    setSecurityBusy(`link:${providerId}`);
    try {
      await linkProviderWithPopup(providerId);
      setFeedback(`Connected ${providerId} to your NEXORA account.`);
    } catch (err) {
      const code = extractFirebaseErrorCode(err);
      if (code === 'auth/requires-recent-login') setNeedsReauth(true);
      const mapped = mapFirebaseAuthError(err, 'Account Linking');
      setError(`${mapped.title}: ${mapped.message} ${mapped.nextAction}`);
    } finally {
      setSecurityBusy(null);
    }
  };

  const handleUnlinkProvider = async (providerId: string) => {
    setError(null);
    setFeedback(null);
    setSecurityBusy(`unlink:${providerId}`);
    try {
      await unlinkAuthProvider(providerId);
      setFeedback(`Disconnected ${providerId} from your account.`);
    } catch (err) {
      const code = extractFirebaseErrorCode(err);
      if (code === 'auth/requires-recent-login') setNeedsReauth(true);
      const mapped = mapFirebaseAuthError(err, 'Unlink Provider');
      setError(`${mapped.title}: ${mapped.message} ${mapped.nextAction}`);
    } finally {
      setSecurityBusy(null);
    }
  };

  const handleExportArchive = async () => {
    const json = await exportAllUserData();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexora-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback('Complete personal archive exported as JSON.');
  };

  const hasPasswordProvider = connectedProviders.some((p) => p.providerId === 'password');

  return (
    <div className="space-y-6 max-w-4xl">
      {feedback && (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300"
        >
          {feedback}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Account & Profile */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Account &amp; Profile
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mode: {authMode === 'cloud' ? 'Cloud Synced (Firebase)' : 'Local Offline Device Storage'} ·{' '}
              {profile.email}
            </p>
          </div>
          {authMode === 'cloud' && (
            <div className="flex items-center gap-2 text-xs">
              <MailCheck
                className={`w-4 h-4 ${emailVerified ? 'text-emerald-500' : 'text-amber-500'}`}
              />
              <span>{emailVerified ? 'Email Verified' : 'Verification Pending'}</span>
              {!emailVerified && (
                <>
                  <button
                    type="button"
                    onClick={resendVerificationEmail}
                    className="text-blue-600 dark:text-sky-400 underline ml-2"
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    onClick={() => refreshAuthUser()}
                    className="text-blue-600 dark:text-sky-400 underline ml-1"
                  >
                    Refresh
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="set-name"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Display Name
            </label>
            <input
              id="set-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label
              htmlFor="set-role"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Role / Focus
            </label>
            <input
              id="set-role"
              type="text"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g., Software Engineer / Student"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label
              htmlFor="set-institution"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Institution / Organization
            </label>
            <input
              id="set-institution"
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label
              htmlFor="set-location"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Location
            </label>
            <input
              id="set-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="set-bio"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Bio
            </label>
            <textarea
              id="set-bio"
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 min-h-[40px]"
            >
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </section>

      {/* Security -> Connected Accounts (Cloud Mode) */}
      {authMode === 'cloud' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                Security &amp; Connected Accounts
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Link or manage sign-in methods on your account. At least one connected method is
                always preserved.
              </p>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              App Check:{' '}
              {appCheckStatus.initialized
                ? 'Active (reCAPTCHA v3)'
                : 'Awaiting VITE_RECAPTCHA_SITE_KEY'}
            </span>
          </div>

          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {AUTH_PROVIDERS.map((provider) => {
              const linked = connectedProviders.find((p) => p.providerId === provider.id);
              const isOnlyProvider = connectedProviders.length <= 1;

              return (
                <li
                  key={provider.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{provider.label}</p>
                    <p className="text-slate-500 dark:text-slate-400">
                      {linked
                        ? `Connected${linked.email ? ` · ${linked.email}` : ''}`
                        : 'Not connected'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {linked ? (
                      <>
                        {provider.isSocial && (
                          <button
                            type="button"
                            disabled={securityBusy !== null}
                            onClick={async () => {
                              setSecurityBusy(`reauth:${provider.id}`);
                              setError(null);
                              try {
                                await reauthenticateWithSocialPopup(
                                  provider.id as SocialProviderId
                                );
                                setNeedsReauth(false);
                                setFeedback(`Session refreshed via ${provider.label}.`);
                              } catch (err) {
                                const mapped = mapFirebaseAuthError(err, 'Reauthentication');
                                setError(`${mapped.title}: ${mapped.message}`);
                              } finally {
                                setSecurityBusy(null);
                              }
                            }}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Verify Recent Login
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isOnlyProvider || securityBusy !== null}
                          onClick={() => handleUnlinkProvider(provider.id)}
                          title={
                            isOnlyProvider
                              ? 'Cannot remove your last remaining sign-in method'
                              : `Disconnect ${provider.label}`
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          {securityBusy === `unlink:${provider.id}` ? 'Removing...' : 'Unlink'}
                        </button>
                      </>
                    ) : provider.isSocial ? (
                      <button
                        type="button"
                        disabled={securityBusy !== null}
                        onClick={() => handleLinkProvider(provider.id as SocialProviderId)}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 font-medium text-white disabled:opacity-50"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        {securityBusy === `link:${provider.id}` ? 'Linking...' : 'Link Account'}
                      </button>
                    ) : (
                      <span className="text-slate-400">Available on registration</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {(needsReauth || hasPasswordProvider) && hasPasswordProvider && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
              <KeyRound className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="password"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                placeholder="Confirm password to refresh recent login"
                className="flex-1 min-w-[200px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-1.5 text-slate-900 dark:text-white"
              />
              <button
                type="button"
                disabled={!reauthPassword || securityBusy !== null}
                onClick={async () => {
                  setSecurityBusy('reauth:password');
                  setError(null);
                  try {
                    await reauthenticateWithPassword(reauthPassword);
                    setReauthPassword('');
                    setNeedsReauth(false);
                    setFeedback('Password reauthentication succeeded.');
                  } catch (err) {
                    const mapped = mapFirebaseAuthError(err, 'Password Reauthentication');
                    setError(`${mapped.title}: ${mapped.message}`);
                  } finally {
                    setSecurityBusy(null);
                  }
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Reauthenticate
              </button>
            </div>
          )}
        </section>
      )}

      {/* Local Workspace Controls (Local Mode) */}
      {authMode === 'local' && activeLocalWorkspace && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Local Offline Profile &amp; Device Lock
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Profile ID: <span className="font-mono">{activeLocalWorkspace.id}</span> · Data is
                isolated to this browser profile.
              </p>
            </div>
            {activeLocalWorkspace.pinHash && (
              <button
                type="button"
                onClick={lockLocalWorkspace}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Lock className="w-3.5 h-3.5" />
                Lock Now
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300">
                Rename Workspace Profile
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localLabelInput}
                  onChange={(e) => setLocalLabelInput(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-1.5 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    renameActiveLocalWorkspace(localLabelInput);
                    setFeedback('Local workspace name updated.');
                  }}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 font-medium text-white"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300">
                {activeLocalWorkspace.pinHash ? 'Update or Clear Device PIN' : 'Set Device PIN (4+ chars)'}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={localPinInput}
                  onChange={(e) => setLocalPinInput(e.target.value)}
                  placeholder="Enter new PIN"
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-1.5 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await updateActiveLocalWorkspacePin(localPinInput || null);
                    setLocalPinInput('');
                    setFeedback(localPinInput ? 'Workspace PIN updated.' : 'Workspace PIN cleared.');
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {localPinInput ? 'Set PIN' : 'Clear PIN'}
                </button>
              </div>
            </div>
          </div>

          {localWorkspaces.length > 1 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Switch local profile:</span>
              {localWorkspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => switchLocalWorkspace(ws.id)}
                  className={`rounded-md px-2.5 py-1 font-medium border ${
                    ws.id === activeLocalWorkspace.id
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {ws.label}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Appearance & Localization */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Appearance &amp; Localization
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="pref-theme"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Theme
            </label>
            <select
              id="pref-theme"
              value={theme}
              onChange={(e) => {
                const next = e.target.value as ThemePreference;
                setTheme(next);
                updateSettingsData({ theme: next });
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              <option value="dark">Premium Dark</option>
              <option value="light">Clean Light</option>
              <option value="system">System Automatic</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="pref-currency"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Default Currency
            </label>
            <select
              id="pref-currency"
              value={settings.currency}
              onChange={(e) => updateSettingsData({ currency: e.target.value })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              {Object.values(SUPPORTED_CURRENCIES).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="pref-date"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Date Format
            </label>
            <select
              id="pref-date"
              value={settings.dateFormat}
              onChange={(e) =>
                updateSettingsData({ dateFormat: e.target.value as DateFormatOption })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="pref-tz"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Time Zone
            </label>
            <input
              id="pref-tz"
              type="text"
              value={settings.timezone}
              onChange={(e) => updateSettingsData({ timezone: e.target.value })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-5 text-xs text-slate-700 dark:text-slate-300">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={(e) => updateSettingsData({ notificationsEnabled: e.target.checked })}
            />
            Enable in-app notifications
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.deadlineAlerts}
              onChange={(e) => updateSettingsData({ deadlineAlerts: e.target.checked })}
            />
            Deadline &amp; overdue alerts
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.budgetAlerts}
              onChange={(e) => updateSettingsData({ budgetAlerts: e.target.checked })}
            />
            Budget overspending alerts
          </label>
        </div>
      </section>

      {/* Data Export & Account Deletion */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Data Ownership, Export &amp; Account Deletion
          </h2>
          {storageQuota?.supported && (
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              Local storage used: {Math.round(storageQuota.usageBytes / 1024)} KB (
              {storageQuota.percentUsed}%)
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              Export Complete Personal Archive
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Download all your tasks, courses, grades, transactions, goals, and notes as JSON.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportArchive}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[40px]"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
              Delete Account &amp; Workspace Data
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Permanently deletes your workspace collections, local cache, and Firebase Auth account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-medium text-white min-h-[40px]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Account
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Permanently delete your NEXORA account?"
        description="This will remove all stored tasks, courses, financial records, notes, local IndexedDB cache, and your Firebase account. Export your JSON archive first if needed."
        confirmLabel="Delete Everything"
        destructive
        busy={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await purgeCloudAndLocalAccountData();
            setConfirmDeleteOpen(false);
          } catch (err) {
            const code = extractFirebaseErrorCode(err);
            if (code === 'auth/requires-recent-login') setNeedsReauth(true);
            const mapped = mapFirebaseAuthError(err, 'Account Deletion');
            setError(`${mapped.title}: ${mapped.message} ${mapped.nextAction}`);
            setConfirmDeleteOpen(false);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
};
