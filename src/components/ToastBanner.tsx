import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { ToastMessage } from '../types/vault';

interface ToastBannerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastBanner({ toasts, onDismiss }: ToastBannerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 md:bottom-6 md:right-6"
    >
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        return (
          <div
            key={toast.id}
            role="status"
            className={`flex items-start gap-3 rounded-xl border bg-[#141414] px-4 py-3 shadow-[0_14px_32px_rgba(0,0,0,0.55)] transition-all duration-150 ${
              isSuccess ? 'border-[#35C98A]/45' : 'border-red-500/45'
            }`}
          >
            {isSuccess ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#35C98A]" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            )}
            <p className="flex-1 text-sm leading-snug text-white">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[#929292] transition-colors hover:bg-[#1C1C1C] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
