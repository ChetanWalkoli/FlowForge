/**
 * FlowForge — Execution Event Recorder and Trace State Builder
 * Pure TypeScript module with zero React, Zustand, DOM, or IndexedDB dependencies.
 * Never uses eval() or new Function().
 */

import type {
  ConditionEvaluationReason,
  ExecutionEvent,
  NodeExecutionTrace,
  StructuredExecutionError,
  WorkflowDocument,
  WorkflowNode,
  WorkflowRunRecord,
} from '../domain/types/workflow';

export type ExecutionEventListener = (
  event: ExecutionEvent,
  snapshot: WorkflowRunRecord,
) => void;

export interface TraceRecorderOptions {
  runId?: string;
  workflow: Pick<WorkflowDocument, 'id' | 'name' | 'revision' | 'nodes'>;
  input: Record<string, unknown>;
  now?: () => number;
  onEvent?: ExecutionEventListener;
}

let runSeq = 1;

/**
 * Generates a unique, readable run identifier when none is explicitly provided.
 */
export function createRunId(nowFn: () => number = () => Date.now()): string {
  return `run_${nowFn()}_${runSeq++}`;
}

/**
 * Computes a non-negative integer duration in milliseconds between start and end timestamps.
 */
function computeDurationMs(startedAt: number, completedAt: number): number {
  return Math.max(0, Math.round(completedAt - startedAt));
}

/**
 * Chronological, immutable-safe execution event recorder and per-node trace builder.
 */
export class TraceRecorder {
  private readonly now: () => number;
  private readonly onEvent?: ExecutionEventListener;
  private readonly runRecord: WorkflowRunRecord;
  private readonly traversedEdgeSet = new Set<string>();

  constructor(options: TraceRecorderOptions) {
    this.now = options.now ?? (() => Date.now());
    this.onEvent = options.onEvent;

    const initialTimestamp = this.now();
    const runId = options.runId ?? createRunId(this.now);

    const initialNodeTraces: Record<string, NodeExecutionTrace> = {};
    for (const node of options.workflow.nodes) {
      initialNodeTraces[node.id] = {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'pending',
        attempts: 0,
      };
    }

    this.runRecord = {
      runId,
      workflowId: options.workflow.id,
      workflowName: options.workflow.name,
      revision: options.workflow.revision,
      status: 'starting',
      startedAt: initialTimestamp,
      input: structuredClone(options.input),
      events: [],
      nodeTraces: initialNodeTraces,
      traversedEdgeIds: [],
    };
  }

  /**
   * Emits an ExecutionEvent, appends a deep-cloned copy to the run log,
   * and notifies any attached listener with cloned event and snapshot payloads.
   */
  private emit(event: ExecutionEvent): ExecutionEvent {
    const clonedEvent = structuredClone(event);
    this.runRecord.events.push(clonedEvent);

    if (this.onEvent) {
      this.onEvent(structuredClone(clonedEvent), this.getSnapshot());
    }

    return structuredClone(clonedEvent);
  }

  /**
   * Ensures a NodeExecutionTrace entry exists for the given node.
   */
  private ensureNodeTrace(
    node: Pick<WorkflowNode, 'id' | 'name' | 'type'>,
  ): NodeExecutionTrace {
    let trace = this.runRecord.nodeTraces[node.id];
    if (!trace) {
      trace = {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'pending',
        attempts: 0,
      };
      this.runRecord.nodeTraces[node.id] = trace;
    }
    return trace;
  }

  /**
   * Records `run.started` and transitions the run status to `'running'`.
   */
  public recordRunStarted(timestamp?: number): ExecutionEvent {
    const ts = timestamp ?? this.now();
    this.runRecord.startedAt = ts;
    this.runRecord.status = 'running';

    return this.emit({
      type: 'run.started',
      runId: this.runRecord.runId,
      workflowId: this.runRecord.workflowId,
      revision: this.runRecord.revision,
      input: structuredClone(this.runRecord.input),
      timestamp: ts,
    });
  }

