import type { Budget, SavingsGoal, Transaction } from '../types/nexora';

export interface CurrencyMetadata {
  code: string;
  symbol: string;
  name: string;
  minorDigits: number;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyMetadata> = {
  MWK: { code: 'MWK', symbol: 'MK', name: 'Malawian Kwacha', minorDigits: 2 },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', minorDigits: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', minorDigits: 2 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', minorDigits: 2 },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand', minorDigits: 2 },
  KES: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', minorDigits: 2 },
};

/**
 * Parses a decimal string into exact integer minor currency units (e.g., "1250.50" -> 125050).
 * Avoids floating-point arithmetic entirely.
 */
export function parseMajorToMinor(input: string, minorDigits = 2): number {
  const cleaned = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error('Invalid monetary amount');
  }
  const [wholePart, fracPart = ''] = cleaned.split('.');
  if (fracPart.length > minorDigits) {
    throw new Error(`Maximum ${minorDigits} decimal places allowed`);
  }
  const paddedFrac = fracPart.padEnd(minorDigits, '0');
  const combined = `${wholePart}${paddedFrac}`;
  const value = Number.parseInt(combined, 10);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Monetary amount exceeds safe integer bounds');
  }
  return value;
}

/**
 * Formats integer minor currency units deterministically without floating-point rounding drift.
 */
