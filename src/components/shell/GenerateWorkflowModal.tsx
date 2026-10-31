/**
 * FlowForge — Plain-English Workflow Generation Modal (FR-063)
 *
 * Provides a user-driven modal for describing workflows in natural language,
 * previewing deterministic graph proposals, and explicitly confirming before applying.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import {
  DRAFT_PROMPT_SUGGESTIONS,
  draftWorkflowFromPrompt,
  type DraftProposal,
} from '../../features/generator/workflow-drafter';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button } from '../ui';

export const GenerateWorkflowModal: React.FC = () => {
  const open = useWorkspaceStore((s) => s.generateWorkflowModalOpen);
  const setOpen = useWorkspaceStore((s) => s.setGenerateWorkflowModalOpen);
  const applyDraftWorkflow = useWorkspaceStore((s) => s.applyDraftWorkflow);
  const addToast = useWorkspaceStore((s) => s.addToast);

  const [prompt, setPrompt] = useState('');
  const [proposal, setProposal] = useState<DraftProposal | null>(null);
  const [insertMode, setInsertMode] = useState<'replace' | 'insert'>('replace');
  const [isGenerating, setIsGenerating] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setPrompt('');
      setProposal(null);
      setInsertMode('replace');
      const timer = window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

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

  if (!open) return null;

  const handleGenerate = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setIsGenerating(true);
    try {
      const result = draftWorkflowFromPrompt(trimmed);
      setProposal(result);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (!proposal) return;
    applyDraftWorkflow(proposal.workflow, insertMode);
    addToast(
      insertMode === 'replace'
        ? `Applied generated workflow "${proposal.workflow.name}"`
        : `Inserted ${proposal.summary.nodeCount} generated nodes onto canvas`,
      'neutral',
    );
    setOpen(false);
  };

  return (
    <div
      className="ff-modal-overlay"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        className="ff-modal ff-generate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '92vw' }}
      >
        <div className="ff-modal__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.12)',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={16} />
            </div>
            <div>
              <h2
                id="generate-modal-title"
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                Draft Workflow with Plain English
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                }}
              >
                Deterministic, schema-constrained workflow generation without hallucinations
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ff-modal__close-btn"
            aria-label="Close generator modal"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        <div
          className="ff-modal__body"
          style={{
            maxHeight: '70vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            padding: '16px 20px',
          }}
        >
          <div>
            <label
              htmlFor="prompt-input"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Describe what you want to automate
            </label>
            <textarea
              id="prompt-input"
              ref={textareaRef}
              rows={3}
              className="ff-input"
              style={{
                width: '100%',
                resize: 'vertical',
                fontFamily: 'inherit',
                fontSize: '13px',
                lineHeight: 1.45,
                padding: '8px 10px',
                borderRadius: '6px',
              }}
              placeholder="e.g. Check if expense amount exceeds $1,000. If true route for executive approval, otherwise auto-approve."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />
          </div>

          <div>
            <span
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '6px',
              }}
            >
              Suggested Templates
            </span>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
              }}
            >
              {DRAFT_PROMPT_SUGGESTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  style={{
                    background: 'var(--bg-surface-elevated, #23272e)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => {
                    setPrompt(item.prompt);
                    const res = draftWorkflowFromPrompt(item.prompt);
                    setProposal(res);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Wand2 size={13} />}
              disabled={!prompt.trim() || isGenerating}
              onClick={handleGenerate}
            >
              {isGenerating ? 'Compiling Draft...' : 'Compile Workflow Draft'}
            </Button>
          </div>

          {proposal && (
            <div
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                background: 'var(--bg-canvas-subtle, rgba(0, 0, 0, 0.15))',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
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
                  }}
                >
                  <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {proposal.matchedPattern}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: 'var(--text-muted)',
                  }}
                >
                  {proposal.summary.nodeCount} nodes • {proposal.summary.edgeCount} edges
                </span>
              </div>

              <div
                style={{
                  fontSize: '12px',
                  lineHeight: 1.5,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                {proposal.explanation.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '6px',
                    }}
                  >
                    <ArrowRight
                      size={12}
                      style={{
                        marginTop: '3px',
                        flexShrink: 0,
                        color: 'var(--accent-primary)',
                      }}
                    />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '10px',
                  marginTop: '4px',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: '6px',
                  }}
                >
                  Generated Nodes
                </span>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  {proposal.workflow.nodes.map((node) => (
                    <span
                      key={node.id}
                      style={{
                        fontSize: '11px',
                        background: 'var(--bg-surface-elevated, #1e2227)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        color: 'var(--text-primary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span
                        style={{
                          textTransform: 'uppercase',
                          fontSize: '9px',
                          fontWeight: 700,
                          color: 'var(--accent-primary)',
                        }}
                      >
                        {node.type}
                      </span>
                      {node.name}
                    </span>
                  ))}
                </div>
              </div>

              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Application mode:
                </span>
                <label
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="insertMode"
                    value="replace"
                    checked={insertMode === 'replace'}
                    onChange={() => setInsertMode('replace')}
                  />
                  Replace canvas
                </label>
                <label
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="insertMode"
                    value="insert"
                    checked={insertMode === 'insert'}
                    onChange={() => setInsertMode('insert')}
                  />
                  Append to canvas
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="ff-modal__footer">
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!proposal}
            onClick={handleApply}
          >
            Apply to Canvas
          </Button>
        </div>
      </div>
    </div>
  );
};
