import React, { useState } from 'react';
import { Check, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { computeFinanceSummary, formatMinorCurrency } from '../lib/finance';
import { getTodayKey } from '../lib/planner';
import type { Task } from '../types/nexora';

interface ProposedTask {
  title: string;
  priority: Task['priority'];
  category: string;
  notes: string;
  accepted?: boolean;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  proposedTasks?: ProposedTask[];
}

export const AIAssistantModule: React.FC = () => {
  const {
    isOnline,
    settings,
    tasks,
    courses,
    assignments,
    transactions,
    goals,
    notes,
    saveRecord,
  } = useWorkspace();

  const [mode, setMode] = useState<'chat' | 'plan_tasks' | 'study_plan' | 'finance_explain'>(
    'chat'
  );
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Explicit user consent toggles for context sharing
  const [allowTasks, setAllowTasks] = useState(false);
  const [allowAcademic, setAllowAcademic] = useState(false);
  const [allowFinance, setAllowFinance] = useState(false);
  const [allowGoals, setAllowGoals] = useState(false);
  const [allowNotes, setAllowNotes] = useState(false);

  const [turns, setTurns] = useState<ChatTurn[]>([]);

  const buildConsentedContext = () => {
    const todayKey = getTodayKey(settings.timezone);
    const out: Record<string, string> = {};
    if (allowTasks) {
      const pending = tasks.filter((t) => t.status !== 'completed').slice(0, 10);
      out.tasksSummary =
        pending.length > 0
          ? pending.map((t) => `- ${t.title} (${t.priority}, due ${t.dueDate || 'none'})`).join('\n')
          : 'No open tasks.';
    }
    if (allowAcademic) {
      out.academicSummary =
        courses.length > 0
          ? `Courses: ${courses.map((c) => `${c.code} ${c.title}`).join('; ')}. Open assignments: ${assignments.filter((a) => a.status !== 'graded').length}`
          : 'No courses recorded.';
    }
    if (allowFinance) {
      const summary = computeFinanceSummary(transactions, settings.currency, todayKey.slice(0, 7));
      out.financeSummary = `Monthly (${todayKey.slice(0, 7)}) Actual Income: ${formatMinorCurrency(
        summary.actualIncomeMinor,
        settings.currency
      )}, Actual Expenses: ${formatMinorCurrency(summary.actualExpenseMinor, settings.currency)}.`;
    }
    if (allowGoals) {
      out.goalsSummary =
        goals.length > 0
          ? goals.map((g) => `- ${g.title} (${g.status}, ${g.progressPercent}%)`).join('\n')
          : 'No goals recorded.';
    }
    if (allowNotes) {
      out.notesSummary =
        notes.length > 0
          ? notes.slice(0, 6).map((n) => `- ${n.title}: ${n.content.slice(0, 150)}`).join('\n')
          : 'No notes recorded.';
    }
    return out;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    setError(null);

    if (!isOnline) {
      setError('You are currently offline. AI Assistant requires an active connection, while all other NEXORA modules continue working locally.');
      return;
    }

    const userText = prompt.trim();
    const userTurn: ChatTurn = { id: `u_${Date.now()}`, role: 'user', text: userText };
    setTurns((prev) => [...prev, userTurn]);
    setPrompt('');
    setBusy(true);

    try {
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userText,
          mode,
          consentedContext: buildConsentedContext(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Assistant service unavailable right now.');
        return;
      }
      setTurns((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: data.reply,
          proposedTasks: Array.isArray(data.proposedTasks) ? data.proposedTasks : [],
        },
      ]);
    } catch {
      setError('Could not connect to the backend assistant endpoint. Your workspace data remains safe.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveTask = async (turnId: string, idx: number, proposal: ProposedTask) => {
    await saveRecord<Task>(
      'tasks',
      {
        title: proposal.title,
        priority: proposal.priority,
        status: 'todo',
        category: proposal.category || 'AI Suggested',
        notes: proposal.notes || undefined,
        recurring: 'none',
        version: 1,
      },
      false
    );
    setTurns((prev) =>
      prev.map((t) =>
        t.id === turnId && t.proposedTasks
          ? {
              ...t,
              proposedTasks: t.proposedTasks.map((pt, i) =>
                i === idx ? { ...pt, accepted: true } : pt
              ),
            }
          : t
      )
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Privacy & Context Consent Panel */}
      <section className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-4">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-sky-400 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Data Permission Controls
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              The assistant only receives data categories you explicitly check below. It can never
              silently modify records or delete files.
            </p>
          </div>
        </div>

        <div className="space-y-2.5 text-xs text-slate-700 dark:text-slate-200">
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={allowTasks}
              onChange={(e) => setAllowTasks(e.target.checked)}
            />
            Share open tasks &amp; priorities
          </label>
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={allowAcademic}
              onChange={(e) => setAllowAcademic(e.target.checked)}
            />
            Share courses &amp; assignments
          </label>
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={allowFinance}
              onChange={(e) => setAllowFinance(e.target.checked)}
            />
            Share monthly financial totals
          </label>
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={allowGoals}
              onChange={(e) => setAllowGoals(e.target.checked)}
            />
            Share active goals
          </label>
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={allowNotes}
              onChange={(e) => setAllowNotes(e.target.checked)}
            />
            Share recent Knowledge Library notes
          </label>
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
          <label
            htmlFor="ai-mode"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Assistant Mode
          </label>
          <select
            id="ai-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
          >
            <option value="chat">General Q&amp;A &amp; Concept Explanations</option>
            <option value="plan_tasks">Break Goals into Proposed Tasks</option>
            <option value="study_plan">Generate Study Plan Proposals</option>
            <option value="finance_explain">Explain Financial Summary</option>
          </select>
        </div>
      </section>

      {/* Conversation Area */}
      <section className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 flex flex-col min-h-[480px]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              NEXORA Assistant (Server-Side Gemini)
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Suggestions require review
          </span>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {turns.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Ask for a study schedule, goal breakdown, or concept explanation
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                AI suggestions are clearly marked and never write to your database without your
                confirmation.
              </p>
            </div>
          ) : (
            turns.map((turn) => (
              <div
                key={turn.id}
                className={`rounded-xl p-4 text-sm ${
                  turn.role === 'user'
                    ? 'bg-blue-600 text-white ml-8'
                    : 'border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-slate-100 mr-8'
                }`}
              >
                {turn.role === 'assistant' && (
                  <p className="text-[11px] font-medium text-blue-600 dark:text-sky-400 mb-1.5">
                    AI Suggestion (Not an authoritative record)
                  </p>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{turn.text}</p>

                {turn.proposedTasks && turn.proposedTasks.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Proposed Tasks for Review
                    </p>
                    {turn.proposedTasks.map((pt, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-white truncate">
                            {pt.title}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {pt.priority} · {pt.category}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={pt.accepted}
                          onClick={() => handleApproveTask(turn.id, idx, pt)}
                          className={`inline-flex items-center gap-1 rounded px-2.5 py-1.5 font-medium whitespace-nowrap shrink-0 ${
                            pt.accepted
                              ? 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {pt.accepted ? (
                            <>
                              <Check className="w-3 h-3" /> Added
                            </>
                          ) : (
                            'Add to Planner'
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSend} className="flex gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask NEXORA Assistant..."
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {busy ? 'Thinking...' : 'Send'}
          </button>
        </form>
      </section>
    </div>
  );
};
