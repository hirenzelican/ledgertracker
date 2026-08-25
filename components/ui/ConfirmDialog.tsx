'use client';

import { Sheet } from './Sheet';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Sheet open={open} title={title} onClose={onCancel} dismissible={!busy}>
      <p className="text-[15px] leading-relaxed text-ink-muted">{message}</p>
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          size="lg"
          className="flex-1"
          onClick={onConfirm}
          loading={busy}
          loadingLabel="Working..."
        >
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
