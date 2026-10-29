import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Terminal,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button, EmptyState, PayloadViewer, StatusBadge } from '../ui';

export const BottomDrawer: React.FC = () => {
  const open = useWorkspaceStore((s) => s.bottomDrawerOpen);
  const activeTab = useWorkspaceStore((s) => s.bottomDrawerTab);
  const validationReport = useWorkspaceStore((s) => s.validationReport);
  const activeRun = useWorkspaceStore((s) => s.activeRun);

  const toggleBottomDrawer = useWorkspaceStore((s) => s.toggleBottomDrawer);
  const setBottomDrawerTab = useWorkspaceStore((s) => s.setBottomDrawerTab);
  const focusValidationIssue = useWorkspaceStore((s) => s.focusValidationIssue);

  return (
    <section
      className={`ff-bottom-drawer ${
        open ? 'ff-bottom-drawer--open' : 'ff-bottom-drawer--closed'
      }`.trim()}
      aria-label="Execution and validation drawer"
    >
      <div className="ff-bottom-drawer__bar">
        <div
          className="ff-bottom-drawer__tabs"
          role="tablist"
          aria-label="Bottom drawer tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={open && activeTab === 'validation'}
            className={`ff-bottom-drawer__tab ${
              open && activeTab === 'validation'
                ? 'ff-bottom-drawer__tab--active'
                : ''
            }`.trim()}
            onClick={() => setBottomDrawerTab('validation')}
          >
            <AlertTriangle size={13} aria-hidden="true" />
            <span>Validation</span>
            <span className="ff-tabular">
              ({validationReport.issues.length})
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={open && activeTab === 'output'}
            className={`ff-bottom-drawer__tab ${
              open && activeTab === 'output'
                ? 'ff-bottom-drawer__tab--active'
                : ''
            }`.trim()}
            onClick={() => setBottomDrawerTab('output')}
          >
            <Terminal size={13} aria-hidden="true" />
            <span>Output & Logs</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={open && activeTab === 'timeline'}
            className={`ff-bottom-drawer__tab ${
              open && activeTab === 'timeline'
                ? 'ff-bottom-drawer__tab--active'
                : ''
            }`.trim()}
            onClick={() => setBottomDrawerTab('timeline')}
          >
            <Activity size={13} aria-hidden="true" />
            <span>TraceLab Timeline</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={open && activeTab === 'tests'}
            className={`ff-bottom-drawer__tab ${
              open && activeTab === 'tests'
                ? 'ff-bottom-drawer__tab--active'
                : ''
            }`.trim()}
            onClick={() => setBottomDrawerTab('tests')}
          >
            <FlaskConical size={13} aria-hidden="true" />
            <span>Testing Lab</span>
          </button>
        </div>

        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          aria-label={open ? 'Collapse bottom drawer' : 'Expand bottom drawer'}
          title={open ? 'Collapse bottom drawer' : 'Expand bottom drawer'}
          onClick={toggleBottomDrawer}
        >
          {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </Button>
      </div>

      {open && (
        <div className="ff-bottom-drawer__content" role="tabpanel">
          {activeTab === 'validation' && (
            <>
              {validationReport.issues.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 size={18} />}
                  title="Workflow is valid"
                  description="No structural, port compatibility, or configuration issues detected."
                />
              ) : (
                <ul className="ff-issue-list" aria-label="Validation issue list">
                  {validationReport.issues.map((issue) => (
                    <li key={issue.id}>
                      <button
                        type="button"
                        className="ff-issue-list__item"
                        aria-label={`Focus issue: ${issue.message}`}
                        onClick={() => focusValidationIssue(issue.id)}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <StatusBadge
                              status={
                                issue.severity === 'error' ? 'failed' : 'warning'
                              }
                              label={
                                issue.severity === 'error' ? 'Error' : 'Warning'
                              }
                            />
                            <strong>{issue.message}</strong>
                          </div>
                          <span
                            style={{
                              fontSize: 'var(--text-secondary-size)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {issue.remediation}
                          </span>
                        </div>
                        {issue.nodeId && (
                          <span
                            className="ff-mono"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Node: {issue.nodeId}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {activeTab === 'output' && (
            <>
              {!activeRun ? (
                <EmptyState
                  title="No execution output yet"
                  description="Run the workflow to view structured output payloads and node execution logs."
                />
              ) : (
                <PayloadViewer
                  title={`Run ${activeRun.runId} Output`}
                  payload={activeRun.finalOutput}
                />
              )}
            </>
          )}

          {activeTab === 'timeline' && (
            <>
              {!activeRun ? (
                <EmptyState
                  title="No recorded trace events"
                  description="TraceLab records per-node timing, branch evaluations, and input/output snapshots when a workflow executes."
                />
              ) : (
                <PayloadViewer
                  title="Execution Events"
                  payload={activeRun.events}
                />
              )}
            </>
          )}

          {activeTab === 'tests' && (
            <EmptyState
              title="Testing Lab"
              description="Define input test cases, expected outputs, and branch coverage assertions for this workflow."
            />
          )}
        </div>
      )}
    </section>
  );
};