  /**
   * Records `node.started` and transitions the node trace to `'running'`.
   */
  public recordNodeStarted(
    node: Pick<WorkflowNode, 'id' | 'name' | 'type'>,
    input: unknown,
    attempt?: number,
    timestamp?: number,
  ): ExecutionEvent {
    const ts = timestamp ?? this.now();
    const trace = this.ensureNodeTrace(node);
    const resolvedAttempt = attempt ?? trace.attempts + 1;
    const clonedInput = structuredClone(input);

    trace.status = 'running';
    trace.startedAt = ts;
    trace.completedAt = undefined;
    trace.durationMs = undefined;
    trace.attempts = resolvedAttempt;
    trace.input = clonedInput;
    trace.error = undefined;
    trace.skipReason = undefined;

    return this.emit({
      type: 'node.started',
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      input: clonedInput,
      attempt: resolvedAttempt,
      timestamp: ts,
    });
  }

  /**
   * Records `node.completed` and transitions the node trace to `'success'`.
   */
  public recordNodeCompleted(
    node: Pick<WorkflowNode, 'id' | 'name' | 'type'>,
    input: unknown,
    output: unknown,
    attempt?: number,
    timestamp?: number,
  ): ExecutionEvent {
    const ts = timestamp ?? this.now();
    const trace = this.ensureNodeTrace(node);
    const startedAt = trace.startedAt ?? ts;
    const durationMs = computeDurationMs(startedAt, ts);
    const resolvedAttempt = attempt ?? Math.max(1, trace.attempts);
    const clonedInput = structuredClone(input);
    const clonedOutput = structuredClone(output);

    trace.status = 'success';
    trace.startedAt = startedAt;
    trace.completedAt = ts;
    trace.durationMs = durationMs;
    trace.attempts = resolvedAttempt;
    trace.input = clonedInput;
    trace.output = clonedOutput;
    trace.error = undefined;

    return this.emit({
      type: 'node.completed',
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      input: clonedInput,
      output: clonedOutput,
      durationMs,
      attempt: resolvedAttempt,
      timestamp: ts,
    });
  }

  /**
   * Records `branch.selected` for a Condition node and attaches the ConditionEvaluationReason
   * and selected handle ID to the node's trace.
   */
  public recordBranchSelected(
    nodeId: string,
    handleId: string,
    reason: ConditionEvaluationReason,
    timestamp?: number,
  ): ExecutionEvent {
    const ts = timestamp ?? this.now();
    const clonedReason = structuredClone(reason);
    const trace = this.runRecord.nodeTraces[nodeId];

    if (trace) {
      trace.conditionReason = clonedReason;
      trace.selectedHandleId = handleId;
    }

    return this.emit({
      type: 'branch.selected',
      nodeId,
      handleId,
      reason: clonedReason,
      timestamp: ts,
    });
  }

  /**
   * Records `node.skipped` for a node on an unselected branch and transitions its status to `'skipped'`.
   */
  public recordNodeSkipped(
    node: Pick<WorkflowNode, 'id' | 'name' | 'type'>,
    reason: string,
    timestamp?: number,
  ): ExecutionEvent {
    const ts = timestamp ?? this.now();
    const trace = this.ensureNodeTrace(node);

    trace.status = 'skipped';
    trace.skipReason = reason;
    trace.completedAt = ts;
    trace.durationMs = 0;

    return this.emit({
      type: 'node.skipped',
      nodeId: node.id,
      nodeName: node.name,
      reason,
      timestamp: ts,
    });
  }

  /**
   * Records `node.failed` and transitions the node trace to `'failed'` with a StructuredExecutionError.
   */
  public recordNodeFailed(
    node: Pick<WorkflowNode, 'id' | 'name' | 'type'>,
    input: unknown,
    error: StructuredExecutionError,
    attempt?: number,
    timestamp?: number,
  ): ExecutionEvent {
    const ts = timestamp ?? this.now();
    const trace = this.ensureNodeTrace(node);
    const startedAt = trace.startedAt ?? ts;
    const durationMs = computeDurationMs(startedAt, ts);
    const resolvedAttempt = attempt ?? Math.max(1, trace.attempts);
    const clonedInput = structuredClone(input);
    const clonedError: StructuredExecutionError = {
      ...structuredClone(error),
      nodeId: error.nodeId ?? node.id,
    };

    trace.status = 'failed';
    trace.startedAt = startedAt;
    trace.completedAt = ts;
    trace.durationMs = durationMs;
    trace.attempts = resolvedAttempt;
    trace.input = clonedInput;
    trace.error = clonedError;

    return this.emit({
      type: 'node.failed',
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      input: clonedInput,
      error: clonedError,
      durationMs,
      attempt: resolvedAttempt,
      timestamp: ts,
    });
  }

