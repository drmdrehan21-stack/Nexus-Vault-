import { FormEvent, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CurrencyCode, Transaction, TransactionInput } from '../types/vault';
import {
  getCurrencyMeta,
  getTodayISO,
  isValidISODate,
  validateAmountValue,
} from '../utils/format';

interface TransactionModalProps {
  isOpen: boolean;
  currency: CurrencyCode;
  editingTransaction: Transaction | null;
  initialDate?: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: TransactionInput) => Promise<void>;
}

export function TransactionModal({
  isOpen,
  currency,
  editingTransaction,
  initialDate,
  isSubmitting,
  onClose,
  onSubmit,
}: TransactionModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingTransaction) {
      setAmount(String(editingTransaction.amount));
      setDate(editingTransaction.date);
      setNote(editingTransaction.note || '');
    } else {
      setAmount('');
      setDate(initialDate && isValidISODate(initialDate) ? initialDate : getTodayISO());
      setNote('');
    }
  }, [isOpen, editingTransaction, initialDate]);

  if (!isOpen) return null;

  const { symbol } = getCurrencyMeta(currency);
  const isEditing = Boolean(editingTransaction);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const amountCheck = validateAmountValue(amount);
    if (!amountCheck.valid) {
      setError(amountCheck.error || 'Enter a valid saving amount.');
      return;
    }

    if (!isValidISODate(date)) {
      setError('Select a valid date.');
      return;
    }

    try {
      await onSubmit({
        id: editingTransaction?.id,
        date,
        amount: amountCheck.value,
        note: note.trim().slice(0, 240),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save transaction.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="txn-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-xl border border-[#262626] bg-[#141414]">
        <div className="flex items-center justify-between border-b border-[#262626] px-6 py-4">
          <div>
            <h2 id="txn-modal-title" className="text-lg font-semibold text-white">
              {isEditing ? 'Edit Saving' : 'Add Saving'}
            </h2>
            <p className="mt-0.5 text-xs text-[#929292]">
              {isEditing
                ? 'Update this entry in Google Sheets'
                : 'Record a deposit into your Nexus Vault'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[#929292] transition-colors hover:bg-[#1B1B1B] hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="modal-amount" className="block text-xs font-medium text-[#929292]">
              Amount ({symbol})
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-[#929292]">
                {symbol}
              </span>
              <input
                id="modal-amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500"
                autoFocus
                className="h-11 w-full rounded-lg border border-[#262626] bg-[#1B1B1B] pl-9 pr-3.5 font-mono text-base tabular-nums text-white placeholder-[#929292]/50 transition-colors focus:border-[#35C98A] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="modal-date" className="block text-xs font-medium text-[#929292]">
              Date
            </label>
            <input
              id="modal-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 w-full rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 font-mono text-sm tabular-nums text-white transition-colors focus:border-[#35C98A] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="modal-note" className="block text-xs font-medium text-[#929292]">
                Note (optional)
              </label>
              <span className="font-mono text-[11px] tabular-nums text-[#929292]">
                {note.length}/240
              </span>
            </div>
            <input
              id="modal-note"
              type="text"
              maxLength={240}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Daily Gullak deposit, freelance surplus"
              className="h-11 w-full rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 text-sm text-white placeholder-[#929292]/50 transition-colors focus:border-[#35C98A] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#262626] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 rounded-lg border border-[#262626] bg-[#1B1B1B] px-4 text-sm font-medium text-white transition-colors hover:border-[#3a3a3a] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-10 rounded-lg bg-[#35C98A] px-5 text-sm font-semibold text-[#090909] transition-colors hover:bg-[#2eb57b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? 'Saving to Sheets...'
                : isEditing
                  ? 'Save Changes'
                  : 'Add Saving'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
