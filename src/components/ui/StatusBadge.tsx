import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  SkipForward,
} from 'lucide-react';
import type { NodeStatus, RunStatus, SaveStatus } from '../../domain/types/workflow';

export type BadgeTone =
  | 'success'
  | 'running'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

export type StatusKind =
  | NodeStatus
  | RunStatus
  | SaveStatus
  | 'warning'
  | 'info';

export interface StatusBadgeProps {
  status: StatusKind;
  label?: string;
  className?: string;
}

const STATUS_CONFIG: Record<
  StatusKind,
  { tone: BadgeTone; defaultLabel: string; icon: React.ReactNode }
> = {
  idle: {
    tone: 'neutral',
    defaultLabel: 'Idle',
    icon: <Clock size={12} aria-hidden="true" />,
  },
  pending: {
    tone: 'neutral',
    defaultLabel: 'Pending',
    icon: <Clock size={12} aria-hidden="true" />,
  },
  starting: {
    tone: 'running',
    defaultLabel: 'Starting',
    icon: <Loader2 size={12} aria-hidden="true" />,
  },
  running: {
    tone: 'running',
    defaultLabel: 'Running',
    icon: <Loader2 size={12} aria-hidden="true" />,
  },
  paused: {
    tone: 'warning',
    defaultLabel: 'Paused',
    icon: <Clock size={12} aria-hidden="true" />,
  },
  success: {
    tone: 'success',
    defaultLabel: 'Success',
    icon: <CheckCircle2 size={12} aria-hidden="true" />,
  },
  failed: {
    tone: 'danger',
    defaultLabel: 'Failed',
    icon: <AlertCircle size={12} aria-hidden="true" />,
  },
  skipped: {
    tone: 'neutral',
    defaultLabel: 'Skipped',
    icon: <SkipForward size={12} aria-hidden="true" />,
  },
  cancelled: {
    tone: 'warning',
    defaultLabel: 'Cancelled',
    icon: <AlertTriangle size={12} aria-hidden="true" />,
  },
  saved: {
    tone: 'success',
    defaultLabel: 'Saved',
    icon: <CheckCircle2 size={12} aria-hidden="true" />,
  },
  unsaved: {
    tone: 'warning',
    defaultLabel: 'Unsaved changes',
    icon: <AlertTriangle size={12} aria-hidden="true" />,
  },
  saving: {
    tone: 'info',
    defaultLabel: 'Saving...',
    icon: <Loader2 size={12} aria-hidden="true" />,
  },
  error: {
    tone: 'danger',
    defaultLabel: 'Error',
    icon: <AlertCircle size={12} aria-hidden="true" />,
  },
  warning: {
    tone: 'warning',
    defaultLabel: 'Warning',
    icon: <AlertTriangle size={12} aria-hidden="true" />,
  },
  info: {
    tone: 'info',
    defaultLabel: 'Info',
    icon: <Info size={12} aria-hidden="true" />,
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className = '',
}) => {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.info;
  const resolvedLabel = label ?? cfg.defaultLabel;

  return (
    <span
      className={`ff-badge ff-badge--${cfg.tone} ${className}`.trim()}
      role="status"
      aria-label={`Status: ${resolvedLabel}`}
    >
      {cfg.icon}
      <span>{resolvedLabel}</span>
    </span>
  );
};

