import React, { useEffect, useId, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Upload,
  X,
} from 'lucide-react';
import {
  validateAndPreviewImport,
  type WorkflowImportPreview,
} from '../../persistence/import-export';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button, StatusBadge } from '../ui';

export const ImportWorkflowModal: React.FC = () => {
  const open = useWorkspaceStore((s) => s.importModalOpen);
  const setOpen = useWorkspaceStore((s) => s.setImportModalOpen);
  const commitImportedWorkflow = useWorkspaceStore(
    (s) => s.commitImportedWorkflow,
  );
  const addToast = useWorkspaceStore((s) => s.addToast);

  const [rawJson, setRawJson] = useState('');
  const [preview, setPreview] = useState<WorkflowImportPreview | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setRawJson('');
      setPreview(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  const handleJsonChange = (nextText: string) => {
    setRawJson(nextText);
    if (!nextText.trim()) {
      setPreview(null);
      return;
    }
    setPreview(validateAndPreviewImport(nextText));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      handleJsonChange(text);
    } catch {
      setPreview({
        valid: false,
        canCommit: false,
        schemaErrors: ['Unable to read selected JSON file.'],
      });
    }
  };

  const handleConfirmImport = async () => {
    if (!preview?.canCommit || !preview.document) return;
    try {
      const saved = await commitImportedWorkflow(preview.document);
      addToast(
        `Imported workflow "${saved.name}" into local library.`,
        'neutral',
      );
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Failed to commit imported workflow',
        'error',
      );
    }
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
            <FileUp size={16} aria-hidden="true" />
            <h2 id={titleId} className="ff-dialog__title">
              Import Workflow JSON
            </h2>
          </div>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label="Close import dialog"
            title="Close"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </Button>
        </div>

        <p className="ff-dialog__description">
          Upload or paste a versioned <code>flowforge.workflow</code> JSON
          document. Imports are validated and previewed before being added to
          your local workspace and are never executed automatically.
        </p>

        <div className="ff-field">
          <label
            htmlFor="ff-import-file-input"
            className="ff-field__label"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <Upload size={13} aria-hidden="true" />
            <span>Choose JSON file</span>
          </label>
          <input
            id="ff-import-file-input"
            type="file"
            accept=".json,application/json"
            aria-label="Choose workflow JSON file"
            onChange={handleFileUpload}
            style={{ fontSize: 'var(--text-secondary-size)' }}
          />
        </div>

        <div className="ff-field">
          <label htmlFor="ff-import-json-textarea" className="ff-field__label">
            Workflow JSON Payload
          </label>
          <textarea
            id="ff-import-json-textarea"
            aria-label="Workflow JSON payload"
            placeholder='{"format": "flowforge.workflow", "formatVersion": 1, ...}'
            className="ff-field__textarea ff-field__input--mono"
            rows={7}
            value={rawJson}
            onChange={(e) => handleJsonChange(e.target.value)}
          />
        </div>

        {preview && (
          <div
            role="region"
            aria-label="Import validation preview"
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-panel)',
              border: `1px solid ${
                preview.canCommit ? 'var(--border-strong)' : 'var(--danger)'
              }`,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {!preview.canCommit ? (
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
                  <span>Import rejected by schema or graph validation</span>
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: '18px',
                    color: 'var(--danger)',
                    fontSize: 'var(--text-secondary-size)',
                  }}
                >
                  {preview.schemaErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </>
            ) : (
              preview.summary && (
                <>
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
                      <span>Preview: {preview.summary.name}</span>
                    </div>
                    <StatusBadge
                      status={
                        preview.summary.errorsCount === 0
                          ? 'success'
                          : 'warning'
                      }
                      label={
                        preview.summary.errorsCount === 0
                          ? 'Valid schema'
                          : `${preview.summary.errorsCount} graph issue(s)`
                      }
                    />
                  </div>
                  {preview.summary.description && (
                    <div
                      style={{
                        fontSize: 'var(--text-secondary-size)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {preview.summary.description}
                    </div>
                  )}
                  <div
                    className="ff-mono"
                    style={{
                      display: 'flex',
                      gap: 'var(--space-3)',
                      fontSize: 'var(--text-compact)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span>Format v{preview.summary.formatVersion}</span>
                    <span>Revision {preview.summary.revision}</span>
                    <span>Nodes: {preview.summary.nodesCount}</span>
                    <span>Edges: {preview.summary.edgesCount}</span>
                  </div>
                </>
              )
            )}
          </div>
        )}

        <div className="ff-dialog__footer">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!preview?.canCommit}
            onClick={handleConfirmImport}
          >
            Confirm Import
          </Button>
        </div>
      </div>
    </div>
  );
};

