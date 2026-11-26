import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { useState } from 'react';

interface SetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SetupGuideModal({ isOpen, onClose }: SetupGuideModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-guide-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#262626] bg-[#141414]">
        <div className="flex items-center justify-between border-b border-[#262626] px-6 py-4">
          <div>
            <h2 id="setup-guide-title" className="text-lg font-semibold text-white">
              Google Sheets & Apps Script Setup
            </h2>
            <p className="mt-0.5 text-xs text-[#929292]">
              Connect your private Google Sheet database in four steps
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup guide"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[#929292] transition-colors hover:bg-[#1B1B1B] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-[#929292]">
          <section className="space-y-2">
            <h3 className="font-medium text-white">1. Create the Google Sheet Database</h3>
            <p>
              Create a new Google Sheet named{' '}
              <span className="font-medium text-white">Nexus Vault Database</span> in your Google
              Drive. Keep its sharing permissions strictly{' '}
              <span className="font-medium text-white">Private (Only me)</span>.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium text-white">2. Add the Google Apps Script Backend</h3>
            <p>
              Inside the spreadsheet, open{' '}
              <span className="font-medium text-white">Extensions &rarr; Apps Script</span>. Replace
              the contents of <code className="font-mono text-xs text-white">Code.gs</code> with the
              entire <code className="font-mono text-xs text-white">apps-script/Code.gs</code> file
              from this repository, then click <span className="font-medium text-white">Save</span>{' '}
              (<code className="font-mono text-xs text-white">Ctrl+S</code> /{' '}
              <code className="font-mono text-xs text-white">Cmd+S</code>) so all functions appear
              in the dropdown.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium text-white">3. Run Initial Setup & Get Your Access Key</h3>
            <p>
              In the Apps Script editor, select{' '}
              <code className="font-mono text-xs text-white">setupNexusVault</code> from the
              function dropdown and click <span className="font-medium text-white">Run</span>. Approve
              the permissions prompt, then copy the generated{' '}
              <code className="font-mono text-xs text-[#35C98A]">VAULT_ACCESS_KEY</code> from the
              Execution Log (or set your own in{' '}
              <span className="font-medium text-white">Project Settings &rarr; Script Properties</span>).
            </p>
            <div className="flex items-center justify-between rounded-lg border border-[#262626] bg-[#1B1B1B] px-3.5 py-2.5">
              <span className="font-mono text-xs text-white">
                Script Property Key: VAULT_ACCESS_KEY
              </span>
              <button
                type="button"
                onClick={() => copyText('prop', 'VAULT_ACCESS_KEY')}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#262626] bg-[#141414] px-2.5 text-xs text-white transition-colors hover:border-[#35C98A]/50"
              >
                {copiedKey === 'prop' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#35C98A]" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium text-white">4. Deploy as Web App</h3>
            <p>
              Click <span className="font-medium text-white">Deploy &rarr; New deployment</span>,
              choose <span className="font-medium text-white">Web app</span>, set{' '}
              <span className="font-medium text-white">Execute as: Me</span> and{' '}
              <span className="font-medium text-white">Who has access: Anyone</span>. Copy the
              resulting <code className="font-mono text-xs text-white">/exec</code> Web App URL and
              paste it into the Nexus Vault connection screen or your{' '}
              <code className="font-mono text-xs text-white">VITE_APPS_SCRIPT_URL</code> environment
              variable.
            </p>
          </section>

          <div className="flex items-center justify-between border-t border-[#262626] pt-4 text-xs">
            <span className="text-[#929292]">
              Full instructions and Cloudflare Pages guide are in <code className="font-mono text-white">README.md</code>
            </span>
            <a
              href="https://script.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[#35C98A] hover:underline"
            >
              Open Apps Script
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="flex justify-end border-t border-[#262626] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-[#35C98A] px-5 text-sm font-medium text-[#090909] transition-colors hover:bg-[#2eb57b]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
