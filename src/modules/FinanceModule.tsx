import React, { useMemo, useState } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  computeBudgetStatuses,
  computeFinanceSummary,
  computeSavingsProgressPercent,
  exportTransactionsToCSV,
  formatMinorCurrency,
  parseMajorToMinor,
  SUPPORTED_CURRENCIES,
} from '../lib/finance';
import { formatDisplayDate, getTodayKey } from '../lib/planner';
import {
  BudgetInputSchema,
  SavingsGoalInputSchema,
  TransactionInputSchema,
} from '../lib/validation';
import type { Budget, SavingsGoal, Transaction } from '../types/nexora';

export const FinanceModule: React.FC = () => {
  const {
    settings,
    transactions,
    budgets,
    savingsGoals,
    auditLogs,
    saveRecord,
    deleteRecord,
    logAudit,
  } = useWorkspace();

  const todayKey = getTodayKey(settings.timezone);
  const [selectedCurrency, setSelectedCurrency] = useState(settings.currency || 'MWK');
  const [selectedMonth, setSelectedMonth] = useState(todayKey.slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [busyTx, setBusyTx] = useState(false);

  // Transaction form
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');
  const [amountMajor, setAmountMajor] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Mobile Money');
  const [txDate, setTxDate] = useState(todayKey);
  const [isEstimate, setIsEstimate] = useState(false);

  // Budget form
  const [budgetCat, setBudgetCat] = useState('Groceries');
  const [budgetLimit, setBudgetLimit] = useState('');

  // Savings goal form
  const [savTitle, setSavTitle] = useState('');
  const [savTarget, setSavTarget] = useState('');
  const [contribAmount, setContribAmount] = useState<Record<string, string>>({});

  const [deleteTarget, setDeleteTarget] = useState<{
    col: 'transactions' | 'budgets' | 'savingsGoals';
    id: string;
    label: string;
  } | null>(null);

  const summary = useMemo(
    () => computeFinanceSummary(transactions, selectedCurrency, selectedMonth),
    [transactions, selectedCurrency, selectedMonth]
  );

  const budgetStatuses = useMemo(
    () =>
      computeBudgetStatuses(
        budgets.filter((b) => b.currency === selectedCurrency && b.monthKey === selectedMonth),
        transactions
      ),
    [budgets, transactions, selectedCurrency, selectedMonth]
  );

  const filteredTx = useMemo(
    () =>
      transactions
        .filter((t) => t.currency === selectedCurrency && t.transactionDate.startsWith(selectedMonth))
        .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)),
    [transactions, selectedCurrency, selectedMonth]
  );

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyTx) return;
    setError(null);

    const parsed = TransactionInputSchema.safeParse({
      type: txType,
      amountMajor,
      currency: selectedCurrency,
      category,
      description: description || undefined,
      paymentMethod: paymentMethod || undefined,
      transactionDate: txDate,
      isEstimate,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid transaction input.');
      return;
    }

    setBusyTx(true);
    try {
      const amountMinor = parseMajorToMinor(parsed.data.amountMajor);
      const idempotencyKey = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const saved = await saveRecord<Transaction>(
        'transactions',
        {
          type: parsed.data.type,
          amountMinor,
          currency: parsed.data.currency,
          category: parsed.data.category,
          description: parsed.data.description,
          paymentMethod: parsed.data.paymentMethod,
          transactionDate: parsed.data.transactionDate,
          isEstimate: parsed.data.isEstimate,
          idempotencyKey,
        },
        false
      );
      await logAudit(
        'transaction',
        saved.id,
        'create',
        `Recorded ${parsed.data.type} (${parsed.data.category}) ${formatMinorCurrency(
          amountMinor,
          parsed.data.currency
        )}`
      );
      setAmountMajor('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save transaction.');
    } finally {
      setBusyTx(false);
    }
  };

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = BudgetInputSchema.safeParse({
      category: budgetCat,
      limitMajor: budgetLimit,
      currency: selectedCurrency,
      monthKey: selectedMonth,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid budget values.');
      return;
    }
    const limitMinor = parseMajorToMinor(parsed.data.limitMajor);
    const saved = await saveRecord<Budget>(
      'budgets',
      {
        category: parsed.data.category,
        limitMinor,
        currency: parsed.data.currency,
        monthKey: parsed.data.monthKey,
      },
      false
    );
    await logAudit(
      'budget',
      saved.id,
      'create',
      `Set ${parsed.data.category} budget for ${parsed.data.monthKey}`
    );
    setBudgetLimit('');
  };

  const handleCreateSavingsGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = SavingsGoalInputSchema.safeParse({
      title: savTitle,
      targetMajor: savTarget,
      currency: selectedCurrency,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid savings goal.');
      return;
    }
    const targetMinor = parseMajorToMinor(parsed.data.targetMajor);
    await saveRecord<SavingsGoal>(
      'savingsGoals',
      {
        title: parsed.data.title,
        targetMinor,
        currentMinor: 0,
        currency: parsed.data.currency,
        status: 'active',
      },
      false
    );
    setSavTitle('');
    setSavTarget('');
  };

  const handleContribute = async (goal: SavingsGoal) => {
    const raw = contribAmount[goal.id] ?? '';
    setError(null);
    try {
      const addMinor = parseMajorToMinor(raw);
      const nextCurrent = goal.currentMinor + addMinor;
      const nextStatus: SavingsGoal['status'] =
        nextCurrent >= goal.targetMinor ? 'completed' : goal.status;
      await saveRecord<SavingsGoal>(
        'savingsGoals',
        { ...goal, currentMinor: nextCurrent, status: nextStatus },
        true
      );
      await logAudit(
        'savingsGoal',
        goal.id,
        'update',
        `Added ${formatMinorCurrency(addMinor, goal.currency)} to ${goal.title}`
      );
      setContribAmount((prev) => ({ ...prev, [goal.id]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enter a valid contribution amount.');
    }
  };

  const handleExportCSV = async () => {
    const csv = exportTransactionsToCSV(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexora-finance-${todayKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    await logAudit('transaction', 'batch', 'export', `Exported ${transactions.length} transactions to CSV`);
  };

  const categoryEntries = Object.entries(summary.byCategoryMinor).sort((a, b) => b[1] - a[1]);
  const maxCategoryMinor = categoryEntries[0]?.[1] || 1;

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
            aria-label="Select currency"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111C32] px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
          >
            {Object.values(SUPPORTED_CURRENCIES).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Filter month"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111C32] px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white"
          />
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111C32] px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Actual Income</p>
          <p className="mt-1 font-mono tabular-nums text-xl font-semibold text-emerald-600 dark:text-emerald-400">
            {formatMinorCurrency(summary.actualIncomeMinor, selectedCurrency)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Actual Expenses</p>
          <p className="mt-1 font-mono tabular-nums text-xl font-semibold text-rose-600 dark:text-rose-400">
            {formatMinorCurrency(summary.actualExpenseMinor, selectedCurrency)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Actual Net Balance</p>
          <p className="mt-1 font-mono tabular-nums text-xl font-semibold text-slate-900 dark:text-white">
            {formatMinorCurrency(summary.actualNetMinor, selectedCurrency)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Estimated Planned Spend</p>
          <p className="mt-1 font-mono tabular-nums text-xl font-semibold text-slate-600 dark:text-slate-300">
            {formatMinorCurrency(summary.estimatedExpenseMinor, selectedCurrency)}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Record Transaction & Ledger */}
        <section className="lg:col-span-7 space-y-6">
          <form
            onSubmit={handleCreateTransaction}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-3.5"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Record Transaction (Manual Ledger — Not Bank-Connected)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={txType}
                onChange={(e) => setTxType(e.target.value as 'expense' | 'income')}
                aria-label="Transaction type"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={amountMajor}
                onChange={(e) => setAmountMajor(e.target.value)}
                placeholder={`Amount (${selectedCurrency})`}
                required
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
              />
              <input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                required
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category (Groceries, Data, Tuition)"
                required
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="Payment Method (Cash, Airtel Money)"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={isEstimate}
                  onChange={(e) => setIsEstimate(e.target.checked)}
                />
                Save as estimate (excluded from actual balance)
              </label>
              <button
                type="submit"
                disabled={busyTx}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {busyTx ? 'Saving...' : 'Save Entry'}
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Transactions ({filteredTx.length})
            </h2>
            {filteredTx.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                No {selectedCurrency} transactions recorded for {selectedMonth}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Category &amp; Details</th>
                      <th className="py-2 pr-3 font-medium text-right">Amount</th>
                      <th className="py-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredTx.map((tx) => (
                      <tr key={tx.id}>
                        <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatDisplayDate(tx.transactionDate, settings.dateFormat)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {tx.category}
                            {tx.isEstimate ? ' · Estimate' : ''}
                          </p>
                          {(tx.description || tx.paymentMethod) && (
                            <p className="text-slate-500 dark:text-slate-400">
                              {[tx.description, tx.paymentMethod].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td
                          className={`py-2.5 pr-3 font-mono tabular-nums text-right font-medium whitespace-nowrap ${
                            tx.type === 'income'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {tx.type === 'income' ? '+' : '-'}
                          {formatMinorCurrency(tx.amountMinor, tx.currency)}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                col: 'transactions',
                                id: tx.id,
                                label: `${tx.category} ${formatMinorCurrency(tx.amountMinor, tx.currency)}`,
                              })
                            }
                            aria-label={`Delete transaction ${tx.category}`}
                            className="p-1 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Budgets, Category Chart, Savings Goals & Audit Trail */}
        <section className="lg:col-span-5 space-y-6">
          {/* Spending Breakdown */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Spending by Category
            </h2>
            {categoryEntries.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                Record an actual expense to visualize spending distribution.
              </p>
            ) : (
              <div className="space-y-3">
                {categoryEntries.map(([cat, minor]) => (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-700 dark:text-slate-200">{cat}</span>
                      <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                        {formatMinorCurrency(minor, selectedCurrency)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 dark:bg-sky-400"
                        style={{ width: `${Math.round((minor * 100) / maxCategoryMinor)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monthly Budgets */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Category Budgets ({selectedMonth})
            </h2>
            <form onSubmit={handleCreateBudget} className="flex gap-2">
              <input
                type="text"
                value={budgetCat}
                onChange={(e) => setBudgetCat(e.target.value)}
                placeholder="Category"
                required
                className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="text"
                inputMode="decimal"
                value={budgetLimit}
                onChange={(e) => setBudgetLimit(e.target.value)}
                placeholder="Limit"
                required
                className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white shrink-0"
              >
                Set
              </button>
            </form>

            {budgetStatuses.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No budgets set.</p>
            ) : (
              <div className="space-y-3 pt-1">
                {budgetStatuses.map(({ budget, spentMinor, remainingMinor, percentUsed, isOverspent }) => (
                  <div key={budget.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {budget.category}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono tabular-nums ${
                            isOverspent
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {formatMinorCurrency(spentMinor, budget.currency)} /{' '}
                          {formatMinorCurrency(budget.limitMinor, budget.currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              col: 'budgets',
                              id: budget.id,
                              label: `${budget.category} budget`,
                            })
                          }
                          aria-label={`Delete budget ${budget.category}`}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full ${isOverspent ? 'bg-rose-600' : 'bg-blue-600'}`}
                        style={{ width: `${Math.min(100, percentUsed)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {isOverspent
                        ? `Overspent by ${formatMinorCurrency(Math.abs(remainingMinor), budget.currency)}`
                        : `Remaining: ${formatMinorCurrency(remainingMinor, budget.currency)}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Savings Goals */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Savings Goals</h2>
            <form onSubmit={handleCreateSavingsGoal} className="flex gap-2">
              <input
                type="text"
                value={savTitle}
                onChange={(e) => setSavTitle(e.target.value)}
                placeholder="Goal (e.g. Emergency Fund)"
                required
                className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              />
              <input
                type="text"
                inputMode="decimal"
                value={savTarget}
                onChange={(e) => setSavTarget(e.target.value)}
                placeholder="Target"
                required
                className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white shrink-0"
              >
                Add
              </button>
            </form>

            {savingsGoals.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No savings goals yet.</p>
            ) : (
              <div className="space-y-3">
                {savingsGoals.map((g) => {
                  const pct = computeSavingsProgressPercent(g);
                  return (
                    <div
                      key={g.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {g.title} · {g.status}
                        </span>
                        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {pct}%
                        </span>
                      </div>
                      <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {formatMinorCurrency(g.currentMinor, g.currency)} /{' '}
                        {formatMinorCurrency(g.targetMinor, g.currency)}
                      </p>
                      {g.status !== 'completed' && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={contribAmount[g.id] ?? ''}
                            onChange={(e) =>
                              setContribAmount((prev) => ({ ...prev, [g.id]: e.target.value }))
                            }
                            placeholder="Contribute"
                            className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1220] px-2 py-1 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleContribute(g)}
                            className="rounded bg-blue-600 hover:bg-blue-700 px-2.5 py-1 text-xs font-medium text-white"
                          >
                            Add
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Audit Trail */}
          {auditLogs.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] p-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                Recent Audit Trail
              </h2>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                {auditLogs.slice(0, 5).map((log) => (
                  <li key={log.id} className="truncate">
                    <span className="font-mono">{log.action}</span> · {log.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.label ?? ''}"?`}
        description="Deleting this financial record will update your ledger totals and record an audit trail entry."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteRecord(deleteTarget.col, deleteTarget.id);
            await logAudit(deleteTarget.col, deleteTarget.id, 'delete', `Deleted ${deleteTarget.label}`);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
};
