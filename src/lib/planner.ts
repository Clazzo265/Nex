import type { DateFormatOption, Task } from '../types/nexora';

export function getTodayKey(timezone?: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function formatDisplayDate(
  isoDate: string | undefined,
  dateFormat: DateFormatOption = 'YYYY-MM-DD'
): string {
  if (!isoDate) return 'No date';
  const datePart = isoDate.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return isoDate;
  const [, yyyy, mm, dd] = match;
  if (dateFormat === 'DD/MM/YYYY') return `${dd}/${mm}/${yyyy}`;
  if (dateFormat === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

export function isTaskOverdue(task: Task, todayKey: string): boolean {
  if (task.status === 'completed' || !task.dueDate) return false;
  const duePart = task.dueDate.slice(0, 10);
  return duePart < todayKey;
}

/**
 * Computes the next ISO YYYY-MM-DD due date when completing a recurring task.
 */
export function computeNextRecurrenceDate(
  currentDueDate: string | undefined,
  recurring: Task['recurring'],
  fallbackTodayKey: string
): string | null {
  if (recurring === 'none') return null;
  const baseStr = (currentDueDate && currentDueDate.slice(0, 10)) || fallbackTodayKey;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseStr);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month, day));

  if (recurring === 'daily') {
    dt.setUTCDate(dt.getUTCDate() + 1);
  } else if (recurring === 'weekly') {
    dt.setUTCDate(dt.getUTCDate() + 7);
  } else if (recurring === 'monthly') {
    const targetMonth = dt.getUTCMonth() + 1;
    dt.setUTCMonth(targetMonth);
  }

  return dt.toISOString().slice(0, 10);
}

export function sortTasksByUrgency(tasks: Task[], todayKey: string): Task[] {
  const priorityRank: Record<Task['priority'], number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return [...tasks].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    const aOver = isTaskOverdue(a, todayKey) ? 0 : 1;
    const bOver = isTaskOverdue(b, todayKey) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    const pDiff = priorityRank[a.priority] - priorityRank[b.priority];
    if (pDiff !== 0) return pDiff;
    return (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99');
  });
}
