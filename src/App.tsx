import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { AuthScreen } from './components/auth/AuthScreen';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { NexoraLogo } from './components/common/NexoraLogo';
import { AppShell } from './components/shell/AppShell';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { AcademicModule } from './modules/AcademicModule';
import { AIAssistantModule } from './modules/AIAssistantModule';
import { DevWorkspaceModule } from './modules/DevWorkspaceModule';
import { DigitalVaultModule } from './modules/DigitalVaultModule';
import { FinanceModule } from './modules/FinanceModule';
import { GoalsHabitsModule } from './modules/GoalsHabitsModule';
import { KnowledgeLibraryModule } from './modules/KnowledgeLibraryModule';
import { OverviewModule } from './modules/OverviewModule';
import { PlannerModule } from './modules/PlannerModule';
import { SettingsModule } from './modules/SettingsModule';
import type { ModuleId } from './types/nexora';

const VALID_MODULES: ReadonlySet<ModuleId> = new Set([
  'overview',
  'planner',
  'academic',
  'finance',
  'goals',
  'developer',
  'vault',
  'knowledge',
  'assistant',
  'settings',
]);

function readInitialModule(): ModuleId {
  if (typeof window === 'undefined') return 'overview';
  const hash = window.location.hash.replace(/^#\/?/, '') as ModuleId;
  return VALID_MODULES.has(hash) ? hash : 'overview';
}

const LocalWorkspaceUnlockGate: React.FC = () => {
  const { activeLocalWorkspace, unlockLocalWorkspace, logout } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const ok = await unlockLocalWorkspace(pin);
      if (!ok) {
        setError('Incorrect PIN for this local workspace.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1220] p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 space-y-5">
        <div className="flex items-center gap-3">
          <NexoraLogo size={32} />
          <div>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Unlock Local Workspace
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeLocalWorkspace?.label ?? 'Local Workspace'}
            </p>
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
          >
            {error}
          </div>
        )}
        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label
              htmlFor="local-pin-unlock"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Workspace PIN
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                id="local-pin-unlock"
                type="password"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN"
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={logout}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              Switch Account
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Unlocking...' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const NexoraWorkspaceRouter: React.FC = () => {
  const { authMode, emailVerified, localWorkspaceLocked } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleId>(readInitialModule);

  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash.replace(/^#\/?/, '') as ModuleId;
      if (VALID_MODULES.has(next)) {
        setActiveModule(next);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleNavigate = (mod: ModuleId) => {
    setActiveModule(mod);
    if (window.location.hash !== `#${mod}`) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#${mod}`
      );
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (authMode === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-slate-100 gap-4">
        <NexoraLogo size={48} />
        <p className="font-display text-sm font-semibold tracking-wide text-slate-600 dark:text-slate-300">
          Initializing NEXORA workspace...
        </p>
      </div>
    );
  }

  // Require complete verification before initializing Firestore profile/listeners
  if (authMode === 'unauthenticated' || (authMode === 'cloud' && !emailVerified)) {
    return <AuthScreen />;
  }

  if (authMode === 'local' && localWorkspaceLocked) {
    return <LocalWorkspaceUnlockGate />;
  }

  return (
    <WorkspaceProvider>
      <AppShell activeModule={activeModule} onNavigate={handleNavigate}>
        {activeModule === 'overview' && <OverviewModule onNavigate={handleNavigate} />}
        {activeModule === 'planner' && <PlannerModule />}
        {activeModule === 'academic' && <AcademicModule />}
        {activeModule === 'finance' && <FinanceModule />}
        {activeModule === 'goals' && <GoalsHabitsModule />}
        {activeModule === 'developer' && <DevWorkspaceModule />}
        {activeModule === 'vault' && <DigitalVaultModule />}
        {activeModule === 'knowledge' && <KnowledgeLibraryModule />}
        {activeModule === 'assistant' && <AIAssistantModule />}
        {activeModule === 'settings' && <SettingsModule />}
      </AppShell>
    </WorkspaceProvider>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <NexoraWorkspaceRouter />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