  /**
   * Records that an edge was traversed during execution (preserving insertion order without duplicates).
   */
  public recordEdgeTraversed(edgeId: string): void {
    if (!edgeId || this.traversedEdgeSet.has(edgeId)) return;
    this.traversedEdgeSet.add(edgeId);
    this.runRecord.traversedEdgeIds.push(edgeId);
  }

  /**
   * Records `run.paused` and transitions the run status to `'paused'`.
   */
  public recordRunPaused(
    pausedAtNodeId?: string,
    timestamp?: number,
  ): ExecutionEvent {
    const ts = timestamp ?? this.now();
    this.runRecord.status = 'paused';

    return this.emit({
      type: 'run.paused',
      runId: this.runRecord.runId,
      pausedAtNodeId,
      timestamp: ts,
    });
  }

  /**
   * Records `run.resumed` and transitions the run status to `'running'`.
   */
  public recordRunResumed(
    resumedAtNodeId?: string,
    timestamp?: number,
  ): ExecutionEvent {
    const ts = timestamp ?? this.now();
    this.runRecord.status = 'running';

    return this.emit({
      type: 'run.resumed',
      runId: this.runRecord.runId,
      resumedAtNodeId,
      timestamp: ts,
    });
  }

  /**
   * Records `run.completed` and finalizes the WorkflowRunRecord with `'success'` status and finalOutput.
   */
  public recordRunCompleted(output: unknown, timestamp?: number): ExecutionEvent {
    const ts = timestamp ?? this.now();
    const durationMs = computeDurationMs(this.runRecord.startedAt, ts);
    const clonedOutput = structuredClone(output);

    this.runRecord.status = 'success';
    this.runRecord.completedAt = ts;
    this.runRecord.durationMs = durationMs;
    this.runRecord.finalOutput = clonedOutput;

    return this.emit({
      type: 'run.completed',
      runId: this.runRecord.runId,
      output: clonedOutput,
      durationMs,
      timestamp: ts,
    });
  }

  /**
   * Records `run.failed` and finalizes the WorkflowRunRecord with `'failed'` status and StructuredExecutionError.
   */
  public recordRunFailed(
    error: StructuredExecutionError,
    timestamp?: number,
  ): ExecutionEvent {
    const ts = timestamp ?? this.now();
    const durationMs = computeDurationMs(this.runRecord.startedAt, ts);
    const clonedError = structuredClone(error);

    this.runRecord.status = 'failed';
    this.runRecord.completedAt = ts;
    this.runRecord.durationMs = durationMs;
    this.runRecord.error = clonedError;

    return this.emit({
      type: 'run.failed',
      runId: this.runRecord.runId,
      error: clonedError,
      durationMs,
      timestamp: ts,
    });
  }

  /**
   * Records `run.cancelled`, finalizes any in-flight `'running'` node trace so no node
   * remains stuck in `'running'` state, and sets WorkflowRunRecord status to `'cancelled'`.
   */
  public recordRunCancelled(timestamp?: number): ExecutionEvent {
    const ts = timestamp ?? this.now();
    const durationMs = computeDurationMs(this.runRecord.startedAt, ts);

    for (const trace of Object.values(this.runRecord.nodeTraces)) {
      if (trace.status === 'running') {
        trace.status = 'skipped';
        trace.skipReason = 'Run cancelled while node was executing';
        trace.completedAt = ts;
        trace.durationMs = computeDurationMs(trace.startedAt ?? ts, ts);
      }
    }

    this.runRecord.status = 'cancelled';
    this.runRecord.completedAt = ts;
    this.runRecord.durationMs = durationMs;

    return this.emit({
      type: 'run.cancelled',
      runId: this.runRecord.runId,
      durationMs,
      timestamp: ts,
    });
  }

  /**
   * Returns a deep-cloned snapshot of a specific node's execution trace.
   */
  public getNodeTrace(nodeId: string): NodeExecutionTrace | undefined {
    const trace = this.runRecord.nodeTraces[nodeId];
    return trace ? structuredClone(trace) : undefined;
  }

  /**
   * Returns a deep-cloned, immutable snapshot of the entire WorkflowRunRecord.
   */
  public getSnapshot(): WorkflowRunRecord {
    return structuredClone(this.runRecord);
  }
}

