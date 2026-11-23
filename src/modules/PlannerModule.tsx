import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Circle, Plus, Repeat, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  formatDisplayDate,
  getTodayKey,
  isTaskOverdue,
  sortTasksByUrgency,
} from '../lib/planner';
import { EventInputSchema, TaskInputSchema } from '../lib/validation';
import type { CalendarEvent, Task } from '../types/nexora';

type ViewMode = 'daily' | 'weekly' | 'monthly';

export const PlannerModule: React.FC = () => {
  const { settings, tasks, events, saveRecord, deleteRecord, toggleTaskCompletion } =
    useWorkspace();
  const todayKey = getTodayKey(settings.timezone);

  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Quick Task Form
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [dueDate, setDueDate] = useState(todayKey);
  const [category, setCategory] = useState('General');
  const [recurring, setRecurring] = useState<Task['recurring']>('none');
  const [notes, setNotes] = useState('');
  const [subtaskInput, setSubtaskInput] = useState('');
  const [busyTask, setBusyTask] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState<string | null>(null);

  // Event Form
  const [evTitle, setEvTitle] = useState('');
  const [evStart, setEvStart] = useState(`${todayKey}T09:00`);
  const [evEnd, setEvEnd] = useState(`${todayKey}T10:00`);
  const [evLocation, setEvLocation] = useState('');
  const [busyEvent, setBusyEvent] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ col: 'tasks' | 'events'; id: string; label: string } | null>(null);

  const filteredTasks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = tasks.filter((t) => {
      if (statusFilter === 'open' && t.status === 'completed') return false;
      if (statusFilter === 'completed' && t.status !== 'completed') return false;
      if (q && !t.title.toLowerCase().includes(q) && !(t.category ?? '').toLowerCase().includes(q)) {
        return false;
      }
      if (viewMode === 'daily' && t.dueDate) {
        return t.dueDate.slice(0, 10) <= todayKey || t.status !== 'completed';
      }
      return true;
    });
    return sortTasksByUrgency(list, todayKey);
  }, [tasks, statusFilter, searchTerm, viewMode, todayKey]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyTask) return;
    setTaskFeedback(null);

    const parsed = TaskInputSchema.safeParse({
      title,
      notes,
      priority,
      status: 'todo',
      dueDate: dueDate || undefined,
      category,
      recurring,
    });
    if (!parsed.success) {
      setTaskFeedback(parsed.error.issues[0]?.message ?? 'Please check task inputs.');
      return;
    }

    const subtasks = subtaskInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((s, idx) => ({ id: `sub_${Date.now()}_${idx}`, title: s, completed: false }));

    setBusyTask(true);
    try {
      await saveRecord<Task>(
        'tasks',
        {
          ...parsed.data,
          subtasks: subtasks.length > 0 ? subtasks : undefined,
          version: 1,
        },
        false
      );
      setTitle('');
      setNotes('');
      setSubtaskInput('');
      setTaskFeedback('Task saved.');
    } catch (err) {
      setTaskFeedback(err instanceof Error ? err.message : 'Unable to save task.');
    } finally {
      setBusyTask(false);
    }
  };

  const handleToggleSubtask = async (task: Task, subId: string) => {
    const nextSubs = (task.subtasks ?? []).map((s) =>
      s.id === subId ? { ...s, completed: !s.completed } : s
    );
    await saveRecord<Task>(
      'tasks',
      {
        id: task.id,
        title: task.title,
        notes: task.notes,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        category: task.category,
        recurring: task.recurring,
        subtasks: nextSubs,
        version: (task.version || 1) + 1,
      },
      true
    );
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyEvent) return;
    const parsed = EventInputSchema.safeParse({
      title: evTitle,
      startTime: evStart,
      endTime: evEnd,
      location: evLocation || undefined,
      allDay: false,
    });
    if (!parsed.success) {
      setTaskFeedback(parsed.error.issues[0]?.message ?? 'Check event inputs.');
      return;
    }
    setBusyEvent(true);
    try {
      await saveRecord<CalendarEvent>('events', parsed.data, false);
      setEvTitle('');
      setEvLocation('');
    } finally {
      setBusyEvent(false);
    }
  };

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [events]
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#111C32] border border-slate-200 dark:border-slate-800">
          {(['daily', 'weekly', 'monthly'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                viewMode === m
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter tasks..."
            aria-label="Filter planner tasks"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111C32] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'completed')}
            aria-label="Filter by task status"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111C32] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
          >
            <option value="all">All Statuses</option>
            <option value="open">Pending Only</option>
            <option value="completed">Completed Only</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tasks Column */}
        <section className="lg:col-span-7 space-y-6">
          <form
            onSubmit={handleCreateTask}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-4"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Add Task
            </h2>
            {taskFeedback && (
              <p className="text-xs text-blue-600 dark:text-sky-400" role="status">
                {taskFeedback}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor="planner-task-title"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Task Title
                </label>
                <input
                  id="planner-task-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Complete Algorithms problem set"
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="planner-priority"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Priority
                </label>
                <select
                  id="planner-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Task['priority'])}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="planner-due"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Due Date
                </label>
                <input
                  id="planner-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="planner-category"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Category
                </label>
                <input
                  id="planner-category"
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="planner-recurrence"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Recurrence
                </label>
                <select
                  id="planner-recurrence"
                  value={recurring}
                  onChange={(e) => setRecurring(e.target.value as Task['recurring'])}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  <option value="none">One-time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="planner-subtasks"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Subtasks (comma-separated, optional)
                </label>
                <input
                  id="planner-subtasks"
                  type="text"
                  value={subtaskInput}
                  onChange={(e) => setSubtaskInput(e.target.value)}
                  placeholder="Outline, Draft, Review"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busyTask}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {busyTask ? 'Saving...' : 'Create Task'}
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Task Queue ({filteredTasks.length})
            </h2>
            {filteredTasks.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                No tasks match the current filter.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTasks.map((task) => {
                  const overdue = isTaskOverdue(task, todayKey);
                  return (
                    <li key={task.id} className="py-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => toggleTaskCompletion(task)}
                          aria-label={`Toggle completion for ${task.title}`}
                          className="flex items-start gap-2.5 text-left min-w-0"
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p
                              className={`text-sm font-medium ${
                                task.status === 'completed'
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {task.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span>{task.priority}</span>
                              <span>·</span>
                              <span>{task.category || 'General'}</span>
                              <span>·</span>
                              <span
                                className={`font-mono tabular-nums ${
                                  overdue ? 'text-rose-600 dark:text-rose-400 font-medium' : ''
                                }`}
                              >
                                {overdue ? 'Overdue · ' : ''}
                                {formatDisplayDate(task.dueDate, settings.dateFormat)}
                              </span>
                              {task.recurring !== 'none' && (
                                <>
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1">
                                    <Repeat className="w-3 h-3" /> {task.recurring}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ col: 'tasks', id: task.id, label: task.title })
                          }
                          aria-label={`Delete task ${task.title}`}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {task.subtasks && task.subtasks.length > 0 && (
                        <div className="pl-7 space-y-1">
                          {task.subtasks.map((sub) => (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => handleToggleSubtask(task, sub.id)}
                              className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                            >
                              <span className={sub.completed ? 'line-through opacity-60' : ''}>
                                {sub.completed ? '[x]' : '[ ]'} {sub.title}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Calendar Events Column */}
        <section className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleCreateEvent}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-3.5"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600 dark:text-sky-400" />
              Schedule Event
            </h2>
            <div>
              <label
                htmlFor="ev-title"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Event Title
              </label>
              <input
                id="ev-title"
                type="text"
                value={evTitle}
                onChange={(e) => setEvTitle(e.target.value)}
                placeholder="Lecture, study group, or meeting"
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="ev-start"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Starts
                </label>
                <input
                  id="ev-start"
                  type="datetime-local"
                  value={evStart}
                  onChange={(e) => setEvStart(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="ev-end"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Ends
                </label>
                <input
                  id="ev-end"
                  type="datetime-local"
                  value={evEnd}
                  onChange={(e) => setEvEnd(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="ev-location"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Location (optional)
              </label>
              <input
                id="ev-location"
                type="text"
                value={evLocation}
                onChange={(e) => setEvLocation(e.target.value)}
                placeholder="Room, campus, or online link"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={busyEvent}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 py-2 text-sm font-medium text-slate-800 dark:text-white transition-colors"
            >
              {busyEvent ? 'Scheduling...' : 'Add Event'}
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Scheduled Events ({sortedEvents.length})
            </h2>
            {sortedEvents.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                No events scheduled yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortedEvents.map((ev) => (
                  <li key={ev.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {ev.title}
                      </p>
                      <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                        {ev.startTime.replace('T', ' ').slice(0, 16)} —{' '}
                        {ev.endTime.replace('T', ' ').slice(0, 16)}
                      </p>
                      {ev.location && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{ev.location}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteTarget({ col: 'events', id: ev.id, label: ev.title })
                      }
                      aria-label={`Delete event ${ev.title}`}
                      className="p-1.5 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.label ?? ''}"?`}
        description="This item will be permanently removed from your planner."
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
