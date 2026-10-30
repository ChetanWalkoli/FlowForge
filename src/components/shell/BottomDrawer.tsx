import React, { useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Terminal,
} from 'lucide-react';
import type {
  ExecutionEvent,
  NodeStatus,
  WorkflowRunRecord,
} from '../../domain/types/workflow';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button, EmptyState, PayloadViewer, StatusBadge } from '../ui';

interface FormattedLogItem {
  id: string;
  level: 'info' | 'warning' | 'error';
  source: string;
  message: string;
  timestamp: number;
}

function buildRunLogs(activeRun: WorkflowRunRecord): FormattedLogItem[] {
  const logs: FormattedLogItem[] = [];

  activeRun.events.forEach((event, idx) => {
    switch (event.type) {
      case 'run.started':
        logs.push({
          id: `log_${idx}_run_started`,
          level: 'info',
          source: 'runtime',
          message: `Workflow run ${activeRun.runId} started`,
          timestamp: event.timestamp,
        });
        break;
      case 'node.started':
        logs.push({
          id: `log_${idx}_node_started`,
          level: 'info',
          source: event.nodeId,
          message: `Started ${event.nodeName} (${event.nodeType})`,
          timestamp: event.timestamp,
        });
        break;
      case 'branch.selected':
        logs.push({
          id: `log_${idx}_branch`,
          level: 'info',
          source: event.nodeId,
          message: `Branch "${event.handleId}" selected: ${event.reason.explanation}`,
          timestamp: event.timestamp,
        });
        break;
      case 'node.completed': {
        const out = event.output;
        if (out && typeof out === 'object' && !Array.isArray(out)) {
          if ('logEntry' in out) {
            const entry = (
              out as { logEntry?: { level?: string; message?: string } }
            ).logEntry;
            if (entry && typeof entry.message === 'string') {
              logs.push({
                id: `log_${idx}_action_entry`,
                level:
                  entry.level === 'error'
                    ? 'error'
                    : entry.level === 'warn' || entry.level === 'warning'
                      ? 'warning'
                      : 'info',
                source: event.nodeId,
                message: `[appendLog] ${entry.message}`,
                timestamp: event.timestamp,
              });
            }
          }
        }
        logs.push({
          id: `log_${idx}_node_completed`,
          level: 'info',
          source: event.nodeId,
          message: `Completed ${event.nodeName} in ${event.durationMs}ms`,
          timestamp: event.timestamp,
        });
        break;
      }
      case 'node.skipped':
        logs.push({
          id: `log_${idx}_node_skipped`,
          level: 'warning',
          source: event.nodeId,
          message: `Skipped ${event.nodeName}: ${event.reason}`,
          timestamp: event.timestamp,
        });
        break;
      case 'node.failed':
        logs.push({
          id: `log_${idx}_node_failed`,
          level: 'error',
          source: event.nodeId,
          message: `Node failed [${event.error.code}]: ${event.error.message}`,
          timestamp: event.timestamp,
        });
        break;
      case 'run.completed':
        logs.push({
          id: `log_${idx}_run_completed`,
          level: 'info',
          source: 'runtime',
          message: `Workflow run ${activeRun.runId} completed in ${event.durationMs}ms`,
          timestamp: event.timestamp,
        });
        break;
      case 'run.failed':
        logs.push({
          id: `log_${idx}_run_failed`,
          level: 'error',
          source: 'runtime',
          message: `Workflow run ${activeRun.runId} failed [${event.error.code}]: ${event.error.message}`,
          timestamp: event.timestamp,
        });
        break;
      case 'run.cancelled':
        logs.push({
          id: `log_${idx}_run_cancelled`,
          level: 'warning',
          source: 'runtime',
          message: `Workflow run ${activeRun.runId} cancelled`,
          timestamp: event.timestamp,
        });
        break;
    }
  });

  return logs;
}

function getEventBadgeStatus(event: ExecutionEvent): NodeStatus | 'warning' {
  switch (event.type) {
    case 'run.completed':
    case 'node.completed':
      return 'success';
    case 'branch.selected':
      return event.reason.result ? 'success' : 'warning';
    case 'node.skipped':
    case 'run.cancelled':
      return 'skipped';
    case 'node.failed':
    case 'run.failed':
      return 'failed';
    case 'run.started':
    case 'node.started':
    default:
      return 'running';
  }
}

