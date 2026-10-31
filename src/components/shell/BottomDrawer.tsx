import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  GitCompare,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Square,
  StepBack,
  StepForward,
  Terminal,
  Trash2,
} from 'lucide-react';
import type {
  ExecutionEvent,
  NodeStatus,
  WorkflowRunRecord,
} from '../../domain/types/workflow';
import {
  calculateConditionBranchCoverage,
  type WorkflowTestAssertion,
} from '../../features/testing-lab/testing-lab';
import { compareWorkflowRuns } from '../../features/trace-lab/trace-replay';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button, EmptyState, Input, PayloadViewer, StatusBadge } from '../ui';

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
      case 'run.paused':
        logs.push({
          id: `log_${idx}_run_paused`,
          level: 'warning',
          source: 'runtime',
          message: `Workflow run paused${event.pausedAtNodeId ? ` before node "${event.pausedAtNodeId}"` : ''}`,
          timestamp: event.timestamp,
        });
        break;
      case 'run.resumed':
        logs.push({
          id: `log_${idx}_run_resumed`,
          level: 'info',
          source: 'runtime',
          message: `Workflow run resumed${event.resumedAtNodeId ? ` at node "${event.resumedAtNodeId}"` : ''}`,
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
  const workflow = useWorkspaceStore((s) => s.workflow);
  const validationReport = useWorkspaceStore((s) => s.validationReport);
  const activeRun = useWorkspaceStore((s) => s.activeRun);
  const runHistory = useWorkspaceStore((s) => s.runHistory);
  const selectedTraceEventIndex = useWorkspaceStore(
    (s) => s.selectedTraceEventIndex,
  );
  const comparisonRunId = useWorkspaceStore((s) => s.comparisonRunId);
  const testCases = useWorkspaceStore((s) => s.testCases);
  const testSuiteReport = useWorkspaceStore((s) => s.testSuiteReport);
  const isRunningTests = useWorkspaceStore((s) => s.isRunningTests);
  const isExecuting = useWorkspaceStore((s) => s.isExecuting);
  const cancelActiveRun = useWorkspaceStore((s) => s.cancelActiveRun);
  const pauseActiveRun = useWorkspaceStore((s) => s.pauseActiveRun);
  const resumeActiveRun = useWorkspaceStore((s) => s.resumeActiveRun);

  const toggleBottomDrawer = useWorkspaceStore((s) => s.toggleBottomDrawer);
  const setBottomDrawerTab = useWorkspaceStore((s) => s.setBottomDrawerTab);
  const focusValidationIssue = useWorkspaceStore((s) => s.focusValidationIssue);
  const selectNode = useWorkspaceStore((s) => s.selectNode);
  const setActiveRun = useWorkspaceStore((s) => s.setActiveRun);
  const setSelectedTraceEventIndex = useWorkspaceStore(
    (s) => s.setSelectedTraceEventIndex,
  );
  const stepTraceReplay = useWorkspaceStore((s) => s.stepTraceReplay);
  const setComparisonRunId = useWorkspaceStore((s) => s.setComparisonRunId);
  const addTestCase = useWorkspaceStore((s) => s.addTestCase);
  const deleteTestCase = useWorkspaceStore((s) => s.deleteTestCase);
  const resetDefaultTestCases = useWorkspaceStore(
    (s) => s.resetDefaultTestCases,
  );
  const runSingleTest = useWorkspaceStore((s) => s.runSingleTest);
  const runTestSuite = useWorkspaceStore((s) => s.runTestSuite);

  // Local state for adding a custom test case in Testing Lab
  const [showNewTestForm, setShowNewTestForm] = useState(false);
  const [newTestName, setNewTestName] = useState('');
  const [newTestInputJson, setNewTestInputJson] = useState('{\n  "amount": 1500,\n  "requester": "Sam",\n  "department": "Engineering"\n}');
  const [newTestExpectedStatus, setNewTestExpectedStatus] = useState<'success' | 'failed'>('success');
  const [newTestConditionNodeId, setNewTestConditionNodeId] = useState('');
  const [newTestExpectedBranch, setNewTestExpectedBranch] = useState<'true' | 'false'>('true');
  const [newTestOutputPath, setNewTestOutputPath] = useState('');
  const [newTestOutputExpectedValue, setNewTestOutputExpectedValue] = useState('');
  const [newTestInputError, setNewTestInputError] = useState<string | null>(null);

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

  const isReplayStepping = Boolean(
    activeRun &&
      selectedTraceEventIndex !== null &&
      selectedTraceEventIndex < activeRun.events.length - 1,
  );

  const comparisonReport = useMemo(() => {
    if (!activeRun || !comparisonRunId) return null;
    const baseRun = runHistory.find((r) => r.runId === comparisonRunId);
    if (!baseRun || baseRun.runId === activeRun.runId) return null;
    return compareWorkflowRuns(baseRun, activeRun, workflow.nodes);
  }, [activeRun, comparisonRunId, runHistory, workflow.nodes]);

  const liveCoverageSummary = useMemo(() => {
    if (testSuiteReport) return testSuiteReport.coverage;
    const runs = activeRun ? [activeRun, ...runHistory] : runHistory;
    return calculateConditionBranchCoverage(workflow, runs);
  }, [activeRun, runHistory, testSuiteReport, workflow]);

  const conditionNodes = useMemo(
    () => workflow.nodes.filter((n) => n.type === 'condition'),
    [workflow.nodes],
  );

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
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                  }}
                >
                  {/* TraceLab Step Replay & Run Comparison Toolbar */}
                  <div
                    role="toolbar"
                    aria-label="TraceLab replay and comparison controls"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--space-2)',
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
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label="Replay first step"
                        leftIcon={<SkipBack size={12} />}
                        onClick={() => stepTraceReplay('first')}
                      >
                        First
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label="Replay previous step"
                        leftIcon={<StepBack size={12} />}
                        onClick={() => stepTraceReplay('prev')}
                      >
                        Prev Step
                      </Button>
                      <span
                        className="ff-mono ff-tabular"
                        aria-label="Current replay step"
                        style={{
                          fontSize: 'var(--text-compact)',
                          color: 'var(--text-secondary)',
                          padding: '0 6px',
                        }}
                      >
                        Step {(resolvedTraceIndex ?? 0) + 1} of{' '}
                        {activeRun.events.length}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label="Replay next step"
                        leftIcon={<StepForward size={12} />}
                        onClick={() => stepTraceReplay('next')}
                      >
                        Next Step
                      </Button>
                      <Button
                        variant={isReplayStepping ? 'primary' : 'tertiary'}
                        size="sm"
                        aria-label="Exit replay and show full run"
                        leftIcon={<SkipForward size={12} />}
                        onClick={() => stepTraceReplay('last')}
                      >
                        Full Run
                      </Button>
                      {isReplayStepping && (
                        <StatusBadge
                          status="running"
                          label={`Replay @ Step ${(resolvedTraceIndex ?? 0) + 1}`}
                        />
                      )}
                    </div>

                    {isExecuting && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                        }}
                      >
                        {activeRun?.status === 'paused' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Play size={12} />}
                            aria-label="Resume execution"
                            onClick={resumeActiveRun}
                          >
                            Resume
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Pause size={12} />}
                            aria-label="Pause execution"
                            onClick={pauseActiveRun}
                          >
                            Pause
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          leftIcon={<Square size={12} />}
                          aria-label="Cancel execution"
                          onClick={cancelActiveRun}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}

                    {runHistory.filter((r) => r.runId !== activeRun.runId)
                      .length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                        }}
                      >
                        <GitCompare size={13} aria-hidden="true" />
                        <label
                          htmlFor="ff-compare-run-select"
                          style={{
                            fontSize: 'var(--text-compact)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          Compare with:
                        </label>
                        <select
                          id="ff-compare-run-select"
                          aria-label="Compare active run with previous run"
                          className="ff-field__select"
                          style={{ minHeight: '28px', padding: '2px 8px' }}
                          value={comparisonRunId ?? ''}
                          onChange={(e) =>
                            setComparisonRunId(e.target.value || null)
                          }
                        >
                          <option value="">None</option>
                          {runHistory
                            .filter((r) => r.runId !== activeRun.runId)
                            .map((r) => (
                              <option key={r.runId} value={r.runId}>
                                {r.runId} ({r.status} · {r.durationMs ?? 0}ms)
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Run Comparison Report Panel */}
                  {comparisonReport && (
                    <div
                      aria-label="Run comparison report"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                        padding: 'var(--space-2) var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-strong)',
                        fontSize: 'var(--text-secondary-size)',
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
                          Run Comparison: {comparisonReport.baseRunId} vs{' '}
                          {comparisonReport.targetRunId}
                        </strong>
                        <span
                          className="ff-mono"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Status: {comparisonReport.baseStatus} →{' '}
                          {comparisonReport.targetStatus} · Duration Δ:{' '}
                          {comparisonReport.durationDeltaMs !== null
                            ? comparisonReport.durationDeltaMs >= 0
                              ? `+${comparisonReport.durationDeltaMs}ms`
                              : `${comparisonReport.durationDeltaMs}ms`
                            : '—'}
                        </span>
                      </div>

                      {comparisonReport.branchDifferences.some(
                        (b) => b.changed,
                      ) && (
                        <div className="ff-mono">
                          <strong>Branch Changes: </strong>
                          {comparisonReport.branchDifferences
                            .filter((b) => b.changed)
                            .map(
                              (b) =>
                                `${b.nodeName} (${b.baseBranch ?? 'none'} → ${b.targetBranch ?? 'none'})`,
                            )
                            .join(', ')}
                        </div>
                      )}

                      <div className="ff-mono" style={{ color: 'var(--text-muted)' }}>
                        Final Output Diff: +{comparisonReport.finalOutputDiff.addedCount}{' '}
                        ~{comparisonReport.finalOutputDiff.modifiedCount} -
                        {comparisonReport.finalOutputDiff.removedCount}
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'minmax(260px, 1fr) minmax(280px, 1.2fr)',
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
                </div>
              )}
            </>
          )}

          {activeTab === 'tests' && (
            <div
              aria-label="Testing Lab workspace"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              {/* Testing Lab Header Toolbar */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-2)',
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
                    flexWrap: 'wrap',
                  }}
                >
                  <strong>Test Suite ({testCases.length})</strong>
                  <span
                    style={{
                      fontSize: 'var(--text-compact)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Define input test cases, expected outputs, and branch coverage assertions for this workflow.
                  </span>
                  {testSuiteReport && (
                    <StatusBadge
                      status={
                        testSuiteReport.failedCases === 0
                          ? 'success'
                          : 'failed'
                      }
                      label={`${testSuiteReport.passedCases}/${testSuiteReport.totalCases} Passed`}
                    />
                  )}
                  <StatusBadge
                    status={
                      liveCoverageSummary.coveragePercent === 100
                        ? 'success'
                        : liveCoverageSummary.coveredBranchesCount > 0
                          ? 'warning'
                          : 'pending'
                    }
                    label={`Branch Coverage: ${liveCoverageSummary.coveragePercent}% (${liveCoverageSummary.coveredBranchesCount}/${liveCoverageSummary.totalConditionBranches})`}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                  }}
                >
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isRunningTests || testCases.length === 0}
                    leftIcon={<Play size={13} />}
                    onClick={() => {
                      void runTestSuite();
                    }}
                  >
                    {isRunningTests ? 'Running Suite...' : 'Run Test Suite'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Plus size={13} />}
                    onClick={() => setShowNewTestForm((prev) => !prev)}
                  >
                    {showNewTestForm ? 'Cancel New Test' : 'Add Test Case'}
                  </Button>
                  <Button
                    variant="tertiary"
                    size="sm"
                    leftIcon={<RotateCcw size={13} />}
                    onClick={() => resetDefaultTestCases()}
                  >
                    Reset Defaults
                  </Button>
                </div>
              </div>

              {/* Add Custom Test Case Form */}
              {showNewTestForm && (
                <div
                  aria-label="New test case form"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: '13px' }}>
                    Create Scenario Test Case
                  </h4>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <Input
                      label="Scenario Name"
                      value={newTestName}
                      placeholder="e.g., High-value engineering expense"
                      onChange={(e) => setNewTestName(e.target.value)}
                    />
                    <div className="ff-field">
                      <span className="ff-field__label">Expected Run Status</span>
                      <select
                        aria-label="Expected Run Status"
                        className="ff-field__select"
                        value={newTestExpectedStatus}
                        onChange={(e) =>
                          setNewTestExpectedStatus(
                            e.target.value as 'success' | 'failed',
                          )
                        }
                      >
                        <option value="success">success</option>
                        <option value="failed">failed</option>
                      </select>
                    </div>
                    {conditionNodes.length > 0 && (
                      <>
                        <div className="ff-field">
                          <span className="ff-field__label">
                            Assert Condition Node (Optional)
                          </span>
                          <select
                            aria-label="Assert Condition Node"
                            className="ff-field__select"
                            value={newTestConditionNodeId}
                            onChange={(e) =>
                              setNewTestConditionNodeId(e.target.value)
                            }
                          >
                            <option value="">None</option>
                            {conditionNodes.map((cn) => (
                              <option key={cn.id} value={cn.id}>
                                {cn.name} ({cn.id})
                              </option>
                            ))}
                          </select>
                        </div>
                        {newTestConditionNodeId && (
                          <div className="ff-field">
                            <span className="ff-field__label">
                              Expected Branch
                            </span>
                            <select
                              aria-label="Expected Branch"
                              className="ff-field__select"
                              value={newTestExpectedBranch}
                              onChange={(e) =>
                                setNewTestExpectedBranch(
                                  e.target.value as 'true' | 'false',
                                )
                              }
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          </div>
                        )}
                      </>
                    )}
                    <Input
                      label="Assert Output Field Path"
                      optional
                      value={newTestOutputPath}
                      placeholder="e.g., approvalStatus"
                      onChange={(e) => setNewTestOutputPath(e.target.value)}
                    />
                    <Input
                      label="Expected Output Value"
                      optional
                      value={newTestOutputExpectedValue}
                      placeholder="e.g., requires_vp_review"
                      onChange={(e) =>
                        setNewTestOutputExpectedValue(e.target.value)
                      }
                    />
                  </div>

                  <div className="ff-field">
                    <label
                      htmlFor="ff-new-test-json-input"
                      className="ff-field__label"
                    >
                      Trigger Input Payload (JSON)
                    </label>
                    <textarea
                      id="ff-new-test-json-input"
                      aria-label="Trigger Input Payload (JSON)"
                      className="ff-field__textarea ff-mono"
                      rows={4}
                      value={newTestInputJson}
                      onChange={(e) => {
                        setNewTestInputJson(e.target.value);
                        setNewTestInputError(null);
                      }}
                    />
                    {newTestInputError && (
                      <span
                        role="alert"
                        style={{
                          color: 'var(--danger)',
                          fontSize: 'var(--text-compact)',
                        }}
                      >
                        {newTestInputError}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(newTestInputJson);
                          if (
                            typeof parsed !== 'object' ||
                            parsed === null ||
                            Array.isArray(parsed)
                          ) {
                            setNewTestInputError(
                              'Trigger input must be a JSON object.',
                            );
                            return;
                          }
                          const assertions: WorkflowTestAssertion[] = [
                            {
                              id: `assert_status_${Date.now()}`,
                              kind: 'status',
                              expectedStatus: newTestExpectedStatus,
                            },
                          ];
                          if (newTestConditionNodeId) {
                            assertions.push({
                              id: `assert_branch_${Date.now()}`,
                              kind: 'branchSelected',
                              conditionNodeId: newTestConditionNodeId,
                              expectedHandle: newTestExpectedBranch,
                            });
                          }
                          if (newTestOutputPath.trim()) {
                            let parsedVal: string | number | boolean | null =
                              newTestOutputExpectedValue.trim();
                            if (parsedVal === 'true') parsedVal = true;
                            else if (parsedVal === 'false') parsedVal = false;
                            else if (parsedVal === 'null') parsedVal = null;
                            else if (
                              parsedVal !== '' &&
                              !Number.isNaN(Number(parsedVal))
                            ) {
                              parsedVal = Number(parsedVal);
                            }
                            assertions.push({
                              id: `assert_out_${Date.now()}`,
                              kind: 'outputFieldEquals',
                              fieldPath: newTestOutputPath.trim(),
                              expectedValue: parsedVal,
                            });
                          }

                          addTestCase({
                            name:
                              newTestName.trim() ||
                              `Scenario #${testCases.length + 1}`,
                            input: parsed as Record<string, unknown>,
                            assertions,
                          });
                          setNewTestName('');
                          setNewTestOutputPath('');
                          setNewTestOutputExpectedValue('');
                          setShowNewTestForm(false);
                        } catch (err) {
                          setNewTestInputError(
                            err instanceof Error
                              ? err.message
                              : 'Invalid JSON syntax.',
                          );
                        }
                      }}
                    >
                      Save Test Case
                    </Button>
                  </div>
                </div>
              )}

              {/* Condition Branch Coverage Matrix */}
              {liveCoverageSummary.perCondition.length > 0 && (
                <div
                  aria-label="Condition branch coverage breakdown"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2)',
                  }}
                >
                  {liveCoverageSummary.perCondition.map((c) => (
                    <div
                      key={c.nodeId}
                      className="ff-mono"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: 'var(--text-compact)',
                      }}
                    >
                      <strong>{c.nodeName}:</strong>
                      <span
                        style={{
                          color: c.trueCovered
                            ? 'var(--success)'
                            : 'var(--text-muted)',
                        }}
                      >
                        true:{c.trueCovered ? '✓' : '○'}
                      </span>
                      <span
                        style={{
                          color: c.falseCovered
                            ? 'var(--success)'
                            : 'var(--text-muted)',
                        }}
                      >
                        false:{c.falseCovered ? '✓' : '○'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Test Cases List */}
              {testCases.length === 0 ? (
                <EmptyState
                  title="No test cases configured"
                  description="Add a scenario test case or reset starter test cases to verify workflow outputs and branch coverage."
                />
              ) : (
                <div
                  className="ff-issue-list"
                  role="list"
                  aria-label="Workflow test cases"
                >
                  {testCases.map((tc) => {
                    const result = testSuiteReport?.results.find(
                      (r) => r.testCaseId === tc.id,
                    );
                    return (
                      <div
                        key={tc.id}
                        role="listitem"
                        className="ff-issue-list__item"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          gap: 'var(--space-2)',
                          cursor: 'default',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 'var(--space-2)',
                            flexWrap: 'wrap',
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
                                result
                                  ? result.passed
                                    ? 'success'
                                    : 'failed'
                                  : 'pending'
                              }
                              label={
                                result
                                  ? result.passed
                                    ? 'PASS'
                                    : 'FAIL'
                                  : 'Not Run'
                              }
                            />
                            <strong>{tc.name}</strong>
                            {result && (
                              <span
                                className="ff-mono ff-tabular"
                                style={{
                                  fontSize: 'var(--text-compact)',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                ({result.durationMs}ms)
                              </span>
                            )}
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-2)',
                            }}
                          >
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`Run test case ${tc.name}`}
                              disabled={isRunningTests}
                              onClick={() => {
                                void runSingleTest(tc.id);
                              }}
                            >
                              Run Case
                            </Button>
                            {result && (
                              <Button
                                variant="tertiary"
                                size="sm"
                                aria-label={`Inspect ${tc.name} in TraceLab`}
                                onClick={() => {
                                  setActiveRun(result.runRecord);
                                  setBottomDrawerTab('timeline');
                                }}
                              >
                                Inspect in TraceLab
                              </Button>
                            )}
                            <Button
                              variant="tertiary"
                              size="sm"
                              iconOnly
                              aria-label={`Delete test case ${tc.name}`}
                              onClick={() => deleteTestCase(tc.id)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </div>

                        {tc.description && (
                          <div
                            style={{
                              fontSize: 'var(--text-secondary-size)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {tc.description}
                          </div>
                        )}

                        <div
                          className="ff-mono"
                          style={{
                            fontSize: 'var(--text-compact)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Input: {JSON.stringify(tc.input)}
                        </div>

                        {result && (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              paddingTop: '4px',
                              borderTop: '1px solid var(--border-subtle)',
                            }}
                          >
                            {result.assertionResults.map((ar) => (
                              <div
                                key={ar.assertion.id}
                                className="ff-mono"
                                style={{
                                  fontSize: 'var(--text-compact)',
                                  color: ar.passed
                                    ? 'var(--success)'
                                    : 'var(--danger)',
                                }}
                              >
                                {ar.passed ? '✓' : '✗'} {ar.message} (expected:{' '}
                                { ar.expectedSummary }, actual: {ar.actualSummary})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
