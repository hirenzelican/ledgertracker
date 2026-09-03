'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

/**
 * One thing the toast offers to do about what it just told you. Undo is the only user of
 * it so far, and the reason the slot exists: the moment right after a save is the only
 * moment you still know what you meant to type.
 */
export interface ToastAction {
  label: string;
  onAction: () => void | Promise<void>;
}

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  toasts: Toast[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4200;

/**
 * A toast you are meant to *act* on has to outlast one you only read. 4.2 seconds is
 * enough to register "saved"; it is not enough to notice a wrong figure, decide, and
 * reach the button.
 */
const ACTIONABLE_DURATION_MS = 8000;
let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextToastId++;
      // At most two at once: a third would cover more of the screen than it informs.
      setToasts((current) => [...current.slice(-1), { ...toast, id }]);
      setTimeout(
        () => dismissToast(id),
        toast.action ? ACTIONABLE_DURATION_MS : TOAST_DURATION_MS,
      );
    },
    [dismissToast],
  );

  const value = useMemo(
    () => ({ showToast, dismissToast, toasts }),
    [showToast, dismissToast, toasts],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
