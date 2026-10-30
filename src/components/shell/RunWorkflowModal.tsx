import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import type { PrimitiveTypeName } from '../../domain/types/workflow';
import { validateTriggerInput } from '../../engine';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button, StatusBadge } from '../ui';

interface InputValidationState {
  valid: boolean;
  parsedPayload: Record<string, unknown> | null;
  errorTitle?: string;
  errorMessage?: string;
  remediation?: string;
}

function evaluateTriggerJsonInput(
  rawText: string,
  inputSchema: Record<string, PrimitiveTypeName>,
  triggerNodeId?: string,
): InputValidationState {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      valid: false,
      parsedPayload: null,
      errorTitle: 'Invalid JSON syntax',
      errorMessage: 'Trigger input JSON payload is required.',
      remediation: 'Provide a JSON object matching the Trigger input schema.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const syntaxDetail =
      err instanceof Error ? err.message : 'Unexpected JSON token.';
    return {
      valid: false,
      parsedPayload: null,
      errorTitle: 'Invalid JSON syntax',
      errorMessage: `Malformed JSON payload: ${syntaxDetail}`,
      remediation:
        'Check for missing quotes, trailing commas, or unclosed braces.',
    };
  }

  const schemaError = validateTriggerInput(parsed, inputSchema, triggerNodeId);
  if (schemaError) {
    return {
      valid: false,
      parsedPayload: null,
      errorTitle: 'Trigger schema validation failed',
      errorMessage: schemaError.message,
      remediation: schemaError.remediation,
    };
  }

  return {
    valid: true,
    parsedPayload: parsed as Record<string, unknown>,
  };
}

export const RunWorkflowModal: React.FC = () => {
  const open = useWorkspaceStore((s) => s.runInputModalOpen);
  const setOpen = useWorkspaceStore((s) => s.setRunInputModalOpen);
  const workflow = useWorkspaceStore((s) => s.workflow);
  const isExecuting = useWorkspaceStore((s) => s.isExecuting);
  const executeCurrentWorkflow = useWorkspaceStore(
    (s) => s.executeCurrentWorkflow,
  );

  const titleId = useId();
  const textareaId = useId();

  const triggerNode = useMemo(
    () => workflow.nodes.find((n) => n.type === 'trigger') ?? null,
    [workflow.nodes],
  );

  const inputSchema = useMemo<Record<string, PrimitiveTypeName>>(
    () =>
      triggerNode && triggerNode.type === 'trigger'
        ? triggerNode.config.inputSchema
        : {},
    [triggerNode],
  );

  const defaultSampleJson = useMemo(() => {
    const sample =
      triggerNode && triggerNode.type === 'trigger'
        ? (triggerNode.config.sampleInput ?? {})
        : {};
    return JSON.stringify(sample, null, 2);
  }, [triggerNode]);

  const [rawJson, setRawJson] = useState(defaultSampleJson);

  useEffect(() => {
    if (open) {
      setRawJson(defaultSampleJson);
    }
  }, [open, defaultSampleJson]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);

  const validation = useMemo(
    () => evaluateTriggerJsonInput(rawJson, inputSchema, triggerNode?.id),
    [rawJson, inputSchema, triggerNode?.id],
  );

  if (!open) return null;

  const schemaEntries = Object.entries(inputSchema);

  const handleResetToSample = () => {
    setRawJson(defaultSampleJson);
  };

  const handleConfirmRun = () => {
    if (!validation.valid || !validation.parsedPayload || isExecuting) {
      return;
    }
    const payloadToRun = structuredClone(validation.parsedPayload);
    setOpen(false);
    void executeCurrentWorkflow(payloadToRun);
  };

  return (
    <div
      className="ff-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setOpen(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ff-dialog"
        style={{ maxWidth: '580px' }}
      >
        <div className="ff-dialog__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Play size={16} aria-hidden="true" />
            <h2 id={titleId} className="ff-dialog__title">
              Run Workflow: {workflow.name}
            </h2>
          </div>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label="Close run workflow dialog"
            title="Close (Esc)"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </Button>
        </div>

        <p className="ff-dialog__description">
          Provide the JSON trigger input payload for{' '}
          <strong>{triggerNode?.name ?? 'Trigger'}</strong>. The payload is
          validated against the Trigger node&apos;s schema before execution
          starts.
        </p>

        {schemaEntries.length > 0 && (
          <div
            aria-label="Required trigger schema fields"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-compact)',
                color: 'var(--text-muted)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Expected Trigger Input Schema
            </span>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              {schemaEntries.map(([field, fieldType]) => (
                <span
                  key={field}
                  className="ff-mono"
                  style={{
                    fontSize: 'var(--text-compact)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {field}:{' '}
                  <span style={{ color: 'var(--accent-primary)' }}>
                    {fieldType}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="ff-field">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <label htmlFor={textareaId} className="ff-field__label">
              Trigger Input JSON
            </label>
            <Button
              variant="tertiary"
              size="sm"
              leftIcon={<RotateCcw size={12} />}
              onClick={handleResetToSample}
            >
              Reset to Sample Input
            </Button>
          </div>
          <textarea
            id={textareaId}
            aria-label="Trigger input JSON"
            className="ff-field__textarea ff-field__input--mono"
            rows={8}
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleConfirmRun();
              }
            }}
          />
        </div>

        <div
          role={validation.valid ? 'status' : 'alert'}
          aria-live="polite"
          style={{
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-panel)',
            border: `1px solid ${
              validation.valid ? 'var(--border-strong)' : 'var(--danger)'
            }`,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          {validation.valid ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                }}
              >
                <CheckCircle2
                  size={14}
                  aria-hidden="true"
                  style={{ color: 'var(--success)' }}
                />
                <span>Trigger input matches schema</span>
              </div>
              <StatusBadge status="success" label="Ready to run" />
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'var(--danger)',
                  fontWeight: 600,
                }}
              >
                <AlertCircle size={14} aria-hidden="true" />
                <span>{validation.errorTitle}</span>
              </div>
              <div
                style={{
                  color: 'var(--danger)',
                  fontSize: 'var(--text-secondary-size)',
                }}
              >
                {validation.errorMessage}
              </div>
              {validation.remediation && (
                <div
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--text-compact)',
                  }}
                >
                  {validation.remediation}
                </div>
              )}
            </>
          )}
        </div>

        <div className="ff-dialog__footer">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            leftIcon={<Play size={14} />}
            disabled={!validation.valid || isExecuting}
            onClick={handleConfirmRun}
          >
            {isExecuting ? 'Running...' : 'Execute Workflow'}
          </Button>
        </div>
      </div>
    </div>
  );
};
