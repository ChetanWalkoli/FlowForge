import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  children,
}) => {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="ff-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="ff-dialog"
      >
        <div className="ff-dialog__header">
          <h2 id={titleId} className="ff-dialog__title">
            {title}
          </h2>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label="Close dialog"
            title="Close dialog"
            onClick={onCancel}
          >
            <X size={16} />
          </Button>
        </div>
        <p id={descId} className="ff-dialog__description">
          {description}
        </p>
        {children}
        <div className="ff-dialog__footer">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

