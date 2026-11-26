import { FormEvent, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CurrencyCode, GoalInput, SavingsGoal } from '../types/vault';
import { getCurrencyMeta, validateAmountValue } from '../utils/format';

interface GoalModalProps {
  isOpen: boolean;
  currency: CurrencyCode;
  currentGoal: SavingsGoal | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: GoalInput) => Promise<void>;
}

export function GoalModal({
  isOpen,
  currency,
  currentGoal,
  isSubmitting,
  onClose,
  onSubmit,
}: GoalModalProps) {
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (currentGoal) {
      setGoalName(currentGoal.goalName);
      setTargetAmount(String(currentGoal.targetAmount));
    } else {
      setGoalName('');
      setTargetAmount('');
    }
  }, [isOpen, currentGoal]);

  if (!isOpen) return null;

  const { symbol } = getCurrencyMeta(currency);
  const isEditing = Boolean(currentGoal);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const trimmedName = goalName.trim();
    if (!trimmedName) {
      setError('Enter a name for your savings goal.');
      return;
    }

    const amountCheck = validateAmountValue(targetAmount);
    if (!amountCheck.valid) {
      setError(amountCheck.error || 'Target amount must be greater than zero.');
      return;
    }

    try {
      await onSubmit({
        goalId: currentGoal?.goalId,
        goalName: trimmedName.slice(0, 100),
        targetAmount: amountCheck.value,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save goal.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="goal-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#292929] bg-[#141414] shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between border-b border-[#292929] px-6 py-4">
          <div>
            <h2 id="goal-modal-title" className="font-display text-lg font-semibold text-white">
              {isEditing ? 'Update Savings Goal' : 'Create Savings Goal'}
            </h2>
            <p className="mt-0.5 text-xs text-[#929292]">
              Progress updates automatically from your transaction records
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close goal modal"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[#929292] transition-colors hover:bg-[#1C1C1C] hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="goal-name" className="block text-xs font-medium text-[#929292]">
              Goal Name
            </label>
            <input
              id="goal-name"
              type="text"
              maxLength={100}
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              placeholder="e.g. Emergency Reserve, MacBook Pro, Goa Trip"
              autoFocus
              className="h-11 w-full rounded-xl border border-[#292929] bg-[#1C1C1C] px-3.5 text-sm text-white placeholder-[#929292]/50 transition-colors focus:border-[#35C98A] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="goal-target" className="block text-xs font-medium text-[#929292]">
              Target Amount ({symbol})
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-[#929292]">
                {symbol}
              </span>
              <input
                id="goal-target"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="100000"
                className="h-11 w-full rounded-xl border border-[#292929] bg-[#1C1C1C] pl-9 pr-3.5 font-mono text-base tabular-nums text-white placeholder-[#929292]/50 transition-colors focus:border-[#35C98A] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#292929] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 rounded-xl border border-[#292929] bg-[#1C1C1C] px-4 text-sm font-medium text-white transition-colors hover:border-[#3d3d3d] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-10 rounded-xl bg-[#35C98A] px-5 text-sm font-semibold text-[#080808] transition-colors hover:bg-[#2eb57b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Saving to server...' : isEditing ? 'Update Goal' : 'Create Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
