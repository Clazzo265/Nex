import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  SlidersHorizontal,
} from 'lucide-react';
import { DEFAULT_WIDGETS, useWorkspace } from '../contexts/WorkspaceContext';
import { computeFinanceSummary, formatMinorCurrency } from '../lib/finance';
import { formatDisplayDate, getTodayKey, isTaskOverdue, sortTasksByUrgency } from '../lib/planner';
import type { DashboardWidgetConfig, ModuleId } from '../types/nexora';

interface OverviewModuleProps {
  onNavigate: (mod: ModuleId) => void;
}

export const OverviewModule: React.FC<OverviewModuleProps> = ({ onNavigate }) => {
  const {
    loadingData,
    profile,
    settings,
    tasks,
    events,
    assignments,
    transactions,
    goals,
    habits,
    habitEntries,
    projects,
    notes,
    vaultFiles,
    toggleTaskCompletion,
    updateSettingsData,
  } = useWorkspace();

  const [now, setNow] = useState(() => new Date());
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const todayKey = getTodayKey(settings.timezone);
  const currentMonthKey = todayKey.slice(0, 7);

  const widgets: DashboardWidgetConfig[] = useMemo(() => {
    const base =
      settings.dashboardWidgets && settings.dashboardWidgets.length > 0
        ? settings.dashboardWidgets
        : DEFAULT_WIDGETS;
    return [...base].sort((a, b) => a.order - b.order);
  }, [settings.dashboardWidgets]);

  const sortedPendingTasks = useMemo(
    () => sortTasksByUrgency(tasks.filter((t) => t.status !== 'completed'), todayKey),
    [tasks, todayKey]
  );

  const overdueCount = useMemo(
    () => tasks.filter((t) => isTaskOverdue(t, todayKey)).length,
    [tasks, todayKey]
  );

  const financeSummary = useMemo(
    () => computeFinanceSummary(transactions, settings.currency, currentMonthKey),
    [transactions, settings.currency, currentMonthKey]
  );

  const upcomingAssignments = useMemo(
    () =>
      assignments
        .filter((a) => a.status !== 'submitted' && a.status !== 'graded')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [assignments]
  );

  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === 'active'),
    [goals]
  );

  const habitsCompletedToday = useMemo(() => {
    const doneSet = new Set(
      habitEntries.filter((e) => e.dateKey === todayKey && e.completed).map((e) => e.habitId)
    );
    return habits.filter((h) => h.active && doneSet.has(h.id)).length;
  }, [habits, habitEntries, todayKey]);

  const activeHabitsCount = useMemo(
    () => habits.filter((h) => h.active).length,
    [habits]
  );

  const toggleWidgetVisibility = async (id: DashboardWidgetConfig['id']) => {
    const next = widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
    await updateSettingsData({ dashboardWidgets: next });
  };

  const moveWidget = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= widgets.length) return;
    const copy = [...widgets];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    const reindexed = copy.map((w, i) => ({ ...w, order: i }));
    await updateSettingsData({ dashboardWidgets: reindexed });
  };

  const formattedTime = (() => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: settings.timezone,
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(now);
    } catch {
      return now.toLocaleString();
    }
  })();

  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (loadingData) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Command Header */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {formattedTime} · {settings.timezone}
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {greeting}, {profile.displayName || 'User'}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {sortedPendingTasks.length === 0 && upcomingAssignments.length === 0
              ? 'Your workspace is clear. Add tasks, courses, or financial entries to begin tracking.'
              : `${sortedPendingTasks.length} pending task(s)${
                  overdueCount > 0 ? ` (${overdueCount} overdue)` : ''
                } · ${upcomingAssignments.length} open academic deliverable(s)`}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setCustomizing((c) => !c)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {customizing ? 'Done Customizing' : 'Customize Dashboard'}
          </button>
        </div>
      </section>

      {/* Dashboard Customizer */}
      {customizing && (
        <section className="rounded-xl border border-blue-500/40 bg-white dark:bg-[#111C32] p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Widget Layout & Visibility
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Reorder or hide dashboard widgets. Changes persist to your preferences.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {widgets.map((w, idx) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs"
              >
                <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                  {w.label}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveWidget(idx, -1)}
                    disabled={idx === 0}
                    aria-label={`Move ${w.label} up`}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveWidget(idx, 1)}
                    disabled={idx === widgets.length - 1}
                    aria-label={`Move ${w.label} down`}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleWidgetVisibility(w.id)}
                    aria-label={w.visible ? `Hide ${w.label}` : `Show ${w.label}`}
                    className="p-1 text-blue-600 dark:text-sky-400"
                  >
                    {w.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Real-Data Summary Metrics Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('planner')}
          className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-4 hover:border-blue-500/40 transition-colors"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">Open Tasks</p>
          <p className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-white">
            {sortedPendingTasks.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {overdueCount > 0 ? `${overdueCount} overdue` : 'On schedule'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('finance')}
          className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-4 hover:border-blue-500/40 transition-colors min-w-0"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Monthly Net ({settings.currency})
          </p>
          <p className="mt-1.5 font-mono tabular-nums text-base sm:text-xl lg:text-2xl font-semibold text-slate-900 dark:text-white leading-tight break-words">
            {formatMinorCurrency(financeSummary.actualNetMinor, settings.currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Actual recorded balance
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('academic')}
          className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-4 hover:border-blue-500/40 transition-colors"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">Academic Deadlines</p>
          <p className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-white">
            {upcomingAssignments.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Open coursework &amp; exams
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('goals')}
          className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-4 hover:border-blue-500/40 transition-colors"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400">Habits Today</p>
          <p className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-white">
            {habitsCompletedToday}/{activeHabitsCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {activeGoals.length} active goal(s)
          </p>
        </button>
      </section>

      {/* Customizable Widgets Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {widgets
          .filter((w) => w.visible)
          .map((w) => {
            if (w.id === 'priorities') {
              return (
                <div
                  key={w.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5"
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Daily Priorities &amp; Pending Tasks
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('planner')}
                      className="text-xs font-medium text-blue-600 dark:text-sky-400 inline-flex items-center gap-1 hover:underline"
                    >
                      Open Planner <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  {sortedPendingTasks.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-6">
                      No pending tasks. Use Quick Add or Planner to create your first priority.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sortedPendingTasks.slice(0, 5).map((task) => (
                        <li key={task.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3">
                          <button
                            type="button"
                            onClick={() => toggleTaskCompletion(task)}
                            className="flex items-center gap-2.5 min-w-0 text-left"
                          >
                            {task.status === 'completed' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <span className="text-sm text-slate-800 dark:text-slate-100 truncate">
                              {task.title}
                            </span>
                          </button>
                          <span className="pl-6 sm:pl-0 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                            {task.priority} · {formatDisplayDate(task.dueDate, settings.dateFormat)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }

            if (w.id === 'events') {
              const upcoming = [...events]
                .filter((ev) => ev.endTime >= todayKey)
                .sort((a, b) => a.startTime.localeCompare(b.startTime));
              return (
                <div
                  key={w.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5"
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Upcoming Events
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('planner')}
                      className="text-xs font-medium text-blue-600 dark:text-sky-400 inline-flex items-center gap-1 hover:underline"
                    >
                      Calendar <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  {upcoming.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-6">
                      No upcoming events scheduled.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {upcoming.slice(0, 5).map((ev) => (
                        <li key={ev.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                              {ev.title}
                            </p>
                            {ev.location && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {ev.location}
                              </p>
                            )}
                          </div>
                          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                            {ev.startTime.replace('T', ' ').slice(0, 16)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }

            if (w.id === 'academic') {
              return (
                <div
                  key={w.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5"
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Academic Deadlines
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('academic')}
                      className="text-xs font-medium text-blue-600 dark:text-sky-400 inline-flex items-center gap-1 hover:underline"
                    >
                      Academic Hub <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  {upcomingAssignments.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-6">
                      No upcoming academic deliverables recorded.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {upcomingAssignments.slice(0, 4).map((a) => (
                        <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-slate-800 dark:text-slate-100 truncate">
                              {a.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {a.activityType} · {a.status}
                            </p>
                          </div>
                          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                            {formatDisplayDate(a.dueDate, settings.dateFormat)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }

            if (w.id === 'finance') {
              return (
                <div
                  key={w.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5"
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Financial Overview ({currentMonthKey})
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('finance')}
                      className="text-xs font-medium text-blue-600 dark:text-sky-400 inline-flex items-center gap-1 hover:underline"
                    >
                      Open Finance <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <span className="text-slate-500 dark:text-slate-400">Actual Income</span>
                      <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMinorCurrency(financeSummary.actualIncomeMinor, settings.currency)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <span className="text-slate-500 dark:text-slate-400">Actual Expenses</span>
                      <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-rose-600 dark:text-rose-400">
                        {formatMinorCurrency(financeSummary.actualExpenseMinor, settings.currency)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <span className="text-slate-500 dark:text-slate-400">Estimated</span>
                      <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {formatMinorCurrency(financeSummary.estimatedExpenseMinor, settings.currency)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            if (w.id === 'goals') {
              return (
                <div
                  key={w.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5"
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Active Goals &amp; Habit Progress
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('goals')}
                      className="text-xs font-medium text-blue-600 dark:text-sky-400 inline-flex items-center gap-1 hover:underline"
                    >
                      Goals &amp; Habits <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  {activeGoals.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                      No active goals defined yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {activeGoals.slice(0, 4).map((g) => (
                        <li key={g.id}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                              {g.title}
                            </span>
                            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              {g.progressPercent}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-blue-600 dark:bg-sky-400"
                              style={{ width: `${g.progressPercent}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }

            if (w.id === 'projects') {
              return (
                <div
                  key={w.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5"
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Recent Developer Projects
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('developer')}
                      className="text-xs font-medium text-blue-600 dark:text-sky-400 inline-flex items-center gap-1 hover:underline"
                    >
                      Workspace <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  {projects.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                      No software projects added yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {projects.slice(0, 4).map((p) => (
                        <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-800 dark:text-slate-100 truncate">
                            {p.name}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {p.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }

            if (w.id === 'documents') {
              return (
                <div
                  key={w.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5"
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Recent Notes &amp; Documents
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('knowledge')}
                      className="text-xs font-medium text-blue-600 dark:text-sky-400 inline-flex items-center gap-1 hover:underline"
                    >
                      Library <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  {notes.length === 0 && vaultFiles.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                      No notes or vault documents indexed yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {notes.slice(0, 3).map((n) => (
                        <li key={n.id} className="py-2 flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-800 dark:text-slate-100 truncate">
                            {n.title}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">Note</span>
                        </li>
                      ))}
                      {vaultFiles.slice(0, 2).map((f) => (
                        <li key={f.id} className="py-2 flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-800 dark:text-slate-100 truncate">
                            {f.name}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">Vault</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }

            return (
              <div
                key={w.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    NEXORA AI Assistant
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigate('assistant')}
                    className="text-xs font-medium text-blue-600 dark:text-sky-400 inline-flex items-center gap-1 hover:underline"
                  >
                    Open Assistant <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Request study plans, break goals into actionable tasks, or ask for financial
                  explanations using only the workspace data you explicitly authorize.
                </p>
              </div>
            );
          })}
      </section>
    </div>
  );
};
