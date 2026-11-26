import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Delete,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  ShieldCheck,
  Vault,
} from 'lucide-react';
import { AuthStatusResponse } from '../types/vault';

interface PinLockScreenProps {
  authStatus: AuthStatusResponse | null;
  isCheckingStatus: boolean;
  connectionError: string | null;
  onRetryStatus: () => Promise<void>;
  onConfigureBackend: (endpointUrl: string, accessKey: string) => Promise<void>;
  onSetupPin: (pin: string, confirmPin: string) => Promise<void>;
  onVerifyPin: (pin: string) => Promise<void>;
}

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinLockScreen({
  authStatus,
  isCheckingStatus,
  connectionError,
  onRetryStatus,
  onConfigureBackend,
  onSetupPin,
  onVerifyPin,
}: PinLockScreenProps) {
  const [pin, setPin] = useState('');
  const [setupStage, setSetupStage] = useState<'create' | 'confirm'>('create');
  const [firstPin, setFirstPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const submittingRef = useRef(false);

  // One-time fallback form if server env vars are not yet configured
  const [endpointUrl, setEndpointUrl] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const isLocked = lockSecondsLeft > 0;
  const pinConfigured = Boolean(authStatus?.pinConfigured);

  useEffect(() => {
    setPin('');
    setFirstPin('');
    setSetupStage('create');
  }, [pinConfigured]);

  useEffect(() => {
    if (authStatus?.locked && authStatus.remainingSeconds > 0) {
      setLockSecondsLeft(authStatus.remainingSeconds);
    } else if (authStatus && !authStatus.locked) {
      setLockSecondsLeft(0);
    }
  }, [authStatus]);

  useEffect(() => {
    if (lockSecondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setLockSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockSecondsLeft]);

  const triggerShake = useCallback(() => {
    setIsShaking(true);
    window.setTimeout(() => setIsShaking(false), 360);
  }, []);

  const submitPin = useCallback(
    async (enteredPin: string) => {
      if (submittingRef.current || isSubmitting || isLocked) return;

      if (!pinConfigured) {
        if (setupStage === 'create') {
          setFirstPin(enteredPin);
          setPin('');
          setErrorMessage(null);
          setSetupStage('confirm');
          return;
        }

        if (enteredPin !== firstPin) {
          setErrorMessage('PINs did not match. Please enter your new PIN again.');
          setFirstPin('');
          setPin('');
          setSetupStage('create');
          triggerShake();
          return;
        }

        submittingRef.current = true;
        setIsSubmitting(true);
        setErrorMessage(null);
        try {
          await onSetupPin(firstPin, enteredPin);
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : 'Unable to save PIN.');
          setFirstPin('');
          setPin('');
          setSetupStage('create');
          triggerShake();
        } finally {
          submittingRef.current = false;
          setIsSubmitting(false);
        }
        return;
      }

      // Returning visit: verify PIN via server
      submittingRef.current = true;
      setIsSubmitting(true);
      setErrorMessage(null);
      try {
        await onVerifyPin(enteredPin);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Incorrect PIN.';
        setErrorMessage(msg);
        setPin('');
        triggerShake();

        const lockedMatch = /Try again in (\d+) seconds/i.exec(msg);
        if (lockedMatch) {
          setLockSecondsLeft(Number(lockedMatch[1]));
        }
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [firstPin, isLocked, isSubmitting, onSetupPin, onVerifyPin, pinConfigured, setupStage, triggerShake]
  );

  const handleDigitPress = useCallback(
    (digit: string) => {
      if (submittingRef.current || isSubmitting || isLocked || !authStatus?.backendConfigured) return;
      if (pin.length >= 4) return;
      const next = pin + digit;
      setPin(next);
      if (errorMessage) setErrorMessage(null);
      if (next.length === 4) {
        void submitPin(next);
      }
    },
    [authStatus?.backendConfigured, errorMessage, isLocked, isSubmitting, pin, submitPin]
  );

  const handleBackspace = useCallback(() => {
    if (submittingRef.current || isSubmitting || isLocked) return;
    setPin((prev) => prev.slice(0, -1));
  }, [isLocked, isSubmitting]);

  const handleResetSetup = () => {
    setSetupStage('create');
    setFirstPin('');
    setPin('');
    setErrorMessage(null);
  };

  // Support physical keyboard entry for digits and Backspace on PIN screens
  useEffect(() => {
    if (!authStatus?.backendConfigured || isCheckingStatus) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [authStatus?.backendConfigured, handleBackspace, handleDigitPress, isCheckingStatus]);

  const handleBackendBootstrap = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    if (!endpointUrl.trim() || !accessKey.trim()) {
      setErrorMessage('Enter both your server endpoint URL and access key.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfigureBackend(endpointUrl.trim(), accessKey.trim());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to connect to server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#080808] px-4 py-10">
      <div className="w-full max-w-[380px] space-y-6">
        {/* Brand Header */}
        <div className="space-y-2.5 text-center">
          <div className="mx-auto flex h-13 w-13 items-center justify-center rounded-2xl border border-[#292929] bg-[#141414] shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
            <Vault className="h-6 w-6 text-[#35C98A]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
              NEXUS VAULT
            </h1>
            <p className="mt-1 text-xs font-medium tracking-wide text-[#929292]">
              Save Today. Secure Tomorrow.
            </p>
          </div>
        </div>

        {/* Initial Connection Check */}
        {isCheckingStatus ? (
          <div className="rounded-2xl border border-[#292929] bg-[#141414] p-8 text-center">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#35C98A]" />
            <p className="mt-4 text-sm font-medium text-white">Connecting to vault server...</p>
            <p className="mt-1 text-xs text-[#929292]">Verifying your secure session</p>
          </div>
        ) : connectionError && !authStatus ? (
          /* Server Unavailable State */
          <div className="space-y-4 rounded-2xl border border-[#292929] bg-[#141414] p-6 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Unable to connect to server.</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-[#929292]">{connectionError}</p>
            </div>
            <button
              type="button"
              onClick={() => void onRetryStatus()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#35C98A] px-5 text-sm font-semibold text-[#080808] transition-colors hover:bg-[#2eb57b]"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Retry Connection</span>
            </button>
          </div>
        ) : authStatus && !authStatus.backendConfigured ? (
          /* One-Time Server Configuration Fallback (only shown if server env vars are unset) */
          <form
            onSubmit={handleBackendBootstrap}
            className="space-y-4 rounded-2xl border border-[#292929] bg-[#141414] p-6"
          >
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-white">Connect Server Once</h2>
              <p className="text-xs leading-relaxed text-[#929292]">
                Server environment variables are not configured yet. Enter your endpoint and access
                key once to connect this server session, or configure them in deployment Secrets for
                automatic startup.
              </p>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
              >
                {errorMessage}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="server-endpoint" className="block text-xs font-medium text-[#929292]">
                Server Endpoint URL
              </label>
              <input
                id="server-endpoint"
                type="url"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://your-server-endpoint/exec"
                className="h-11 w-full rounded-xl border border-[#292929] bg-[#1C1C1C] px-3.5 font-mono text-xs text-white placeholder-[#929292]/50 focus:border-[#35C98A] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="server-key" className="block text-xs font-medium text-[#929292]">
                Server Access Key
              </label>
              <div className="relative">
                <input
                  id="server-key"
                  type={showKey ? 'text' : 'password'}
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="Enter server access key"
                  className="h-11 w-full rounded-xl border border-[#292929] bg-[#1C1C1C] pl-3.5 pr-11 font-mono text-xs text-white placeholder-[#929292]/50 focus:border-[#35C98A] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  aria-label={showKey ? 'Hide access key' : 'Show access key'}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#929292] hover:text-white"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-11 w-full items-center justify-center rounded-xl bg-[#35C98A] px-5 text-sm font-semibold text-[#080808] transition-colors hover:bg-[#2eb57b] disabled:opacity-60"
            >
              {isSubmitting ? 'Connecting to server...' : 'Connect Server'}
            </button>
          </form>
        ) : (
          /* 4-Digit PIN Setup / Unlock Card */
          <div className="rounded-2xl border border-[#292929] bg-[#141414] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.5)]">
            <div className="space-y-1 text-center">
              <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-[#292929] bg-[#1C1C1C]">
                <Lock className="h-4 w-4 text-[#35C98A]" />
              </div>
              <h2 className="font-display text-lg font-semibold text-white">
                {!pinConfigured
                  ? setupStage === 'create'
                    ? 'Create 4-Digit PIN'
                    : 'Confirm 4-Digit PIN'
                  : isLocked
                    ? 'Vault Temporarily Locked'
                    : 'Enter Vault PIN'}
              </h2>
              <p className="text-xs text-[#929292]">
                {!pinConfigured
                  ? setupStage === 'create'
                    ? 'Choose a 4-digit PIN to protect your savings vault.'
                    : 'Re-enter your 4-digit PIN to confirm.'
                  : isLocked
                    ? `Too many failed attempts. Try again in ${formatCountdown(lockSecondsLeft)}.`
                    : 'Enter your 4-digit PIN to unlock.'}
              </p>
            </div>

            {/* 4 PIN Indicators */}
            <div
              className={`mt-6 flex items-center justify-center gap-3.5 ${
                isShaking ? 'animate-pin-shake' : ''
              }`}
              aria-label={`PIN entry: ${pin.length} of 4 digits entered`}
            >
              {[0, 1, 2, 3].map((index) => {
                const isFilled = index < pin.length;
                const isActiveSlot = index === pin.length && !isLocked && !isSubmitting;
                return (
                  <div
                    key={index}
                    className={`flex h-13 w-12 items-center justify-center rounded-xl border transition-all duration-150 ${
                      isLocked
                        ? 'border-red-500/30 bg-[#1C1C1C]/60'
                        : isFilled
                          ? 'border-[#35C98A] bg-[#35C98A]/10'
                          : isActiveSlot
                            ? 'border-[#35C98A]/50 bg-[#1C1C1C]'
                            : 'border-[#292929] bg-[#1C1C1C]'
                    }`}
                  >
                    <span
                      className={`h-3 w-3 rounded-full transition-all duration-150 ${
                        isFilled ? 'scale-100 bg-[#35C98A]' : 'scale-75 bg-[#292929]'
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Feedback / Status Line */}
            <div className="mt-4 min-h-[20px] text-center">
              {isSubmitting ? (
                <p className="text-xs font-medium text-[#35C98A]">Verifying with server...</p>
              ) : errorMessage ? (
                <p role="alert" className="text-xs font-medium text-red-400">
                  {errorMessage}
                </p>
              ) : !pinConfigured && setupStage === 'confirm' ? (
                <button
                  type="button"
                  onClick={handleResetSetup}
                  className="text-xs font-medium text-[#929292] transition-colors hover:text-white"
                >
                  Start over
                </button>
              ) : pinConfigured &&
                !isLocked &&
                typeof authStatus?.attemptsRemaining === 'number' &&
                authStatus.attemptsRemaining < 5 ? (
                <p className="font-mono text-xs tabular-nums text-[#929292]">
                  {authStatus.attemptsRemaining} attempts remaining
                </p>
              ) : null}
            </div>

            {/* Numeric Keypad (0-9 + Backspace) */}
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {KEYPAD_DIGITS.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={isSubmitting || isLocked}
                  onClick={() => handleDigitPress(digit)}
                  className="flex h-13 items-center justify-center rounded-xl border border-[#292929] bg-[#1C1C1C] font-mono text-lg font-semibold tabular-nums text-white transition-all duration-100 hover:border-[#3d3d3d] hover:bg-[#232323] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {digit}
                </button>
              ))}

              <div className="flex h-13 items-center justify-center" aria-hidden="true" />

              <button
                type="button"
                disabled={isSubmitting || isLocked}
                onClick={() => handleDigitPress('0')}
                className="flex h-13 items-center justify-center rounded-xl border border-[#292929] bg-[#1C1C1C] font-mono text-lg font-semibold tabular-nums text-white transition-all duration-100 hover:border-[#3d3d3d] hover:bg-[#232323] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                0
              </button>

              <button
                type="button"
                disabled={isSubmitting || isLocked || pin.length === 0}
                onClick={handleBackspace}
                aria-label="Backspace"
                className="flex h-13 items-center justify-center rounded-xl border border-[#292929] bg-[#1C1C1C] text-[#929292] transition-all duration-100 hover:border-[#3d3d3d] hover:bg-[#232323] hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 flex items-center justify-center gap-1.5 border-t border-[#292929] pt-4 text-[11px] text-[#929292]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#35C98A]" />
              <span>Server connected. Session secured with hashed PIN.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
