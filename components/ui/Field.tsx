'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}

/** Wires a label, hint and error message to a control for screen readers. */
export function Field({ label, error, hint, children }: FieldShellProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={inputId} className="field-label">
        {label}
      </label>
      {children({ inputId, describedBy })}
      {hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-ink-faint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, className, ...rest }: TextFieldProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      {({ inputId, describedBy }) => (
        <input
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn('field-input', error && 'border-danger', className)}
          {...rest}
        />
      )}
    </Field>
  );
}

interface AmountFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  autoFocus?: boolean;
  label?: string;
}

/**
 * The amount input. `inputMode="decimal"` brings up the numeric keypad on Android
 * without the spinner quirks of `type="number"`, and keystrokes are filtered so the
 * field can only ever hold a well-formed rupee amount.
 */
export function AmountField({
  value,
  onChange,
  error,
  hint,
  autoFocus,
  label = 'Amount',
}: AmountFieldProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      {({ inputId, describedBy }) => (
        <div
          className={cn(
            'flex items-center rounded-2xl border bg-surface px-4 focus-within:border-brand',
            error ? 'border-danger' : 'border-border',
          )}
        >
          <span aria-hidden="true" className="pr-2 text-2xl font-semibold text-ink-faint">
            ₹
          </span>
          <input
            id={inputId}
            value={value}
            onChange={(event) => {
              const next = event.target.value.replace(/[^\d.]/g, '');
              // At most one decimal point, at most two decimal places.
              if (/^\d*(?:\.\d{0,2})?$/.test(next)) onChange(next);
            }}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            autoFocus={autoFocus}
            placeholder="0"
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className="tnum w-full bg-transparent py-4 text-3xl font-bold text-ink outline-none placeholder:text-ink-faint/60"
          />
        </div>
      )}
    </Field>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
  columns?: 2 | 3;
  error?: string;
}

/** Large tap targets rendered as a radio group so keyboard and screen readers work. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
  columns = 2,
  error,
}: ChoiceGroupProps<T>) {
  return (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div className={cn('grid gap-2', columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <label
              key={choice.value}
              className={cn(
                'flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-center text-[15px] font-medium transition',
                selected
                  ? 'border-brand bg-brand-soft text-ink ring-1 ring-brand'
                  : 'border-border bg-surface text-ink-muted hover:bg-surface-sunken',
              )}
            >
              <input
                type="radio"
                name={label}
                value={choice.value}
                checked={selected}
                onChange={() => onChange(choice.value)}
                className="sr-only"
              />
              {choice.icon}
              <span>{choice.label}</span>
              {selected ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </label>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
