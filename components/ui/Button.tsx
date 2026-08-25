'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:opacity-95 active:opacity-90',
  secondary: 'bg-surface text-ink border border-border hover:bg-surface-sunken',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-sunken',
  danger: 'bg-danger text-white hover:opacity-95',
};

const SIZES: Record<Size, string> = {
  // 44px+ tall: comfortable one-thumb targets on a phone.
  md: 'min-h-[44px] px-4 text-[15px]',
  lg: 'min-h-[54px] px-5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner className="h-4 w-4" />
          <span>{loadingLabel ?? 'Working...'}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
