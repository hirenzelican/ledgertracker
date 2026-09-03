'use client';

import { useToast, type ToastTone } from '@/components/providers/ToastProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { cn } from '@/lib/cn';

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-received/40 bg-received-soft text-ink',
  error: 'border-danger/40 bg-surface text-ink',
  info: 'border-border bg-surface text-ink',
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  const path =
    tone === 'success'
      ? 'M5 13l4 4L19 7'
      : tone === 'error'
        ? 'M12 8v5m0 3.5h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'
        : 'M12 8h.01M11 12h1v4h1';
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('mt-0.5 h-5 w-5 shrink-0', tone === 'error' ? 'text-danger' : 'text-received')}
      fill="none"
      aria-hidden="true"
    >
      <path d={path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Toasts sit just above the bottom navigation: close to the thumb, clear of the balance
 * and the primary actions. They are announced politely rather than interrupting.
 */
export function Toaster() {
  const { toasts, dismissToast } = useToast();
  const { t } = useTranslation();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-3 pb-3"
      role="region"
      aria-label={t('common.notifications')}
    >
      <div aria-live="polite" aria-atomic="false" className="contents">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-md animate-toast-in items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg',
              TONE_STYLES[toast.tone],
            )}
          >
            <ToneIcon tone={toast.tone} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-snug">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-sm text-ink-muted">{toast.description}</p>
              ) : null}
            </div>
            {toast.action ? (
              // Dismissed on the way out, so a second tap cannot fire it twice. Whatever
              // the action does will announce itself in a toast of its own.
              <button
                type="button"
                onClick={() => {
                  dismissToast(toast.id);
                  void toast.action?.onAction();
                }}
                className="-my-1 shrink-0 self-center rounded-full px-3 py-2 text-sm font-bold uppercase tracking-wide text-brand hover:bg-black/5"
              >
                {toast.action.label}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:bg-black/5"
              aria-label={t('common.dismiss')}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
