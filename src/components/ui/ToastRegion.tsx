import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface ToastMessage {
  id: string;
  message: string;
  tone?: 'neutral' | 'warning' | 'error';
}

export interface ToastRegionProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastRegion: React.FC<ToastRegionProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="ff-toast-region"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`ff-toast ${
            toast.tone ? `ff-toast--${toast.tone}` : ''
          }`.trim()}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span>{toast.message}</span>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label="Dismiss notification"
            title="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            <X size={14} />
          </Button>
        </div>
      ))}
    </div>
  );
};