export function formatMinorCurrency(amountMinor: number, currencyCode = 'MWK'): string {
  const meta = SUPPORTED_CURRENCIES[currencyCode] ?? {
    code: currencyCode,
    symbol: currencyCode,
    name: currencyCode,
    minorDigits: 2,
  };
  const safeMinor = Number.isFinite(amountMinor) ? Math.trunc(amountMinor) : 0;
  const sign = safeMinor < 0 ? '-' : '';
  const abs = Math.abs(safeMinor);
  const divisor = 10 ** meta.minorDigits;
  const whole = Math.floor(abs / divisor);
  const frac = String(abs % divisor).padStart(meta.minorDigits, '0');
  const formattedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${meta.symbol} ${formattedWhole}.${frac}`;
}

export interface FinanceReconciliation {
  totalRecords: number;
  actualIncomeCount: number;
  actualExpenseCount: number;
  transferCount: number;
  estimateCount: number;
  recomputedNetMinor: number;
  isBalanced: boolean;
}

export interface FinanceSummary {
  currency: string;
  actualIncomeMinor: number;
  actualExpenseMinor: number;
  actualNetMinor: number;
  transferVolumeMinor: number;
  estimatedIncomeMinor: number;
  estimatedExpenseMinor: number;
  byCategoryMinor: Record<string, number>;
  reconciliation: FinanceReconciliation;
}

export function computeFinanceSummary(
  transactions: Transaction[],
  currency: string,
  monthPrefix?: string
): FinanceSummary {
  const filtered = transactions.filter((t) => {
    if (t.currency !== currency) return false;
    if (monthPrefix && !t.transactionDate.startsWith(monthPrefix)) return false;
    return true;
  });

  let actualIncomeMinor = 0;
  let actualExpenseMinor = 0;
  let transferVolumeMinor = 0;
  let estimatedIncomeMinor = 0;
  let estimatedExpenseMinor = 0;
  let actualIncomeCount = 0;
  let actualExpenseCount = 0;
  let transferCount = 0;
  let estimateCount = 0;
  const byCategoryMinor: Record<string, number> = {};

  for (const tx of filtered) {
    const amount = Math.trunc(tx.amountMinor);
    if (tx.type === 'transfer') {
      transferCount += 1;
      if (!tx.isEstimate) {
        transferVolumeMinor += amount;
      } else {
        estimateCount += 1;
      }
      continue;
    }

    if (tx.isEstimate) {
      estimateCount += 1;
      if (tx.type === 'income') estimatedIncomeMinor += amount;
      else estimatedExpenseMinor += amount;
    } else {
      if (tx.type === 'income') {
        actualIncomeCount += 1;
        actualIncomeMinor += amount;
      } else {
        actualExpenseCount += 1;
        actualExpenseMinor += amount;
        byCategoryMinor[tx.category] = (byCategoryMinor[tx.category] ?? 0) + amount;
      }
    }
  }

  const actualNetMinor = actualIncomeMinor - actualExpenseMinor;
  const categoryTotal = Object.values(byCategoryMinor).reduce((acc, v) => acc + v, 0);

  return {
    currency,
    actualIncomeMinor,
    actualExpenseMinor,
    actualNetMinor,
    transferVolumeMinor,
    estimatedIncomeMinor,
    estimatedExpenseMinor,
    byCategoryMinor,
    reconciliation: {
      totalRecords: filtered.length,
      actualIncomeCount,
      actualExpenseCount,
      transferCount,
      estimateCount,
      recomputedNetMinor: actualIncomeMinor - actualExpenseMinor,
      isBalanced: categoryTotal === actualExpenseMinor && actualNetMinor === actualIncomeMinor - actualExpenseMinor,
    },
  };
}

export interface DuplicateCandidate {
  type: Transaction['type'];
  amountMinor: number;
  currency: string;
  category: string;
  transactionDate: string;
  description?: string;
}

export function findPotentialDuplicateTransaction(
  candidate: DuplicateCandidate,
  existing: Transaction[]
): Transaction | null {
  const normDesc = (candidate.description ?? '').trim().toLowerCase();
  const normCat = candidate.category.trim().toLowerCase();
  return (
    existing.find(
      (tx) =>
        tx.type === candidate.type &&
        Math.trunc(tx.amountMinor) === Math.trunc(candidate.amountMinor) &&
        tx.currency === candidate.currency &&
        tx.transactionDate === candidate.transactionDate &&
        tx.category.trim().toLowerCase() === normCat &&
        (tx.description ?? '').trim().toLowerCase() === normDesc
    ) ?? null
  );
}

export interface BudgetStatus {
  budget: Budget;
  spentMinor: number;
  remainingMinor: number;
  percentUsed: number;
  isOverspent: boolean;
}

export function computeBudgetStatuses(
  budgets: Budget[],
  transactions: Transaction[]
): BudgetStatus[] {
  return budgets.map((budget) => {
    const spentMinor = transactions
      .filter(
        (t) =>
          !t.isEstimate &&
          t.type === 'expense' &&
          t.currency === budget.currency &&
          t.category === budget.category &&
          t.transactionDate.startsWith(budget.monthKey)
      )
      .reduce((acc, t) => acc + Math.trunc(t.amountMinor), 0);

    const remainingMinor = Math.trunc(budget.limitMinor) - spentMinor;
    const percentUsed =
      budget.limitMinor > 0 ? Math.round((spentMinor * 100) / budget.limitMinor) : 0;

    return {
      budget,
      spentMinor,
      remainingMinor,
      percentUsed,
      isOverspent: spentMinor > budget.limitMinor,
    };
  });
}

export function computeSavingsProgressPercent(goal: SavingsGoal): number {
  if (goal.targetMinor <= 0) return 0;
  const pct = Math.round((Math.trunc(goal.currentMinor) * 100) / Math.trunc(goal.targetMinor));
  return Math.min(100, Math.max(0, pct));
}

export function exportTransactionsToCSV(transactions: Transaction[]): string {
  const header = [
    'ID',
    'Date',
    'Type',
    'Category',
    'Currency',
    'Amount',
    'Estimate',
    'Payment Method',
    'Transfer Account',
    'Description',
  ].join(',');

  const escapeCsv = (val: string) => {
    const safe = val.replace(/"/g, '""');
    return `"${safe}"`;
  };

  const rows = transactions.map((tx) => {
    const abs = Math.abs(Math.trunc(tx.amountMinor));
    const whole = Math.floor(abs / 100);
    const frac = String(abs % 100).padStart(2, '0');
    const amountStr = `${whole}.${frac}`;
    return [
      escapeCsv(tx.id),
      escapeCsv(tx.transactionDate),
      escapeCsv(tx.type),
      escapeCsv(tx.category),
      escapeCsv(tx.currency),
      amountStr,
      tx.isEstimate ? 'Estimated' : 'Actual',
      escapeCsv(tx.paymentMethod ?? ''),
      escapeCsv(tx.transferAccount ?? ''),
      escapeCsv(tx.description ?? ''),
    ].join(',');
  });

  return [header, ...rows].join('\n');
}
