import { FormEvent, useMemo, useState } from 'react';
import { ArrowUpDown, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { CurrencyCode, Transaction, TransactionInput } from '../types/vault';
import {
  formatCurrency,
  formatDisplayDate,
  getCurrencyMeta,
  getTodayISO,
  isValidISODate,
  validateAmountValue,
} from '../utils/format';

type SortMode = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

interface DailySavingsViewProps {
  currency: CurrencyCode;
  transactions: Transaction[];
  isSubmitting: boolean;
  onAddTransaction: (input: TransactionInput) => Promise<void>;
  onEditTransaction: (txn: Transaction) => void;
  onDeleteTransaction: (txn: Transaction) => void;
}

export function DailySavingsView({
  currency,
  transactions,
  isSubmitting,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
}: DailySavingsViewProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayISO());
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');

  const { symbol } = getCurrencyMeta(currency);

  const handleQuickAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);

    const amountCheck = validateAmountValue(amount);
    if (!amountCheck.valid) {
      setFormError(amountCheck.error || 'Enter a valid positive amount.');
      return;
    }

    if (!isValidISODate(date)) {
      setFormError('Select a valid date.');
      return;
    }

    try {
      await onAddTransaction({
        date,
        amount: amountCheck.value,
        note: note.trim().slice(0, 240),
      });
      setAmount('');
      setNote('');
      setDate(getTodayISO());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save transaction.');
    }
  };

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? transactions.filter(
          (t) =>
            t.note.toLowerCase().includes(q) ||
            t.date.includes(q) ||
            String(t.amount).includes(q)
        )
      : [...transactions];

    filtered.sort((a, b) => {
      switch (sortMode) {
        case 'date-asc':
          if (a.date !== b.date) return a.date < b.date ? -1 : 1;
          return a.createdAt < b.createdAt ? -1 : 1;
        case 'amount-desc':
          return b.amount - a.amount;
        case 'amount-asc':
          return a.amount - b.amount;
        case 'date-desc':
        default:
          if (a.date !== b.date) return a.date < b.date ? 1 : -1;
          return a.createdAt < b.createdAt ? 1 : -1;
      }
    });

    return filtered;
  }, [transactions, searchQuery, sortMode]);

  const filteredTotal = useMemo(
    () => filteredAndSorted.reduce((sum, t) => sum + t.amount, 0),
    [filteredAndSorted]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Inline Add Saving Form */}
      <section className="h-fit rounded-xl border border-[#262626] bg-[#141414] p-6 lg:col-span-4">
        <div className="space-y-1 border-b border-[#262626] pb-4">
          <h2 className="text-base font-semibold text-white">Record Saving</h2>
          <p className="text-xs text-[#929292]">
            Writes directly to your Google Sheets ledger
          </p>
        </div>

        <form onSubmit={handleQuickAdd} className="mt-5 space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
            >
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="daily-amount" className="block text-xs font-medium text-[#929292]">
              Amount ({symbol})
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-[#929292]">
                {symbol}
              </span>
              <input
                id="daily-amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500"
                className="h-11 w-full rounded-lg border border-[#262626] bg-[#1B1B1B] pl-9 pr-3.5 font-mono text-base tabular-nums text-white placeholder-[#929292]/50 transition-colors focus:border-[#35C98A] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="daily-date" className="block text-xs font-medium text-[#929292]">
              Date
            </label>
            <input
              id="daily-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 w-full rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 font-mono text-sm tabular-nums text-white transition-colors focus:border-[#35C98A] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="daily-note" className="block text-xs font-medium text-[#929292]">
                Note (optional)
              </label>
              <span className="font-mono text-[11px] tabular-nums text-[#929292]">
                {note.length}/240
              </span>
            </div>
            <input
              id="daily-note"
              type="text"
              maxLength={240}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Morning Gullak drop"
              className="h-11 w-full rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 text-sm text-white placeholder-[#929292]/50 transition-colors focus:border-[#35C98A] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#35C98A] px-5 text-sm font-semibold text-[#090909] transition-colors hover:bg-[#2eb57b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            <span>{isSubmitting ? 'Saving to Google Sheets...' : 'Save Deposit'}</span>
          </button>
        </form>
      </section>

      {/* Complete Transaction History */}
      <section className="rounded-xl border border-[#262626] bg-[#141414] lg:col-span-8">
        <div className="flex flex-col gap-4 border-b border-[#262626] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Transaction History</h2>
            <p className="mt-0.5 font-mono text-xs tabular-nums text-[#929292]">
              {filteredAndSorted.length} {filteredAndSorted.length === 1 ? 'entry' : 'entries'} ·{' '}
              {formatCurrency(filteredTotal, currency)} total
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#929292]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search note or date"
                aria-label="Search transactions"
                className="h-10 w-full rounded-lg border border-[#262626] bg-[#1B1B1B] pl-8.5 pr-3 text-xs text-white placeholder-[#929292]/60 focus:border-[#35C98A] focus:outline-none sm:w-44"
              />
            </div>

            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#929292]" />
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                aria-label="Sort transactions"
                className="h-10 w-full appearance-none rounded-lg border border-[#262626] bg-[#1B1B1B] pl-8.5 pr-7 text-xs text-white focus:border-[#35C98A] focus:outline-none sm:w-auto"
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="amount-desc">Highest Amount</option>
                <option value="amount-asc">Lowest Amount</option>
              </select>
            </div>
          </div>
        </div>

        {filteredAndSorted.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-white">
              {transactions.length === 0
                ? 'No transactions found in Google Sheets'
                : 'No matching transactions'}
            </p>
            <p className="mt-1 text-xs text-[#929292]">
              {transactions.length === 0
                ? 'Use the Record Saving form to add your first deposit.'
                : 'Try adjusting your search filter.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#262626]">
            {filteredAndSorted.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-[#1B1B1B]/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-base font-semibold tabular-nums text-white">
                      {formatCurrency(txn.amount, currency)}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-[#35C98A]">
                      {formatDisplayDate(txn.date)}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs text-[#929292]">
                    {txn.note || 'Daily saving deposit'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEditTransaction(txn)}
                    aria-label={`Edit transaction ${txn.id}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-[#929292] transition-colors hover:bg-[#1B1B1B] hover:text-white"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTransaction(txn)}
                    aria-label={`Delete transaction ${txn.id}`}
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
