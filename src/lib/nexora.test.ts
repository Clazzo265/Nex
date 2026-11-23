import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMajorToMinor,
  formatMinorCurrency,
  computeFinanceSummary,
  computeBudgetStatuses,
  exportTransactionsToCSV,
} from './finance';
import { computeNextRecurrenceDate, isTaskOverdue, formatDisplayDate } from './planner';
import { computeCourseGradeSummary, evaluateGradeLabel } from './academic';
import { computeHabitStreak } from './goals';
import { detectVersionConflict } from './offlineDb';
import { TransactionInputSchema, DevProjectInputSchema } from './validation';
import type { Budget, GradeRecord, HabitEntry, Task, Transaction } from '../types/nexora';

test('integer minor currency parsing and formatting avoid floating-point drift', () => {
  assert.equal(parseMajorToMinor('1250.50'), 125050);
  assert.equal(parseMajorToMinor('0.10'), 10);
  assert.equal(parseMajorToMinor('0.20'), 20);
  assert.equal(parseMajorToMinor('0.10') + parseMajorToMinor('0.20'), 30);
  assert.equal(formatMinorCurrency(125050, 'MWK'), 'MK 1,250.50');
  assert.equal(formatMinorCurrency(-5000, 'USD'), '-$ 50.00');
});

test('finance summary separates actual vs estimated records and computes budgets accurately', () => {
  const txs: Transaction[] = [
    {
      id: 't1',
      uid: 'u1',
      type: 'income',
      amountMinor: 50000000,
      currency: 'MWK',
      category: 'Salary',
      transactionDate: '2026-11-05',
      isEstimate: false,
      idempotencyKey: 'k1',
      createdAt: '2026-11-05T08:00:00Z',
      updatedAt: '2026-11-05T08:00:00Z',
    },
    {
      id: 't2',
      uid: 'u1',
      type: 'expense',
      amountMinor: 12000000,
      currency: 'MWK',
      category: 'Groceries',
      transactionDate: '2026-11-10',
      isEstimate: false,
      idempotencyKey: 'k2',
      createdAt: '2026-11-10T08:00:00Z',
      updatedAt: '2026-11-10T08:00:00Z',
    },
    {
      id: 't3',
      uid: 'u1',
      type: 'expense',
      amountMinor: 3000000,
      currency: 'MWK',
      category: 'Groceries',
      transactionDate: '2026-11-12',
      isEstimate: true,
      idempotencyKey: 'k3',
      createdAt: '2026-11-12T08:00:00Z',
      updatedAt: '2026-11-12T08:00:00Z',
    },
  ];
  const summary = computeFinanceSummary(txs, 'MWK', '2026-11');
  assert.equal(summary.actualIncomeMinor, 50000000);
  assert.equal(summary.actualExpenseMinor, 12000000);
  assert.equal(summary.actualNetMinor, 38000000);
  assert.equal(summary.estimatedExpenseMinor, 3000000);

  const budgets: Budget[] = [
    {
      id: 'b1',
      uid: 'u1',
      category: 'Groceries',
      limitMinor: 10000000,
      currency: 'MWK',
      monthKey: '2026-11',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];
  const statuses = computeBudgetStatuses(budgets, txs);
  assert.equal(statuses[0].spentMinor, 12000000);
  assert.equal(statuses[0].isOverspent, true);
  assert.equal(statuses[0].remainingMinor, -2000000);

  const csv = exportTransactionsToCSV(txs);
  assert.ok(csv.includes('MK') === false && csv.includes('MWK'));
  assert.ok(csv.includes('500000.00'));
});

test('planner handles overdue detection, display formatting, and recurring task advancement', () => {
  const task: Task = {
    id: 'task1',
    uid: 'u1',
    title: 'Submit Lab',
    priority: 'high',
    status: 'todo',
    dueDate: '2026-11-20',
    recurring: 'weekly',
    version: 1,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  assert.equal(isTaskOverdue(task, '2026-11-22'), true);
  assert.equal(isTaskOverdue(task, '2026-11-20'), false);
  assert.equal(computeNextRecurrenceDate('2026-11-20', 'weekly', '2026-11-22'), '2026-11-27');
  assert.equal(computeNextRecurrenceDate('2026-11-20', 'daily', '2026-11-22'), '2026-11-21');
  assert.equal(formatDisplayDate('2026-11-22', 'DD/MM/YYYY'), '22/11/2026');
});

test('academic hub separates recorded grades from estimated projections', () => {
  const grades: GradeRecord[] = [
    {
      id: 'g1',
      uid: 'u1',
      courseId: 'c1',
      title: 'Midterm',
      score: 40,
      maxScore: 50,
      weight: 40,
      isEstimated: false,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'g2',
      uid: 'u1',
      courseId: 'c1',
      title: 'Final Exam Forecast',
      score: 54,
      maxScore: 60,
      weight: 60,
      isEstimated: true,
      createdAt: '2026-11-02T00:00:00Z',
      updatedAt: '2026-11-02T00:00:00Z',
    },
  ];
  const summary = computeCourseGradeSummary(grades);
  assert.equal(summary.recordedAveragePercent, 80);
  assert.equal(summary.projectedAveragePercent, 86);
  assert.equal(evaluateGradeLabel(80, 'University Distinction Scale'), 'Distinction');
});

test('habit streak calculates consecutive days gently and conflict detection catches newer remote state', () => {
  const entries: HabitEntry[] = [
    { id: 'e1', uid: 'u1', habitId: 'h1', dateKey: '2026-11-22', completed: true, createdAt: '' },
    { id: 'e2', uid: 'u1', habitId: 'h1', dateKey: '2026-11-21', completed: true, createdAt: '' },
    { id: 'e3', uid: 'u1', habitId: 'h1', dateKey: '2026-11-19', completed: true, createdAt: '' },
  ];
  const streak = computeHabitStreak(entries, 'h1', '2026-11-22');
  assert.equal(streak.currentStreak, 2);
  assert.equal(streak.totalCompletions, 3);

  assert.equal(detectVersionConflict('2026-11-22T10:00:00Z', '2026-11-22T12:00:00Z', 1, 2), true);
  assert.equal(detectVersionConflict('2026-11-22T12:00:00Z', '2026-11-22T10:00:00Z', 2, 2), false);
});

test('zod validation rejects negative/malformed amounts and unsafe javascript: URLs', () => {
  const badTx = TransactionInputSchema.safeParse({
    type: 'expense',
    amountMajor: '-50.00',
    currency: 'MWK',
    category: 'Transport',
    transactionDate: '2026-11-22',
    isEstimate: false,
  });
  assert.equal(badTx.success, false);

  const badUrl = DevProjectInputSchema.safeParse({
    name: 'NEXORA',
    repoUrl: 'javascript:alert(1)',
  });
  assert.equal(badUrl.success, false);
});
