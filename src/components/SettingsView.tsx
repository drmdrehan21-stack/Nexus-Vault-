import { FormEvent, useEffect, useState } from 'react';
import { BookOpen, Download, Lock, Target } from 'lucide-react';
import { CurrencyCode, GoalInput, SavingsGoal, Transaction } from '../types/vault';
import { formatCurrency, getCurrencyMeta, validateAmountValue } from '../utils/format';
import { SetupGuideModal } from './SetupGuideModal';

interface SettingsViewProps {
  currency: CurrencyCode;
  currentGoal: SavingsGoal | null;
  transactions: Transaction[];
  endpointUrl: string;
  isUpdatingSettings: boolean;
  isSavingGoal: boolean;
  onUpdateCurrency: (currency: CurrencyCode) => Promise<void>;
  onSaveGoal: (input: GoalInput) => Promise<void>;
  onLockVault: () => void;
}

const CURRENCIES: CurrencyCode[] = ['INR', 'USD', 'EUR', 'GBP'];

export function SettingsView({
  currency,
  currentGoal,
  transactions,
  endpointUrl,
  isUpdatingSettings,
  isSavingGoal,
  onUpdateCurrency,
  onSaveGoal,
  onLockVault,
}: SettingsViewProps) {
  const [goalName, setGoalName] = useState(currentGoal?.goalName ?? '');
  const [targetAmount, setTargetAmount] = useState(
    currentGoal ? String(currentGoal.targetAmount) : ''
  );
  const [goalError, setGoalError] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    setGoalName(currentGoal?.goalName ?? '');
    setTargetAmount(currentGoal ? String(currentGoal.targetAmount) : '');
  }, [currentGoal]);

  const { symbol } = getCurrencyMeta(currency);

  const handleGoalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSavingGoal) return;
    setGoalError(null);

    const trimmedName = goalName.trim();
    if (!trimmedName) {
      setGoalError('Goal name is required.');
      return;
    }

    const amountCheck = validateAmountValue(targetAmount);
    if (!amountCheck.valid) {
      setGoalError(amountCheck.error || 'Target amount must be greater than zero.');
      return;
    }

    try {
      await onSaveGoal({
        goalId: currentGoal?.goalId,
        goalName: trimmedName.slice(0, 100),
        targetAmount: amountCheck.value,
      });
    } catch (err) {
      setGoalError(err instanceof Error ? err.message : 'Unable to save goal.');
    }
  };

  const handleExportCsv = () => {
    const header = ['ID', 'Date', 'Amount', 'Note', 'CreatedAt'];
    const escapeCell = (val: string | number) => {
      const s = String(val ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = transactions.map((t) =>
      [t.id, t.date, t.amount, t.note, t.createdAt].map(escapeCell).join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexus-vault-savings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Savings Goal Management */}
        <section className="rounded-xl border border-[#262626] bg-[#141414] p-6 lg:col-span-7">
          <div className="flex items-center gap-2 border-b border-[#262626] pb-4">
            <Target className="h-4 w-4 text-[#35C98A]" />
            <div>
              <h2 className="text-base font-semibold text-white">Savings Goal Management</h2>
              <p className="text-xs text-[#929292]">
                Stored permanently in the Goals worksheet of Google Sheets
              </p>
            </div>
          </div>

          <form onSubmit={handleGoalSubmit} className="mt-5 space-y-4">
            {goalError && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
              >
                {goalError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="settings-goal-name" className="block text-xs font-medium text-[#929292]">
                  Goal Name
                </label>
                <input
                  id="settings-goal-name"
                  type="text"
                  maxLength={100}
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  placeholder="e.g. Emergency Fund"
                  className="h-11 w-full rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 text-sm text-white placeholder-[#929292]/50 focus:border-[#35C98A] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="settings-goal-target" className="block text-xs font-medium text-[#929292]">
                  Target Amount ({symbol})
                </label>
                <input
                  id="settings-goal-target"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder="100000"
                  className="h-11 w-full rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 font-mono text-sm tabular-nums text-white placeholder-[#929292]/50 focus:border-[#35C98A] focus:outline-none"
                />
              </div>
            </div>

            {currentGoal && (
              <div className="grid grid-cols-3 gap-3 rounded-lg border border-[#262626] bg-[#1B1B1B] p-4">
                <div>
                  <p className="text-[11px] text-[#929292]">Current Saved</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
                    {formatCurrency(currentGoal.currentSavings, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#929292]">Remaining</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[#35C98A]">
                    {formatCurrency(currentGoal.remainingAmount, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#929292]">Completion</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
                    {currentGoal.completionPercentage.toFixed(1)}%
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingGoal}
                className="h-10 rounded-lg bg-[#35C98A] px-5 text-sm font-semibold text-[#090909] transition-colors hover:bg-[#2eb57b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingGoal
                  ? 'Saving...'
                  : currentGoal
                    ? 'Update Savings Goal'
                    : 'Create Savings Goal'}
              </button>
            </div>
          </form>
        </section>

        {/* Currency Preference */}
        <section className="rounded-xl border border-[#262626] bg-[#141414] p-6 lg:col-span-5">
          <div className="border-b border-[#262626] pb-4">
            <h2 className="text-base font-semibold text-white">Currency Preference</h2>
            <p className="text-xs text-[#929292]">
              Saved in Google Sheets Settings worksheet (default INR)
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {CURRENCIES.map((code) => {
              const meta = getCurrencyMeta(code);
              const isSelected = currency === code;
              return (
                <button
                  key={code}
                  type="button"
                  disabled={isUpdatingSettings}
                  onClick={() => onUpdateCurrency(code)}
                  className={`flex h-12 items-center justify-between rounded-lg border px-4 text-left transition-colors ${
                    isSelected
                      ? 'border-[#35C98A] bg-[#35C98A]/10 text-white'
                      : 'border-[#262626] bg-[#1B1B1B] text-[#929292] hover:border-[#3a3a3a] hover:text-white'
                  } disabled:opacity-60`}
                >
                  <span className="text-sm font-medium">{code}</span>
                  <span className="font-mono text-sm text-[#35C98A]">{meta.symbol}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Application Information & Vault Controls */}
      <section className="rounded-xl border border-[#262626] bg-[#141414] p-6">
        <div className="flex flex-col gap-4 border-b border-[#262626] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Application & Storage</h2>
            <p className="text-xs text-[#929292]">
              NEXUS VAULT · Save Today. Secure Tomorrow.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={transactions.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 text-xs font-medium text-white transition-colors hover:border-[#3a3a3a] disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5 text-[#35C98A]" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 text-xs font-medium text-white transition-colors hover:border-[#3a3a3a]"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Setup Guide</span>
            </button>
            <button
              type="button"
              onClick={onLockVault}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 text-xs font-medium text-white transition-colors hover:border-red-500/40 hover:text-red-300"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Lock Vault</span>
            </button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-[#929292]">Primary Database</dt>
            <dd className="mt-1 font-medium text-white">Google Sheets (Nexus Vault Database)</dd>
          </div>
          <div>
            <dt className="text-[#929292]">Backend API</dt>
            <dd className="mt-1 font-medium text-white">Google Apps Script Web App</dd>
          </div>
          <div>
            <dt className="text-[#929292]">Connected Endpoint</dt>
            <dd className="mt-1 truncate font-mono text-white" title={endpointUrl}>
              {endpointUrl}
            </dd>
          </div>
        </dl>
      </section>

      <SetupGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
