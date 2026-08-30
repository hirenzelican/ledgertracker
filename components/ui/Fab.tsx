'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface FabProps {
  onClick: () => void;
  label: string;
  children?: ReactNode;
  className?: string;
}

/**
 * A floating action button, bottom right. It clears the fixed navigation bar and the
 * gesture area beneath it, so it never sits on top of a tab or under the home indicator.
 */
export function Fab({ onClick, label, children, className }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full',
        'bg-brand text-brand-ink shadow-lg transition active:scale-95',
        className,
      )}
      style={{ bottom: 'calc(58px + env(safe-area-inset-bottom) + 1rem)' }}
    >
      {children ?? (
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
