import React, { useMemo, useState } from 'react';
import { Code2, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { DevProjectInputSchema, DevTaskInputSchema } from '../lib/validation';
import type { DevProject, DevTask } from '../types/nexora';

export const DevWorkspaceModule: React.FC = () => {
  const { projects, devTasks, saveRecord, deleteRecord } = useWorkspace();

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [name, setName] = useState('');
  const [techInput, setTechInput] = useState('TypeScript, React');
  const [repoUrl, setRepoUrl] = useState('');
  const [description, setDescription] = useState('');

  const [taskTitle, setTaskTitle] = useState('');
  const [taskKind, setTaskKind] = useState<DevTask['kind']>('feature');
  const [taskPriority, setTaskPriority] = useState<DevTask['priority']>('medium');
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    col: 'projects' | 'developerTasks';
    id: string;
    label: string;
  } | null>(null);

  const activeProjectId = selectedProjectId || projects[0]?.id || '';

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const technologies = techInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    const parsed = DevProjectInputSchema.safeParse({
      name,
      description: description || undefined,
      technologies,
      status: 'active',
      repoUrl: repoUrl || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid project details.');
      return;
    }
    const created = await saveRecord<DevProject>('projects', parsed.data, false);
    setSelectedProjectId(created.id);
    setName('');
    setDescription('');
    setRepoUrl('');
  };

  const handleAddDevTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = DevTaskInputSchema.safeParse({
      projectId: activeProjectId,
      title: taskTitle,
      kind: taskKind,
      status: 'open',
      priority: taskPriority,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Select or create a project first.');
      return;
    }
    await saveRecord<DevTask>('developerTasks', parsed.data, false);
    setTaskTitle('');
  };

  const visibleDevTasks = useMemo(
    () => devTasks.filter((t) => !activeProjectId || t.projectId === activeProjectId),
    [devTasks, activeProjectId]
  );

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
        {/* Projects */}
        <section className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleAddProject}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-3"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-600 dark:text-sky-400" />
              New Software Project
            </h2>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              required
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <input
              type="text"
              value={techInput}
              onChange={(e) => setTechInput(e.target.value)}
              placeholder="Technologies (comma-separated)"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="GitHub / Repository reference URL (optional)"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Architecture notes or scope..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 py-2 text-xs font-medium text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Project
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Projects ({projects.length})
            </h2>
            {projects.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                No projects registered yet.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {projects.map((p) => {
                  const selected = p.id === activeProjectId;
                  return (
                    <li
                      key={p.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        selected
                          ? 'border-blue-600 bg-blue-600/5'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedProjectId(p.id)}
                          className="text-left min-w-0 flex-1"
                        >
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {p.status}
                            {p.technologies?.length ? ` · ${p.technologies.join(', ')}` : ''}
                          </p>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.repoUrl && (
                            <a
                              href={p.repoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open repository for ${p.name}`}
                              className="p-1 text-blue-600 dark:text-sky-400 hover:underline"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({ col: 'projects', id: p.id, label: p.name })
                            }
                            aria-label={`Delete project ${p.name}`}
                            className="p-1 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Issue / Bug / Feature Tracker */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Development Tracker (Tasks, Bugs &amp; Releases)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Repository URLs are stored as bookmarks; live GitHub sync is not configured.
              </p>
            </div>
          </div>

          <form onSubmit={handleAddDevTask} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Issue, bug, or feature title..."
              required
              className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <select
              value={taskKind}
              onChange={(e) => setTaskKind(e.target.value as DevTask['kind'])}
              aria-label="Issue type"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="feature">Feature</option>
              <option value="bug">Bug</option>
              <option value="task">Task</option>
              <option value="test">Test Note</option>
            </select>
            <div className="flex gap-2">
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as DevTask['priority'])}
                aria-label="Issue priority"
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-2 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="low">Low</option>
                <option value="medium">Med</option>
                <option value="high">High</option>
              </select>
              <button
                type="submit"
                disabled={!activeProjectId}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </form>

          {visibleDevTasks.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              {activeProjectId
                ? 'No engineering items logged for this project yet.'
                : 'Create a project on the left to begin tracking bugs and features.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleDevTasks.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {t.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t.kind} · {t.priority} priority
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={t.status}
                      onChange={(e) =>
                        saveRecord<DevTask>(
                          'developerTasks',
                          { ...t, status: e.target.value as DevTask['status'] },
                          true
                        )
                      }
                      aria-label={`Status for ${t.title}`}
                      className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteTarget({ col: 'developerTasks', id: t.id, label: t.title })
                      }
                      aria-label={`Delete issue ${t.title}`}
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.label ?? ''}"?`}
        description="This engineering item will be permanently removed."
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
