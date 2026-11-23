import React, { useState } from 'react';
import { Download, MailCheck, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { SUPPORTED_CURRENCIES } from '../lib/finance';
import { ProfileInputSchema } from '../lib/validation';
import type { DateFormatOption, ThemePreference } from '../types/nexora';

export const SettingsModule: React.FC = () => {
  const { authMode, emailVerified, resendVerificationEmail, refreshAuthUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const {
    profile,
    settings,
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
                    onClick={refreshAuthUser}
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
              className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </section>

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
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Data Ownership, Export &amp; Account Deletion
        </h2>
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
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
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
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-medium text-white"
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
            setError(
              err instanceof Error
                ? err.message
                : 'Re-authentication may be required before deleting your account.'
            );
            setConfirmDeleteOpen(false);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
};
