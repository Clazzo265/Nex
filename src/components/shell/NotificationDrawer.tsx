import React from 'react';
import { BellOff, Check, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { computeBudgetStatuses, formatMinorCurrency } from '../../lib/finance';
import { getTodayKey, isTaskOverdue } from '../../lib/planner';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ open, onClose }) => {
  const {
    notifications,
    tasks,
    assignments,
    budgets,
    transactions,
    settings,
    markNotificationRead,
    clearAllNotifications,
  } = useWorkspace();

  if (!open) return null;

  const todayKey = getTodayKey(settings.timezone);
  const overdueTasks = settings.deadlineAlerts
    ? tasks.filter((t) => isTaskOverdue(t, todayKey))
    : [];
  const upcomingAssignments = settings.deadlineAlerts
    ? assignments.filter(
        (a) => a.status !== 'submitted' && a.status !== 'graded' && a.dueDate >= todayKey
      )
    : [];
  const overspentBudgets = settings.budgetAlerts
    ? computeBudgetStatuses(budgets, transactions).filter((b) => b.isOverspent)
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notification Center"
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-md h-full border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C32] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Notifications</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              In-app reminders and budget alerts
            </p>
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAllNotifications}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!settings.notificationsEnabled && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2.5">
              <BellOff className="w-4 h-4 shrink-0" />
              Notifications are muted in Settings.
            </div>
          )}

          {settings.notificationsEnabled && (
            <>
              {(overdueTasks.length > 0 ||
                overspentBudgets.length > 0 ||
                upcomingAssignments.length > 0) && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Active Reminders
                  </h3>
                  {overdueTasks.map((t) => (
                    <div
                      key={`over-${t.id}`}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
                    >
                      <p className="font-medium text-amber-800 dark:text-amber-300">
                        Overdue task: {t.title}
                      </p>
                      <p className="mt-0.5 text-amber-700/80 dark:text-amber-200/70">
                        Due {t.dueDate}
                      </p>
                    </div>
                  ))}
                  {overspentBudgets.map((b) => (
                    <div
                      key={`budget-${b.budget.id}`}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs"
                    >
                      <p className="font-medium text-rose-800 dark:text-rose-300">
                        Budget exceeded: {b.budget.category}
                      </p>
                      <p className="mt-0.5 font-mono tabular-nums text-rose-700/80 dark:text-rose-200/70">
                        Spent {formatMinorCurrency(b.spentMinor, b.budget.currency)} of{' '}
                        {formatMinorCurrency(b.budget.limitMinor, b.budget.currency)}
                      </p>
                    </div>
                  ))}
                  {upcomingAssignments.slice(0, 3).map((a) => (
                    <div
                      key={`assign-${a.id}`}
                      className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs"
                    >
                      <p className="font-medium text-blue-800 dark:text-sky-300">
                        Upcoming {a.activityType}: {a.title}
                      </p>
                      <p className="mt-0.5 text-blue-700/80 dark:text-sky-200/70">
                        Due {a.dueDate}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Activity Feed
                </h3>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                    No saved notifications yet.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-lg border p-3 text-xs flex items-start justify-between gap-3 ${
                        n.read
                          ? 'border-slate-200 dark:border-slate-800 opacity-70'
                          : 'border-blue-500/30 bg-blue-500/5'
                      }`}
                    >
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{n.title}</p>
                        <p className="mt-0.5 text-slate-600 dark:text-slate-300">{n.body}</p>
                      </div>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => markNotificationRead(n.id)}
                          aria-label={`Mark ${n.title} as read`}
                          className="p-1 text-blue-600 dark:text-sky-400 hover:bg-blue-500/10 rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
};
