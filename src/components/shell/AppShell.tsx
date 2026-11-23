import React, { useEffect, useState } from 'react';
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Code2,
  FolderLock,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Target,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { computeBudgetStatuses } from '../../lib/finance';
import { getTodayKey, isTaskOverdue } from '../../lib/planner';
import type { ModuleId } from '../../types/nexora';
import { NexoraLogo } from '../common/NexoraLogo';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { GlobalSearchModal } from './GlobalSearchModal';
import { NotificationDrawer } from './NotificationDrawer';
import { QuickActionModal } from './QuickActionModal';

export interface NavItem {
  id: ModuleId;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
  { id: 'planner', label: 'Planner', shortLabel: 'Planner', icon: CalendarDays },
  { id: 'academic', label: 'Academic Hub', shortLabel: 'Academic', icon: GraduationCap },
  { id: 'finance', label: 'Finance', shortLabel: 'Finance', icon: Wallet },
  { id: 'goals', label: 'Goals & Habits', shortLabel: 'Goals', icon: Target },
  { id: 'developer', label: 'Developer Workspace', shortLabel: 'Dev', icon: Code2 },
  { id: 'vault', label: 'Digital Vault', shortLabel: 'Vault', icon: FolderLock },
  { id: 'knowledge', label: 'Knowledge Library', shortLabel: 'Notes', icon: BookOpen },
  { id: 'assistant', label: 'AI Assistant', shortLabel: 'AI', icon: Sparkles },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

interface AppShellProps {
  activeModule: ModuleId;
  onNavigate: (mod: ModuleId) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ activeModule, onNavigate, children }) => {
  const { authMode, displayName, emailVerified, resendVerificationEmail, refreshAuthUser, logout } =
    useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const {
    isOnline,
    syncState,
    pendingSyncCount,
    syncError,
    retrySyncNow,
    tasks,
    budgets,
    transactions,
    notifications,
    settings,
  } = useWorkspace();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const todayKey = getTodayKey(settings.timezone);
  const alertCount =
    notifications.filter((n) => !n.read).length +
    (settings.deadlineAlerts ? tasks.filter((t) => isTaskOverdue(t, todayKey)).length : 0) +
    (settings.budgetAlerts
      ? computeBudgetStatuses(budgets, transactions).filter((b) => b.isOverspent).length
      : 0);

  const currentNav = NAV_ITEMS.find((n) => n.id === activeModule) ?? NAV_ITEMS[0];

  const syncLabel =
    authMode === 'local'
      ? 'Local Device Storage'
      : !isOnline
      ? `Offline (${pendingSyncCount} queued)`
      : syncState === 'syncing'
      ? 'Synchronizing...'
      : syncState === 'waiting_sync'
      ? `${pendingSyncCount} waiting to sync`
      : syncState === 'sync_failed'
      ? 'Sync attention needed'
      : 'Synced';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Collapsible Sidebar */}
      <aside
        aria-label="Primary Sidebar Navigation"
        className={`hidden md:flex flex-col border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#111C32] transition-[width] duration-150 shrink-0 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="flex items-center gap-3 min-w-0 text-left"
          >
            <NexoraLogo size={32} className="shrink-0" />
            {!sidebarCollapsed && (
              <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                NEXORA
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
          {!sidebarCollapsed && (
            <div className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
              <span className="truncate">{syncLabel}</span>
              {pendingSyncCount > 0 && isOnline && authMode === 'cloud' && (
                <button
                  type="button"
                  onClick={retrySyncNow}
                  aria-label="Retry synchronization"
                  className="text-blue-600 dark:text-sky-400 hover:underline shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>{authMode === 'local' ? 'Exit Local Mode' : 'Sign Out'}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (Compact 1-row contract) */}
        <header className="h-14 md:h-16 px-4 md:px-6 border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#111C32] flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => onNavigate('overview')}
              className="md:hidden shrink-0"
              aria-label="Go to Overview"
            >
              <NexoraLogo size={28} />
            </button>
            <h1 className="font-display text-base md:text-lg font-semibold text-slate-900 dark:text-white truncate">
              {currentNav.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Open global search"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search</span>
            </button>

            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              aria-label="Quick create"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Quick Add</span>
            </button>

            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              aria-label={`Notifications (${alertCount} active)`}
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <Bell className="w-4 h-4" />
              {alertCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-[10px] font-mono text-white flex items-center justify-center">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label="Switch color theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => onNavigate('settings')}
              aria-label="Open profile and settings"
              className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 max-w-[140px]"
            >
              <span className="truncate">{displayName}</span>
            </button>
          </div>
        </header>

        {/* Connectivity & Email Verification Banners */}
        {!isOnline && (
          <div className="px-4 md:px-6 py-2 bg-amber-500/15 border-b border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>
                Offline Mode — Saved changes are stored locally in IndexedDB and will sync automatically when online.
              </span>
            </div>
            <span className="font-mono tabular-nums whitespace-nowrap shrink-0">
              {pendingSyncCount} queued
            </span>
          </div>
        )}

        {syncError && isOnline && (
          <div className="px-4 md:px-6 py-2 bg-rose-500/10 border-b border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-4">
            <span>{syncError}</span>
            <button
              type="button"
              onClick={retrySyncNow}
              className="font-medium underline whitespace-nowrap shrink-0"
            >
              Retry Sync
            </button>
          </div>
        )}

        {authMode === 'cloud' && !emailVerified && (
          <div className="px-4 md:px-6 py-2.5 bg-blue-600/10 border-b border-blue-500/30 text-xs text-blue-800 dark:text-sky-200 flex flex-wrap items-center justify-between gap-3">
            <span>
              Email verification required for cloud sync writes.{' '}
              {verificationNotice ? verificationNotice : 'Check your inbox for the verification link.'}
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  await resendVerificationEmail();
                  setVerificationNotice('Verification email resent.');
                }}
                className="font-medium underline"
              >
                Resend Email
              </button>
              <button
                type="button"
                onClick={refreshAuthUser}
                className="rounded bg-blue-600 px-2.5 py-1 text-white font-medium hover:bg-blue-700"
              >
                I Verified
              </button>
            </div>
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (<= 56px height, well under 15% sticky cap) */}
      <nav
        aria-label="Mobile Primary Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] flex items-center justify-around px-2"
      >
        {(
          [
            ['overview', 'Overview', LayoutDashboard],
            ['planner', 'Planner', CalendarDays],
            ['finance', 'Finance', Wallet],
            ['knowledge', 'Notes', BookOpen],
          ] as const
        ).map(([id, label, Icon]) => {
          const active = activeModule === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                onNavigate(id);
                setMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-[11px] font-medium min-h-[44px] ${
                active ? 'text-blue-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="More modules"
          className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 min-h-[44px]"
        >
          <Menu className="w-4 h-4" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile Secondary Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="All NEXORA Modules"
          className="md:hidden fixed inset-0 z-50 bg-slate-950/60 flex items-end"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-full rounded-t-2xl border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-display text-base font-semibold text-slate-900 dark:text-white">
                All Modules
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close modules menu"
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 px-3 py-3 rounded-lg border text-sm font-medium text-left ${
                      active
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={logout}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 py-3 text-sm font-medium text-rose-600 dark:text-rose-400"
            >
              <LogOut className="w-4 h-4" />
              {authMode === 'local' ? 'Exit Local Mode' : 'Sign Out'}
            </button>
          </div>
        </div>
      )}

      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={onNavigate}
      />
      <QuickActionModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
};
