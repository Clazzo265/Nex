import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Star, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { clearNoteDraft, loadNoteDraft, saveNoteDraft } from '../lib/offlineDb';
import { NoteInputSchema } from '../lib/validation';
import type { KnowledgeNote } from '../types/nexora';

export const KnowledgeLibraryModule: React.FC = () => {
  const { uid } = useAuth();
  const { notes, courses, projects, saveRecord, deleteRecord } = useWorkspace();

  const [selectedId, setSelectedId] = useState<string>('new');
  const [search, setSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Study Reference');
  const [tagsInput, setTagsInput] = useState('');
  const [linkedCourseId, setLinkedCourseId] = useState('');
  const [linkedProjectId, setLinkedProjectId] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'recovered'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeNote | null>(null);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  // Load selected note or recover interrupted local draft
  useEffect(() => {
    let active = true;
    (async () => {
      const draft = await loadNoteDraft(uid, selectedId);
      if (!active) return;
      if (selectedNote) {
        if (draft && draft.savedAt > selectedNote.updatedAt) {
          setTitle(draft.title);
          setContent(draft.content);
          setSaveStatus('recovered');
        } else {
          setTitle(selectedNote.title);
          setContent(selectedNote.content);
          setSaveStatus('idle');
        }
        setCategory(selectedNote.category || 'Study Reference');
        setTagsInput((selectedNote.tags ?? []).join(', '));
        setLinkedCourseId(selectedNote.linkedCourseId || '');
        setLinkedProjectId(selectedNote.linkedProjectId || '');
      } else {
        if (draft && (draft.title || draft.content)) {
          setTitle(draft.title);
          setContent(draft.content);
          setSaveStatus('recovered');
        } else {
          setTitle('');
          setContent('');
          setCategory('Study Reference');
          setTagsInput('');
          setLinkedCourseId('');
          setLinkedProjectId('');
          setSaveStatus('idle');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedId, selectedNote, uid]);

  // Autosave draft to IndexedDB while typing (never lose unsaved edits)
  useEffect(() => {
    if (!title && !content) return;
    const handle = window.setTimeout(() => {
      saveNoteDraft(uid, selectedId, title, content);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [uid, selectedId, title, content]);

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const tags = tagsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 15);

    const parsed = NoteInputSchema.safeParse({
      title,
      content,
      category: category || undefined,
      tags: tags.length > 0 ? tags : undefined,
      linkedCourseId: linkedCourseId || undefined,
      linkedProjectId: linkedProjectId || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid note details.');
      return;
    }

    setSaveStatus('saving');
    try {
      const saved = await saveRecord<KnowledgeNote>(
        'notes',
        {
          ...(selectedNote ? { id: selectedNote.id } : {}),
          ...parsed.data,
          isFavorite: selectedNote?.isFavorite ?? false,
          version: (selectedNote?.version ?? 0) + 1,
        },
        Boolean(selectedNote)
      );
      await clearNoteDraft(uid, selectedId);
      setSelectedId(saved.id);
      setSaveStatus('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save note.');
      setSaveStatus('idle');
    }
  };

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (favoritesOnly && !n.isFavorite) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        (n.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [notes, search, favoritesOnly]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Sidebar List */}
      <section className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Library ({filteredNotes.length})
          </h2>
          <button
            type="button"
            onClick={() => setSelectedId('new')}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-2.5 py-1.5 text-xs font-medium text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            New Note
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes or tags..."
            className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
          />
          <button
            type="button"
            onClick={() => setFavoritesOnly((f) => !f)}
            aria-label="Filter favorite notes"
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
              favoritesOnly
                ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
          </button>
        </div>

        {filteredNotes.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
            No saved notes match your search.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredNotes.map((n) => (
              <li key={n.id} className="py-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedId(n.id)}
                  className={`flex-1 min-w-0 text-left px-2 py-1.5 rounded-md ${
                    selectedId === n.id
                      ? 'bg-blue-600/10 text-blue-700 dark:text-sky-300'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <p className="text-sm font-medium truncate">{n.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {n.category || 'Note'}
                    {n.tags?.length ? ` · ${n.tags.join(', ')}` : ''}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    saveRecord<KnowledgeNote>('notes', { ...n, isFavorite: !n.isFavorite }, true)
                  }
                  aria-label={`Favorite ${n.title}`}
                  className={`p-1 ${n.isFavorite ? 'text-amber-500' : 'text-slate-400'}`}
                >
                  <Star className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Editor */}
      <section className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5">
        <form onSubmit={handleSaveNote} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {saveStatus === 'saving'
                ? 'Saving note...'
                : saveStatus === 'saved'
                ? 'Saved to workspace'
                : saveStatus === 'recovered'
                ? 'Unsaved draft recovered from local storage'
                : 'Autosave draft active'}
            </span>
            {selectedNote && (
              <button
                type="button"
                onClick={() => setDeleteTarget(selectedNote)}
                className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:underline"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Note
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title..."
            required
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3.5 py-2.5 text-base font-semibold text-slate-900 dark:text-white"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Category"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
            />
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Tags (comma-separated)"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
            />
            <select
              value={linkedCourseId}
              onChange={(e) => setLinkedCourseId(e.target.value)}
              aria-label="Link to course"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
            >
              <option value="">No linked course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
            <select
              value={linkedProjectId}
              onChange={(e) => setLinkedProjectId(e.target.value)}
              aria-label="Link to project"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
            >
              <option value="">No linked project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <textarea
            rows={12}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write concepts, vocabulary, book summaries, or research notes..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] p-3.5 text-sm leading-relaxed text-slate-900 dark:text-white"
          />

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2 text-sm font-medium text-white"
            >
              Save Note
            </button>
          </div>
        </form>
      </section>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title ?? ''}"?`}
        description="This knowledge note will be permanently removed."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteRecord('notes', deleteTarget.id);
            await clearNoteDraft(uid, deleteTarget.id);
            setSelectedId('new');
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
};
