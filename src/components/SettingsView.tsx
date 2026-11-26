import { FormEvent, useEffect, useState } from 'react';
import { Coins, Info, KeyRound, Lock, ShieldCheck, Target } from 'lucide-react';
import { CurrencyCode, GoalInput, SavingsGoal } from '../types/vault';
import { formatCurrency, getCurrencyMeta, validateAmountValue } from '../utils/format';

interface SettingsViewProps {
  currency: CurrencyCode;
  currentGoal: SavingsGoal | null;
  isUpdatingSettings: boolean;
  isSavingGoal: boolean;
  onUpdateCurrency: (currency: CurrencyCode) => Promise<void>;
  onSaveGoal: (input: GoalInput) => Promise<void>;
  onChangePin: (currentPin: string, newPin: string, confirmPin: string) => Promise<void>;
  onLockVault: () => void;
}

const CURRENCIES: CurrencyCode[] = ['INR', 'USD', 'EUR', 'GBP'];

export function SettingsView({
  currency,
  currentGoal,
  isUpdatingSettings,
  isSavingGoal,
  onUpdateCurrency,
  onSaveGoal,
  onChangePin,
  onLockVault,
}: SettingsViewProps) {
  const [goalName, setGoalName] = useState(currentGoal?.goalName ?? '');
  const [targetAmount, setTargetAmount] = useState(
    currentGoal ? String(currentGoal.targetAmount) : ''
  );
  const [goalError, setGoalError] = useState<string | null>(null);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isChangingPin, setIsChangingPin] = useState(false);

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

  const handlePinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isChangingPin) return;
    setPinError(null);

    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
      setPinError('PINs must be exactly 4 numeric digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('New PIN and confirmation PIN do not match.');
      return;
    }

    setIsChangingPin(true);
    try {
      await onChangePin(currentPin, newPin, confirmPin);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Unable to update PIN.');
    } finally {
      setIsChangingPin(false);
    }
  };

  const sanitizePinInput = (value: string) => value.replace(/\D/g, '').slice(0, 4);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* 1. Change PIN */}
      <section className="rounded-2xl border border-[#292929] bg-[#141414] p-6 shadow-[0_12px_36px_rgba(0,0,0,0.35)] lg:col-span-6">
        <div className="flex items-center gap-2.5 border-b border-[#292929] pb-4">
          <KeyRound className="h-4 w-4 text-[#35C98A]" />
          <div>
            <h2 className="font-display text-base font-semibold text-white">Change PIN</h2>
            <p className="text-xs text-[#929292]">Update your 4-digit security PIN</p>
          </div>
        </div>

        <form onSubmit={handlePinSubmit} className="mt-5 space-y-4">
          {pinError && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
            >
              {pinError}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="settings-current-pin" className="block text-xs font-medium text-[#929292]">
              Current 4-Digit PIN
            </label>
            <input
              id="settings-current-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={currentPin}
              onChange={(e) => setCurrentPin(sanitizePinInput(e.target.value))}
              placeholder="••••"
              className="h-11 w-full rounded-xl border border-[#292929] bg-[#1C1C1C] px-3.5 font-mono text-base tracking-[0.35em] tabular-nums text-white placeholder-[#929292]/50 focus:border-[#35C98A] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="settings-new-pin" className="block text-xs font-medium text-[#929292]">
                New 4-Digit PIN
              </label>
              <input
                id="settings-new-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(sanitizePinInput(e.target.value))}
                placeholder="••••"
                className="h-11 w-full rounded-xl border border-[#292929] bg-[#1C1C1C] px-3.5 font-mono text-base tracking-[0.35em] tabular-nums text-white placeholder-[#929292]/50 focus:border-[#35C98A] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="settings-confirm-pin" className="block text-xs font-medium text-[#929292]">
                Confirm New PIN
              </label>
              <input
                id="settings-confirm-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(sanitizePinInput(e.target.value))}
                placeholder="••••"
                className="h-11 w-full rounded-xl border border-[#292929] bg-[#1C1C1C] px-3.5 font-mono text-base tracking-[0.35em] tabular-nums text-white placeholder-[#929292]/50 focus:border-[#35C98A] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isChangingPin}
              className="h-10 rounded-xl bg-[#35C98A] px-5 text-sm font-semibold text-[#080808] transition-colors hover:bg-[#2eb57b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isChangingPin ? 'Updating PIN...' : 'Update PIN'}
            </button>
          </div>
        </form>
      </section>

      {/* 2. Currency Preference */}
      <section className="flex flex-col justify-between rounded-2xl border border-[#292929] bg-[#141414] p-6 shadow-[0_12px_36px_rgba(0,0,0,0.35)] lg:col-span-6">
        <div>
          <div className="flex items-center gap-2.5 border-b border-[#292929] pb-4">
            <Coins className="h-4 w-4 text-[#35C98A]" />
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Currency Preference
              </h2>
              <p className="text-xs text-[#929292]">Select display currency (default INR)</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {CURRENCIES.map((code) => {
              const meta = getCurrencyMeta(code);
              const isSelected = currency === code;
              return (
                <button
                  key={code}
                  type="button"
                  disabled={isUpdatingSettings}
                  onClick={() => onUpdateCurrency(code)}
                  className={`flex h-13 items-center justify-between rounded-xl border px-4 text-left transition-all duration-150 ${
                    isSelected
                      ? 'border-[#35C98A] bg-[#35C98A]/10 text-white'
                      : 'border-[#292929] bg-[#1C1C1C] text-[#929292] hover:border-[#3d3d3d] hover:text-white'
                  } disabled:opacity-60`}
                >
                  <span className="text-sm font-medium">{code}</span>
                  <span className="font-mono text-base font-semibold text-[#35C98A]">
                    {meta.symbol}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-5 border-t border-[#292929] pt-4 text-xs text-[#929292]">
          Active format preview:{' '}
          <span className="font-mono font-semibold tabular-nums text-white">
            {formatCurrency(25000, currency)}
          </span>
        </p>
      </section>

      {/* 3. Savings Goal Management */}
      <section className="rounded-2xl border border-[#292929] bg-[#141414] p-6 shadow-[0_12px_36px_rgba(0,0,0,0.35)] lg:col-span-7">
        <div className="flex items-center gap-2.5 border-b border-[#292929] pb-4">
          <Target className="h-4 w-4 text-[#35C98A]" />
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Savings Goal Management
            </h2>
            <p className="text-xs text-[#929292]">Configure your active savings target</p>
          </div>
        </div>

        <form onSubmit={handleGoalSubmit} className="mt-5 space-y-4">
          {goalError && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
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
                className="h-11 w-full rounded-xl border border-[#292929] bg-[#1C1C1C] px-3.5 text-sm text-white placeholder-[#929292]/50 focus:border-[#35C98A] focus:outline-none"
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
                className="h-11 w-full rounded-xl border border-[#292929] bg-[#1C1C1C] px-3.5 font-mono text-sm tabular-nums text-white placeholder-[#929292]/50 focus:border-[#35C98A] focus:outline-none"
              />
            </div>
          </div>

          {currentGoal && (
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-[#292929] bg-[#1C1C1C] p-4">
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
              className="h-10 rounded-xl bg-[#35C98A] px-5 text-sm font-semibold text-[#080808] transition-colors hover:bg-[#2eb57b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingGoal
                ? 'Saving to server...'
                : currentGoal
                  ? 'Update Savings Goal'
                  : 'Create Savings Goal'}
            </button>
          </div>
        </form>
      </section>

      {/* 4. Application Information */}
      <section className="flex flex-col justify-between rounded-2xl border border-[#292929] bg-[#141414] p-6 shadow-[0_12px_36px_rgba(0,0,0,0.35)] lg:col-span-5">
        <div>
          <div className="flex items-center gap-2.5 border-b border-[#292929] pb-4">
            <Info className="h-4 w-4 text-[#35C98A]" />
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Application Information
              </h2>
              <p className="text-xs text-[#929292]">NEXUS VAULT · Save Today. Secure Tomorrow.</p>
            </div>
          </div>

          <dl className="mt-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#292929] pb-3">
              <dt className="text-[#929292]">Application</dt>
              <dd className="font-medium text-white">Nexus Vault Personal Gullak</dd>
            </div>
            <div className="flex items-center justify-between border-b border-[#292929] pb-3">
              <dt className="text-[#929292]">Connection Status</dt>
              <dd className="inline-flex items-center gap-1.5 font-medium text-[#35C98A]">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Server connected.</span>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#929292]">Vault Security</dt>
              <dd className="font-medium text-white">4-Digit Hashed PIN</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 border-t border-[#292929] pt-4">
          <button
            type="button"
            onClick={onLockVault}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#292929] bg-[#1C1C1C] px-4 text-xs font-medium text-white transition-colors hover:border-red-500/40 hover:text-red-300"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Lock Vault</span>
          </button>
        </div>
      </section>
    </div>
  );
}