function getEventNodeId(event: ExecutionEvent): string | undefined {
  if ('nodeId' in event) {
    return event.nodeId;
  }
  return undefined;
}

function getEventNodeName(event: ExecutionEvent): string | undefined {
  if ('nodeName' in event) {
    return event.nodeName;
  }
  return undefined;
}

export const BottomDrawer: React.FC = () => {
  const open = useWorkspaceStore((s) => s.bottomDrawerOpen);
  const activeTab = useWorkspaceStore((s) => s.bottomDrawerTab);
  const validationReport = useWorkspaceStore((s) => s.validationReport);
  const activeRun = useWorkspaceStore((s) => s.activeRun);
  const selectedTraceEventIndex = useWorkspaceStore(
    (s) => s.selectedTraceEventIndex,
  );

  const toggleBottomDrawer = useWorkspaceStore((s) => s.toggleBottomDrawer);
  const setBottomDrawerTab = useWorkspaceStore((s) => s.setBottomDrawerTab);
  const focusValidationIssue = useWorkspaceStore((s) => s.focusValidationIssue);
  const selectNode = useWorkspaceStore((s) => s.selectNode);
  const setSelectedTraceEventIndex = useWorkspaceStore(
    (s) => s.setSelectedTraceEventIndex,
  );

  const runLogs = useMemo(
    () => (activeRun ? buildRunLogs(activeRun) : []),
    [activeRun],
  );

  const resolvedTraceIndex = useMemo(() => {
    if (!activeRun || activeRun.events.length === 0) return null;
    if (
      selectedTraceEventIndex !== null &&
      selectedTraceEventIndex >= 0 &&
      selectedTraceEventIndex < activeRun.events.length
    ) {
      return selectedTraceEventIndex;
    }
    return activeRun.events.length - 1;
  }, [activeRun, selectedTraceEventIndex]);

  const selectedEvent =
    activeRun && resolvedTraceIndex !== null
      ? (activeRun.events[resolvedTraceIndex] ?? null)
      : null;

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
            {activeRun && (
              <span className="ff-tabular">({activeRun.events.length})</span>
            )}
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
              {activeRun?.status === 'failed' && activeRun.error && (
                <div
                  role="alert"
                  aria-label="Runtime execution error"
                  style={{
                    marginBottom: 'var(--space-2)',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--danger-subtle)',
                    border: '1px solid var(--danger)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div>
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
                      <span>
                        Runtime Error [{activeRun.error.code}]:{' '}
                        {activeRun.error.message}
                      </span>
                    </div>
                    {activeRun.error.remediation && (
                      <div
                        style={{
                          fontSize: 'var(--text-secondary-size)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {activeRun.error.remediation}
                      </div>
                    )}
                  </div>
                  {activeRun.error.nodeId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => selectNode(activeRun.error?.nodeId ?? null)}
                    >
                      Focus Node ({activeRun.error.nodeId})
                    </Button>
                  )}
                </div>
              )}

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
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <StatusBadge status={activeRun.status} />
                      <span className="ff-mono">{activeRun.runId}</span>
                    </div>
                    <span
                      className="ff-mono ff-tabular"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {activeRun.durationMs !== undefined
                        ? `Duration: ${activeRun.durationMs}ms`
                        : 'Running...'}
                    </span>
                  </div>

                  {activeRun.status === 'failed' && activeRun.error && (
                    <div
                      role="alert"
                      style={{
                        padding: 'var(--space-2) var(--space-3)',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--danger-subtle)',
                        border: '1px solid var(--danger)',
                        color: 'var(--danger)',
                        fontSize: 'var(--text-secondary-size)',
                      }}
                    >
                      <strong>[{activeRun.error.code}]</strong>{' '}
                      {activeRun.error.message}
                      {activeRun.error.remediation && (
                        <div style={{ color: 'var(--text-secondary)' }}>
                          {activeRun.error.remediation}
                        </div>
                      )}
                    </div>
                  )}

                  <PayloadViewer
                    title={`Run ${activeRun.runId} Output`}
                    payload={activeRun.finalOutput ?? null}
                  />

                  <div
                    aria-label="Execution logs"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-1)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--text-compact)',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Execution Logs ({runLogs.length})
                    </span>
                    <ul
                      className="ff-issue-list"
                      aria-label="Execution log entries"
                    >
                      {runLogs.map((log) => (
                        <li
                          key={log.id}
                          className="ff-issue-list__item ff-mono"
                          style={{
                            cursor: 'default',
                            fontSize: 'var(--text-compact)',
                          }}
                        >
                          <span
                            style={{
                              color:
                                log.level === 'error'
                                  ? 'var(--danger)'
                                  : log.level === 'warning'
                                    ? 'var(--warning)'
                                    : 'var(--text-primary)',
                            }}
                          >
                            [{log.source}] {log.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
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
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(260px, 1fr) minmax(280px, 1.2fr)',
                    gap: 'var(--space-3)',
                    alignItems: 'start',
                  }}
                >
                  <div
                    role="list"
                    aria-label="Chronological execution event timeline"
                    className="ff-issue-list"
                  >
                    {activeRun.events.map((event, idx) => {
                      const isSelected = idx === resolvedTraceIndex;
                      const nodeName = getEventNodeName(event);
                      const nodeId = getEventNodeId(event);
                      return (
                        <button
                          key={`evt_${idx}_${event.type}_${event.timestamp}`}
                          type="button"
                          role="listitem"
                          aria-label={`Trace event ${idx + 1}: ${event.type}${
                            nodeName ? ` (${nodeName})` : ''
                          }`}
                          aria-current={isSelected ? 'step' : undefined}
                          className="ff-issue-list__item"
                          style={{
                            borderColor: isSelected
                              ? 'var(--accent)'
                              : undefined,
                            backgroundColor: isSelected
                              ? 'var(--bg-active)'
                              : undefined,
                          }}
                          onClick={() => {
                            setSelectedTraceEventIndex(idx);
                            if (nodeId) {
                              selectNode(nodeId);
                            }
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <span
                              className="ff-mono ff-tabular"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              #{idx + 1}
                            </span>
                            <StatusBadge
                              status={getEventBadgeStatus(event)}
                              label={event.type}
                            />
                            {nodeName && <strong>{nodeName}</strong>}
                          </div>
                          <span
                            className="ff-mono"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {event.type === 'branch.selected'
                              ? `→ ${event.handleId}`
                              : 'durationMs' in event
                                ? `${event.durationMs}ms`
                                : nodeId ?? ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedEvent && (
                    <div
                      aria-label="Selected trace event details"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                        padding: 'var(--space-2) var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <strong className="ff-mono">
                          Event #{(resolvedTraceIndex ?? 0) + 1}:{' '}
                          {selectedEvent.type}
                        </strong>
                        <StatusBadge
                          status={getEventBadgeStatus(selectedEvent)}
                          label={selectedEvent.type}
                        />
                      </div>

                      {getEventNodeId(selectedEvent) && (
                        <div
                          className="ff-mono"
                          style={{
                            fontSize: 'var(--text-compact)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          Node:{' '}
                          {getEventNodeName(selectedEvent) ??
                            getEventNodeId(selectedEvent)}{' '}
                          ({getEventNodeId(selectedEvent)})
                        </div>
                      )}

                      {selectedEvent.type === 'branch.selected' && (
                        <div
                          style={{
                            fontSize: 'var(--text-secondary-size)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <div>
                            <strong>Selected Branch:</strong>{' '}
                            <code>{selectedEvent.handleId}</code>
                          </div>
                          <div>
                            <strong>Explanation:</strong>{' '}
                            {selectedEvent.reason.explanation}
                          </div>
                        </div>
                      )}

                      {('error' in selectedEvent && selectedEvent.error) && (
                        <div
                          style={{
                            color: 'var(--danger)',
                            fontSize: 'var(--text-secondary-size)',
                          }}
                        >
                          <strong>[{selectedEvent.error.code}]</strong>{' '}
                          {selectedEvent.error.message}
                        </div>
                      )}

                      <PayloadViewer
                        title="Selected Event Snapshot"
                        payload={selectedEvent}
                      />
                    </div>
                  )}
                </div>
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
