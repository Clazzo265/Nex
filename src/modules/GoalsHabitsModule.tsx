import React, { useState } from 'react';
import { Check, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { computeGoalProgressFromMilestones, computeHabitStreak } from '../lib/goals';
import { getTodayKey } from '../lib/planner';
import { GoalInputSchema, HabitInputSchema } from '../lib/validation';
import type { Goal, Habit, HabitEntry } from '../types/nexora';

export const GoalsHabitsModule: React.FC = () => {
  const { settings, goals, habits, habitEntries, saveRecord, deleteRecord } = useWorkspace();
  const todayKey = getTodayKey(settings.timezone);

  const [goalTitle, setGoalTitle] = useState('');
  const [goalHorizon, setGoalHorizon] = useState<Goal['horizon']>('short_term');
  const [goalDate, setGoalDate] = useState('');
  const [milestoneText, setMilestoneText] = useState('');

  const [habitTitle, setHabitTitle] = useState('');
  const [habitFreq, setHabitFreq] = useState<Habit['frequency']>('daily');
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    col: 'goals' | 'habits';
    id: string;
    label: string;
  } | null>(null);

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = GoalInputSchema.safeParse({
      title: goalTitle,
      horizon: goalHorizon,
      targetDate: goalDate || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid goal input.');
      return;
    }
    const milestones = milestoneText
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((m, idx) => ({ id: `ms_${Date.now()}_${idx}`, title: m, completed: false }));

    await saveRecord<Goal>(
      'goals',
      {
        ...parsed.data,
        status: 'active',
        progressPercent: 0,
        milestones: milestones.length > 0 ? milestones : undefined,
      },
      false
    );
    setGoalTitle('');
    setGoalDate('');
    setMilestoneText('');
  };

  const handleToggleMilestone = async (goal: Goal, msId: string) => {
    const nextMilestones = (goal.milestones ?? []).map((m) =>
      m.id === msId ? { ...m, completed: !m.completed } : m
    );
    const updatedGoal: Goal = { ...goal, milestones: nextMilestones };
    const progressPercent = computeGoalProgressFromMilestones(updatedGoal);
    await saveRecord<Goal>(
      'goals',
      {
        ...updatedGoal,
        progressPercent,
        status: progressPercent === 100 ? 'completed' : goal.status,
      },
      true
    );
  };

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = HabitInputSchema.safeParse({
      title: habitTitle,
      frequency: habitFreq,
      targetPerPeriod: 1,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid habit input.');
      return;
    }
    await saveRecord<Habit>('habits', { ...parsed.data, active: true }, false);
    setHabitTitle('');
  };

  const handleToggleHabitToday = async (habit: Habit) => {
    const existing = habitEntries.find(
      (e) => e.habitId === habit.id && e.dateKey === todayKey && e.completed
    );
    if (existing) {
      await deleteRecord('habitEntries', existing.id);
    } else {
      await saveRecord<HabitEntry>(
        'habitEntries',
        { habitId: habit.id, dateKey: todayKey, completed: true },
        false
      );
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Goals */}
        <section className="lg:col-span-7 space-y-6">
          <form
            onSubmit={handleAddGoal}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-3"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Create Personal Goal
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                placeholder="Goal title..."
                required
                className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
              <select
                value={goalHorizon}
                onChange={(e) => setGoalHorizon(e.target.value as Goal['horizon'])}
                aria-label="Goal horizon"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="short_term">Short-Term</option>
                <option value="long_term">Long-Term</option>
              </select>
              <input
                type="text"
                value={milestoneText}
                onChange={(e) => setMilestoneText(e.target.value)}
                placeholder="Milestones (comma-separated, optional)"
                className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="date"
                value={goalDate}
                onChange={(e) => setGoalDate(e.target.value)}
                aria-label="Target date"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-medium text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Goal
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Goals ({goals.length})
            </h2>
            {goals.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                No goals created yet. Set a short-term or long-term goal above.
              </p>
            ) : (
              <div className="space-y-4">
                {goals.map((g) => (
                  <div
                    key={g.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {g.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {g.horizon === 'short_term' ? 'Short-Term' : 'Long-Term'} · {g.status}
                          {g.targetDate ? ` · Target ${g.targetDate}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            saveRecord<Goal>(
                              'goals',
                              { ...g, status: g.status === 'paused' ? 'active' : 'paused' },
                              true
                            )
                          }
                          aria-label={g.status === 'paused' ? `Resume ${g.title}` : `Pause ${g.title}`}
                          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {g.status === 'paused' ? (
                            <Play className="w-3.5 h-3.5" />
                          ) : (
                            <Pause className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ col: 'goals', id: g.id, label: g.title })}
                          aria-label={`Delete goal ${g.title}`}
                          className="p-1.5 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500 dark:text-slate-400">Progress</span>
                        <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                          {g.progressPercent}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 dark:bg-sky-400"
                          style={{ width: `${g.progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {g.milestones && g.milestones.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {g.milestones.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleToggleMilestone(g, m.id)}
                            className="w-full text-left flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
                          >
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center ${
                                m.completed
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {m.completed && <Check className="w-3 h-3" />}
                            </span>
                            <span className={m.completed ? 'line-through opacity-60' : ''}>
                              {m.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={g.progressPercent}
                        aria-label={`Adjust progress for ${g.title}`}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          saveRecord<Goal>(
                            'goals',
                            {
                              ...g,
                              progressPercent: val,
                              status: val === 100 ? 'completed' : 'active',
                            },
                            true
                          );
                        }}
                        className="w-full accent-blue-600"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Habits */}
        <section className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleAddHabit}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-3"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Build a Steady Habit
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Every completed day counts toward your momentum—never penalized for rest days.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={habitTitle}
                onChange={(e) => setHabitTitle(e.target.value)}
                placeholder="e.g., 30 min reading"
                required
                className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
              <select
                value={habitFreq}
                onChange={(e) => setHabitFreq(e.target.value as Habit['frequency'])}
                aria-label="Habit frequency"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-2 text-xs font-medium text-white shrink-0"
              >
                Add
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Habit Check-In ({todayKey})
            </h2>
            {habits.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                No habits added yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {habits.map((h) => {
                  const doneToday = habitEntries.some(
                    (e) => e.habitId === h.id && e.dateKey === todayKey && e.completed
                  );
                  const stats = computeHabitStreak(habitEntries, h.id, todayKey);
                  return (
                    <li key={h.id} className="py-3 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleHabitToday(h)}
                        className="flex items-center gap-3 text-left min-w-0"
                      >
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            doneToday
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {doneToday && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {h.title}
                          </p>
                          <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {h.frequency} · {stats.currentStreak}d streak · {stats.totalCompletions}{' '}
                            total
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ col: 'habits', id: h.id, label: h.title })}
                        aria-label={`Delete habit ${h.title}`}
                        className="p-1.5 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.label ?? ''}"?`}
        description="This item will be permanently removed."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteRecord(deleteTarget.col, deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
};
