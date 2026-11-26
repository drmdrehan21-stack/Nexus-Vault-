import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { CurrencyCode, Transaction } from '../types/vault';
import {
  formatCompactCurrency,
  formatCurrency,
  formatLongDate,
  formatMonthYear,
  getDaysInMonth,
  getFirstWeekdayOfMonth,
  getTodayISO,
  toISODate,
} from '../utils/format';

interface CalendarViewProps {
  currency: CurrencyCode;
  transactions: Transaction[];
  onAddSavingForDate: (isoDate: string) => void;
  onEditTransaction: (txn: Transaction) => void;
  onDeleteTransaction: (txn: Transaction) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarView({
  currency,
  transactions,
  onAddSavingForDate,
  onEditTransaction,
  onDeleteTransaction,
}: CalendarViewProps) {
  const todayISO = getTodayISO();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);

  const monthPrefix = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstWeekday = getFirstWeekdayOfMonth(viewYear, viewMonth);

  // Build date-wise map from actual transactions
  const dateMap = useMemo(() => {
    const map: Record<string, { total: number; items: Transaction[] }> = {};
    for (const txn of transactions) {
      if (!map[txn.date]) {
        map[txn.date] = { total: 0, items: [] };
      }
      map[txn.date].total = Math.round((map[txn.date].total + txn.amount) * 100) / 100;
      map[txn.date].items.push(txn);
    }
    return map;
  }, [transactions]);

  const monthSummary = useMemo(() => {
    let total = 0;
    let savingDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = toISODate(viewYear, viewMonth, day);
      const entry = dateMap[iso];
      if (entry && entry.total > 0) {
        total += entry.total;
        savingDays++;
      }
    }
    return {
      total: Math.round(total * 100) / 100,
      savingDays,
    };
  }, [dateMap, daysInMonth, viewYear, viewMonth]);

  const selectedDayRecord = dateMap[selectedDate] ?? { total: 0, items: [] };

  const goToPreviousMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    const current = new Date();
    setViewYear(current.getFullYear());
    setViewMonth(current.getMonth() + 1);
    setSelectedDate(getTodayISO());
  };

  const leadingBlanks = Array.from({ length: firstWeekday }, (_, i) => i);
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Monthly Calendar Grid */}
      <section className="rounded-xl border border-[#262626] bg-[#141414] p-4 sm:p-6 lg:col-span-8">
        {/* Calendar Header & Month Stats */}
        <div className="flex flex-col gap-4 border-b border-[#262626] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {formatMonthYear(viewYear, viewMonth)}
            </h2>
            <p className="mt-1 font-mono text-xs tabular-nums text-[#929292]">
              <span className="text-white">{formatCurrency(monthSummary.total, currency)}</span>{' '}
              saved across{' '}
              <span className="text-[#35C98A]">
                {monthSummary.savingDays} {monthSummary.savingDays === 1 ? 'day' : 'days'}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToPreviousMonth}
              aria-label="Previous month"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#262626] bg-[#1B1B1B] text-white transition-colors hover:border-[#3a3a3a]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="h-10 rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 text-xs font-medium text-white transition-colors hover:border-[#35C98A]/50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={goToNextMonth}
              aria-label="Next month"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#262626] bg-[#1B1B1B] text-white transition-colors hover:border-[#3a3a3a]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Weekday Headers */}
        <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-1.5 text-center text-[11px] font-medium text-[#929292]"
            >
              {day}
            </div>
          ))}

          {leadingBlanks.map((blank) => (
            <div key={`blank-${monthPrefix}-${blank}`} className="h-16 sm:h-20" />
          ))}

          {monthDays.map((day) => {
            const iso = toISODate(viewYear, viewMonth, day);
            const activity = dateMap[iso];
            const hasSaving = Boolean(activity && activity.total > 0);
            const isSelected = selectedDate === iso;
            const isToday = todayISO === iso;

            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate(iso)}
                className={`relative flex h-16 flex-col items-start justify-between rounded-lg border p-1.5 text-left transition-colors sm:h-20 sm:p-2 ${
                  isSelected
                    ? 'border-[#35C98A] bg-[#35C98A]/12'
                    : hasSaving
                      ? 'border-[#35C98A]/35 bg-[#1B1B1B] hover:border-[#35C98A]/65'
                      : 'border-[#262626] bg-[#090909]/60 hover:border-[#3a3a3a]'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      isToday
                        ? 'font-semibold text-[#35C98A]'
                        : isSelected || hasSaving
                          ? 'font-medium text-white'
                          : 'text-[#929292]'
                    }`}
                  >
                    {day}
                  </span>
                  {hasSaving && (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-[#35C98A]"
                    />
                  )}
                </div>

                {hasSaving ? (
                  <span className="w-full truncate font-mono text-[10px] font-medium tabular-nums text-[#35C98A] sm:text-[11px]">
                    <span className="sm:hidden">
                      {formatCompactCurrency(activity.total, currency)}
                    </span>
                    <span className="hidden sm:inline">
                      {formatCurrency(activity.total, currency)}
                    </span>
                  </span>
                ) : (
                  <span className="text-[10px] text-transparent select-none">-</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected Date Detail Panel */}
      <section className="flex flex-col justify-between rounded-xl border border-[#262626] bg-[#141414] p-6 lg:col-span-4">
        <div className="space-y-5">
          <div className="border-b border-[#262626] pb-4">
            <p className="text-xs text-[#929292]">Selected Date</p>
            <h3 className="mt-1 text-base font-semibold text-white">
              {formatLongDate(selectedDate)}
            </h3>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#35C98A]">
              {formatCurrency(selectedDayRecord.total, currency)}
            </p>
            <p className="mt-0.5 text-xs text-[#929292]">
              {selectedDayRecord.items.length}{' '}
              {selectedDayRecord.items.length === 1 ? 'deposit' : 'deposits'} recorded
            </p>
          </div>

          {selectedDayRecord.items.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm font-medium text-white">No savings on this date</p>
              <p className="mt-1 text-xs text-[#929292]">
                Record a deposit specifically for this date if needed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#262626]">
              {selectedDayRecord.items.map((txn) => (
                <div key={txn.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold tabular-nums text-white">
                      {formatCurrency(txn.amount, currency)}
                    </p>
                    <p className="mt-0.5 break-words text-xs text-[#929292]">
                      {txn.note || 'Daily saving deposit'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditTransaction(txn)}
                      aria-label={`Edit transaction from ${txn.date}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[#929292] transition-colors hover:bg-[#1B1B1B] hover:text-white"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(txn)}
                      aria-label={`Delete transaction from ${txn.date}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[#929292] transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onAddSavingForDate(selectedDate)}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#35C98A] px-4 text-sm font-semibold text-[#090909] transition-colors hover:bg-[#2eb57b]"
        >
          <Plus className="h-4 w-4" />
          <span>Add Saving for Date</span>
        </button>
      </section>
    </div>
  );
}
