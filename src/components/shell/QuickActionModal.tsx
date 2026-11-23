import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { parseMajorToMinor } from '../../lib/finance';
import { getTodayKey } from '../../lib/planner';
import {
  EventInputSchema,
  NoteInputSchema,
  TaskInputSchema,
  TransactionInputSchema,
} from '../../lib/validation';
import type { CalendarEvent, KnowledgeNote, Task, Transaction } from '../../types/nexora';

type QuickType = 'task' | 'transaction' | 'note' | 'event';

interface QuickActionModalProps {
  open: boolean;
  onClose: () => void;
}

export const QuickActionModal: React.FC<QuickActionModalProps> = ({ open, onClose }) => {
  const { settings, saveRecord, logAudit } = useWorkspace();
  const today = getTodayKey(settings.timezone);

  const [kind, setKind] = useState<QuickType>('task');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [dueDate, setDueDate] = useState(today);
  const [txType, setTxType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [amountMajor, setAmountMajor] = useState('');
  const [category, setCategory] = useState('General');
  const [noteContent, setNoteContent] = useState('');
  const [eventStart, setEventStart] = useState(`${today}T09:00`);
  const [eventEnd, setEventEnd] = useState(`${today}T10:00`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const resetAndClose = () => {
    setTitle('');
    setAmountMajor('');
    setNoteContent('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);

    try {
      if (kind === 'task') {
        const parsed = TaskInputSchema.safeParse({
          title,
          priority,
          status: 'todo',
          dueDate,
          category,
          recurring: 'none',
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Invalid task input');
          setBusy(false);
          return;
        }
        await saveRecord<Task>('tasks', { ...parsed.data, version: 1 }, false);
      } else if (kind === 'transaction') {
        const parsed = TransactionInputSchema.safeParse({
          type: txType,
          amountMajor,
          currency: settings.currency,
          category: category || 'General',
          description: title,
          transactionDate: dueDate || today,
          isEstimate: false,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Invalid transaction input');
          setBusy(false);
          return;
        }
        const amountMinor = parseMajorToMinor(parsed.data.amountMajor);
        const saved = await saveRecord<Transaction>(
          'transactions',
          {
            type: parsed.data.type,
            amountMinor,
            currency: parsed.data.currency,
            category: parsed.data.category,
            description: parsed.data.description,
            transactionDate: parsed.data.transactionDate,
            isEstimate: false,
            idempotencyKey: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          },
          false
        );
        await logAudit(
          'transaction',
          saved.id,
          'create',
          `Recorded ${parsed.data.type} of ${parsed.data.amountMajor} ${parsed.data.currency}`
        );
      } else if (kind === 'note') {
        const parsed = NoteInputSchema.safeParse({
          title,
          content: noteContent,
          category: category || 'General',
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Invalid note input');
          setBusy(false);
          return;
        }
        await saveRecord<KnowledgeNote>(
          'notes',
          { ...parsed.data, isFavorite: false, version: 1 },
          false
        );
      } else if (kind === 'event') {
        const parsed = EventInputSchema.safeParse({
          title,
          startTime: eventStart,
          endTime: eventEnd,
          category: category || 'Schedule',
          allDay: false,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Invalid event input');
          setBusy(false);
          return;
        }
        await saveRecord<CalendarEvent>('events', parsed.data, false);
      }
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save item.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick Add"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      onClick={resetAndClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Quick Create</h2>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="Close quick create"
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800">
          {(
            [
              ['task', 'Task'],
              ['transaction', 'Transaction'],
              ['note', 'Note'],
              ['event', 'Event'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setKind(id);
                setError(null);
              }}
              className={`flex-1 py-1.5 px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                kind === id
                  ? 'bg-white dark:bg-[#111C32] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label
              htmlFor="quick-title"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {kind === 'transaction' ? 'Description' : 'Title'}
            </label>
            <input
              id="quick-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === 'transaction' ? 'e.g., Campus groceries or allowance' : 'Enter title...'
              }
              required={kind !== 'transaction'}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {kind === 'task' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="quick-priority"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Priority
                </label>
                <select
                  id="quick-priority"
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
                  htmlFor="quick-due"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Due Date
                </label>
                <input
                  id="quick-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {kind === 'transaction' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="quick-tx-type"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Type
                </label>
                <select
                  id="quick-tx-type"
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as 'expense' | 'income' | 'transfer')}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="quick-amount"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Amount ({settings.currency})
                </label>
                <input
                  id="quick-amount"
                  type="text"
                  inputMode="decimal"
                  value={amountMajor}
                  onChange={(e) => setAmountMajor(e.target.value)}
                  placeholder="2500.00"
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {kind === 'note' && (
            <div>
              <label
                htmlFor="quick-note-body"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Content
              </label>
              <textarea
                id="quick-note-body"
                rows={4}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write notes, concepts, or key takeaways..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
          )}

          {kind === 'event' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="quick-ev-start"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Start
                </label>
                <input
                  id="quick-ev-start"
                  type="datetime-local"
                  value={eventStart}
                  onChange={(e) => setEventStart(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="quick-ev-end"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  End
                </label>
                <input
                  id="quick-ev-end"
                  type="datetime-local"
                  value={eventEnd}
                  onChange={(e) => setEventEnd(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="quick-category"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Category
            </label>
            <input
              id="quick-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
