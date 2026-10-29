import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  shortcutHint?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  shortcutHint,
  action,
  className = '',
}) => {
  return (
    <div className={`ff-empty-state ${className}`.trim()}>
      {icon && (
        <div className="ff-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="ff-empty-state__title">{title}</h3>
      <p className="ff-empty-state__description">{description}</p>
      {shortcutHint && (
        <div className="ff-empty-state__shortcut">{shortcutHint}</div>
      )}
      {action && <div className="ff-empty-state__actions">{action}</div>}
    </div>
  );
};

