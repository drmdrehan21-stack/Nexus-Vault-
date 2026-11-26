import { AlertTriangle, X } from 'lucide-react';
import { CurrencyCode, Transaction } from '../types/vault';
import { formatCurrency, formatDisplayDate } from '../utils/format';

interface ConfirmDeleteModalProps {
  transaction: Transaction | null;
  currency: CurrencyCode;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmDeleteModal({
  transaction,
  currency,
  isDeleting,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  if (!transaction) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#292929] bg-[#141414] shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between border-b border-[#292929] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <h2 id="delete-modal-title" className="font-display text-base font-semibold text-white">
              Delete Saving Entry
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            aria-label="Close confirmation dialog"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[#929292] transition-colors hover:bg-[#1C1C1C] hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm leading-relaxed text-[#929292]">
            Are you sure you want to permanently delete this saving entry?
          </p>

          <div className="rounded-xl border border-[#292929] bg-[#1C1C1C] px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-base font-semibold tabular-nums text-white">
                {formatCurrency(transaction.amount, currency)}
              </span>
              <span className="font-mono text-xs tabular-nums text-[#929292]">
                {formatDisplayDate(transaction.date)}
              </span>
            </div>
            {transaction.note && (
              <p className="mt-1.5 text-xs text-[#929292]">{transaction.note}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#292929] pt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              className="h-10 rounded-xl border border-[#292929] bg-[#1C1C1C] px-4 text-sm font-medium text-white transition-colors hover:border-[#3d3d3d] disabled:opacity-50"
            >
              Keep Entry
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="h-10 rounded-xl bg-red-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
