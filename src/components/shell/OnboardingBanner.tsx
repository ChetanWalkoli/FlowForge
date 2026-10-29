import React from 'react';
import { Compass, X } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button } from '../ui';

export const OnboardingBanner: React.FC = () => {
  const dismissed = useWorkspaceStore((s) => s.onboardingDismissed);
  const dismissOnboarding = useWorkspaceStore((s) => s.dismissOnboarding);

  if (dismissed) return null;

  return (
    <aside
      aria-label="Workflow quickstart guide"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-4)',
        backgroundColor: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 'var(--text-secondary-size)',
        color: 'var(--text-secondary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          <Compass size={14} aria-hidden="true" />
          <span>Quickstart:</span>
        </span>
        <span>
          <strong>1. Add:</strong> Click or drag nodes from the left library
        </span>
        <span>·</span>
        <span>
          <strong>2. Connect:</strong> Link output handles to input ports
        </span>
        <span>·</span>
        <span>
          <strong>3. Configure:</strong> Select any node to edit its schema in the
          Inspector
        </span>
        <span>·</span>
        <span>
          <strong>4. Run:</strong> Validate and click <strong>Run</strong> to
          inspect execution
        </span>
      </div>

      <Button
        variant="tertiary"
        size="sm"
        iconOnly
        aria-label="Dismiss quickstart hint"
        title="Dismiss quickstart hint"
        onClick={() => {
          void dismissOnboarding();
        }}
      >
        <X size={14} />
      </Button>
    </aside>
  );
};

