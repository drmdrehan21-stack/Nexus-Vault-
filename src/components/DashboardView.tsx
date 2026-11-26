import {
  ArrowRight,
  CalendarDays,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react';
import {
  CurrencyCode,
  MonthlySummary,
  NavSection,
  SavingsGoal,
  Transaction,
} from '../types/vault';
import { formatCurrency, formatDisplayDate, formatMonthYear } from '../utils/format';

interface DashboardViewProps {
  currency: CurrencyCode;
  totalSavings: number;
  currentGoal: SavingsGoal | null;
  thisMonth: MonthlySummary;
  transactions: Transaction[];
  isLoading: boolean;
  onOpenAddSaving: () => void;
  onEditTransaction: (txn: Transaction) => void;
  onDeleteTransaction: (txn: Transaction) => void;
  onOpenGoalModal: () => void;
  onNavigate: (section: NavSection) => void;
}

export function DashboardView({
  currency,
  totalSavings,
  currentGoal,
  thisMonth,
  transactions,
  isLoading,
  onOpenAddSaving,
  onEditTransaction,
  onDeleteTransaction,
  onOpenGoalModal,
  onNavigate,
}: DashboardViewProps) {
  const recentTransactions = transactions.slice(0, 5);
  const currentMonthLabel = formatMonthYear(thisMonth.year, thisMonth.month);
  const latestTransaction = transactions[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Top Row: Total Savings & Quick Actions + This Month */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* A. TOTAL SAVINGS */}
        <section className="flex flex-col justify-between rounded-xl border border-[#262626] bg-[#141414] p-6 lg:col-span-7">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium tracking-wide text-[#929292]">
                Total Savings ({currency})
              </span>
              <span className="font-mono text-xs tabular-nums text-[#929292]">
                {transactions.length} {transactions.length === 1 ? 'deposit' : 'deposits'}
              </span>
            </div>

            {isLoading && transactions.length === 0 ? (
              <div className="h-12 w-56 animate-pulse rounded-lg bg-[#1B1B1B]" />
            ) : (
              <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-white sm:text-4xl lg:text-[42px]">
                {formatCurrency(totalSavings, currency)}
              </p>
            )}

            <p className="text-xs text-[#929292]">
              {latestTransaction
                ? `Last deposit ${formatCurrency(latestTransaction.amount, currency)} on ${formatDisplayDate(latestTransaction.date)}`
                : 'No deposits recorded yet. Start your savings streak today.'}
            </p>
          </div>

          {/* D. QUICK ACTION */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#262626] pt-5">
            <button
              type="button"
              onClick={onOpenAddSaving}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#35C98A] px-5 text-sm font-semibold text-[#090909] transition-colors hover:bg-[#2eb57b] whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Add Saving</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#262626] bg-[#1B1B1B] px-4 text-sm font-medium text-white transition-colors hover:border-[#3a3a3a] whitespace-nowrap"
            >
              <CalendarDays className="h-4 w-4 text-[#35C98A]" />
              <span>Savings Calendar</span>
            </button>
          </div>
        </section>

        {/* C. THIS MONTH */}
        <section className="flex flex-col justify-between rounded-xl border border-[#262626] bg-[#141414] p-6 lg:col-span-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium tracking-wide text-[#929292]">
                This Month
              </span>
              <span className="text-xs text-[#929292]">{currentMonthLabel}</span>
            </div>

            {isLoading && transactions.length === 0 ? (
              <div className="h-10 w-40 animate-pulse rounded-lg bg-[#1B1B1B]" />
            ) : (
              <p className="font-mono text-2xl font-semibold tabular-nums text-white sm:text-3xl">
                {formatCurrency(thisMonth.totalSavings, currency)}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4 border-t border-[#262626] pt-4">
              <div>
                <p className="text-xs text-[#929292]">Saving Days</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-[#35C98A]">
                  {thisMonth.savingDays}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#929292]">Deposits</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-white">
                  {thisMonth.transactionCount}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-[#35C98A] hover:underline"
          >
            <span>Inspect monthly activity</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </section>
      </div>

      {/* B. SAVINGS GOAL */}
      <section className="rounded-xl border border-[#262626] bg-[#141414] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-[#929292]">
              <Target className="h-3.5 w-3.5 text-[#35C98A]" />
              <span>Savings Goal</span>
            </div>
            <h2 className="text-lg font-semibold text-white sm:text-xl">
              {currentGoal ? currentGoal.goalName : 'No Savings Goal Set'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onOpenGoalModal}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#262626] bg-[#1B1B1B] px-4 text-xs font-medium text-white transition-colors hover:border-[#35C98A]/50 whitespace-nowrap"
          >
            <Pencil className="h-3.5 w-3.5 text-[#35C98A]" />
            <span>{currentGoal ? 'Edit Goal' : 'Create Goal'}</span>
          </button>
        </div>

        {currentGoal ? (
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-[#929292]">
                  {currentGoal.isCompleted
                    ? 'Target reached'
                    : `${currentGoal.completionPercentage.toFixed(1)}% completed`}
                </span>
                <span className="font-mono tabular-nums text-[#35C98A]">
                  {currentGoal.completionPercentage.toFixed(1)}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={Math.round(currentGoal.completionPercentage)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2.5 w-full overflow-hidden rounded-full bg-[#1B1B1B]"
              >
                <div
                  className="h-full rounded-full bg-[#35C98A] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, currentGoal.completionPercentage))}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-[#262626] pt-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-[#929292]">Current Saved</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums text-white">
                  {formatCurrency(currentGoal.currentSavings, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#929292]">Target Amount</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums text-white">
                  {formatCurrency(currentGoal.targetAmount, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#929292]">Remaining</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[#35C98A]">
                  {formatCurrency(currentGoal.remainingAmount, currency)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-start justify-between gap-4 border-t border-[#262626] pt-4 sm:flex-row sm:items-center">
            <p className="text-sm text-[#929292]">
              Set a personal savings target to track your remaining balance and completion progress automatically.
            </p>
            <button
              type="button"
              onClick={onOpenGoalModal}
              className="h-10 shrink-0 rounded-lg bg-[#35C98A] px-4 text-xs font-semibold text-[#090909] transition-colors hover:bg-[#2eb57b]"
            >
              Set Savings Goal
            </button>
          </div>
        )}
      </section>

      {/* Recent Transactions */}
      <section className="rounded-xl border border-[#262626] bg-[#141414]">
        <div className="flex items-center justify-between border-b border-[#262626] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Recent Deposits</h2>
            <p className="text-xs text-[#929292]">Latest records persisted in Google Sheets</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('savings')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#35C98A] hover:underline"
          >
            <span>View all</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-white">No savings recorded yet</p>
            <p className="mt-1 text-xs text-[#929292]">
              Add your first deposit to start building your vault balance.
            </p>
            <button
              type="button"
              onClick={onOpenAddSaving}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-[#35C98A] px-4 text-xs font-semibold text-[#090909] transition-colors hover:bg-[#2eb57b]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add First Saving</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#262626]">
            {recentTransactions.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between gap-4 px-6 py-3.5 transition-colors hover:bg-[#1B1B1B]/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="font-mono text-sm font-semibold tabular-nums text-white">
                      {formatCurrency(txn.amount, currency)}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-[#929292]">
                      {formatDisplayDate(txn.date)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[#929292]">
                    {txn.note || 'Daily saving deposit'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEditTransaction(txn)}
                    aria-label={`Edit saving from ${txn.date}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-[#929292] transition-colors hover:bg-[#1B1B1B] hover:text-white"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTransaction(txn)}
                    aria-label={`Delete saving from ${txn.date}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-[#929292] transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
