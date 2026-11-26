import { FormEvent, useState } from 'react';
import { BookOpen, Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { validateAppsScriptUrl } from '../utils/format';
import { SetupGuideModal } from './SetupGuideModal';

interface VaultAuthGateProps {
  defaultEndpointUrl: string;
  isLoading: boolean;
  errorMessage: string | null;
  onUnlock: (endpointUrl: string, accessKey: string) => Promise<void>;
}

export function VaultAuthGate({
  defaultEndpointUrl,
  isLoading,
  errorMessage,
  onUnlock,
}: VaultAuthGateProps) {
  const [endpointUrl, setEndpointUrl] = useState(defaultEndpointUrl);
  const [accessKey, setAccessKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showEndpointField, setShowEndpointField] = useState(!defaultEndpointUrl);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const urlCheck = validateAppsScriptUrl(endpointUrl);
    if (!urlCheck.valid) {
      setValidationError(urlCheck.error || 'Invalid Google Apps Script URL.');
      setShowEndpointField(true);
      return;
    }

    if (!accessKey.trim()) {
      setValidationError('Enter your Vault Access Key to unlock.');
      return;
    }

    await onUnlock(urlCheck.url, accessKey.trim());
  };

  const activeError = validationError || errorMessage;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#090909] px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#262626] bg-[#141414]">
            <Lock className="h-5 w-5 text-[#35C98A]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">NEXUS VAULT</h1>
          <p className="text-sm text-[#929292]">Save Today. Secure Tomorrow.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl border border-[#262626] bg-[#141414] p-6"
        >
          <div className="space-y-1">
            <h2 className="text-base font-medium text-white">Unlock Personal Vault</h2>
            <p className="text-xs text-[#929292]">
              Connects directly to your private Google Sheets database via Apps Script.
            </p>
          </div>

          {activeError && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-red-300"
            >
              {activeError}
            </div>
          )}

          {showEndpointField ? (
            <div className="space-y-1.5">
              <label htmlFor="vault-endpoint" className="block text-xs font-medium text-[#929292]">
                Google Apps Script Web App URL
              </label>
              <input
                id="vault-endpoint"
                type="url"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                autoComplete="off"
                className="h-11 w-full rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 font-mono text-xs text-white placeholder-[#929292]/60 transition-colors focus:border-[#35C98A] focus:outline-none"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 py-2.5">
              <div className="min-w-0 pr-3">
                <p className="text-[11px] text-[#929292]">Configured Endpoint</p>
                <p className="truncate font-mono text-xs text-white">{endpointUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEndpointField(true)}
                className="shrink-0 text-xs font-medium text-[#35C98A] hover:underline"
              >
                Change
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="vault-access-key" className="block text-xs font-medium text-[#929292]">
              Vault Access Key
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#929292]" />
              <input
                id="vault-access-key"
                type={showKey ? 'text' : 'password'}
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="Enter VAULT_ACCESS_KEY"
                autoComplete="current-password"
                className="h-11 w-full rounded-lg border border-[#262626] bg-[#1B1B1B] pl-10 pr-11 font-mono text-sm text-white placeholder-[#929292]/60 transition-colors focus:border-[#35C98A] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                aria-label={showKey ? 'Hide access key' : 'Show access key'}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#929292] hover:text-white"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#35C98A] px-5 text-sm font-semibold text-[#090909] transition-colors hover:bg-[#2eb57b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Verifying with Google Sheets...' : 'Unlock Vault'}
          </button>

          <div className="flex items-center justify-between border-t border-[#262626] pt-4 text-xs text-[#929292]">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#35C98A]" />
              Key kept in memory only
            </span>
            <button
              type="button"
              onClick={() => setIsSetupOpen(true)}
              className="inline-flex items-center gap-1.5 font-medium text-white transition-colors hover:text-[#35C98A]"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Setup Guide
            </button>
          </div>
        </form>
      </div>

      <SetupGuideModal isOpen={isSetupOpen} onClose={() => setIsSetupOpen(false)} />
    </div>
  );
}
