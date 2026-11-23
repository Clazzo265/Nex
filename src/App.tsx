import React, { useEffect, useState } from 'react';
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

const NexoraWorkspaceRouter: React.FC = () => {
  const { authMode } = useAuth();
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

  if (authMode === 'unauthenticated') {
    return <AuthScreen />;
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
