/**
 * FlowForge — TraceLab Replay, Payload Diffing & Run Comparison Engine
 * Pure TypeScript module (zero React, Zustand, or DOM dependencies).
 * Implements FR-038, FR-041, FR-043, FR-044, FR-045.
 */

import type {
  NodeExecutionTrace,
  NodeStatus,
  RunStatus,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRunRecord,
} from '../../domain/types/workflow';

export type DiffChangeType = 'added' | 'modified' | 'removed' | 'unchanged';

export interface PayloadDiffEntry {
  key: string;
  changeType: DiffChangeType;
  beforeValue?: unknown;
  afterValue?: unknown;
}

export interface PayloadDiffReport {
  hasChanges: boolean;
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  unchangedCount: number;
  entries: PayloadDiffEntry[];
}

export interface BranchComparisonEntry {
  nodeId: string;
  nodeName: string;
  baseBranch?: string;
  targetBranch?: string;
  changed: boolean;
}

export interface NodeComparisonEntry {
  nodeId: string;
  nodeName: string;
  baseStatus: NodeStatus;
  targetStatus: NodeStatus;
  statusChanged: boolean;
  baseDurationMs?: number;
  targetDurationMs?: number;
  outputDiff: PayloadDiffReport;
}

export interface RunComparisonReport {
  baseRunId: string;
  targetRunId: string;
  baseStatus: RunStatus;
  targetStatus: RunStatus;
  statusChanged: boolean;
  baseDurationMs?: number;
  targetDurationMs?: number;
  durationDeltaMs: number | null;
  branchDifferences: BranchComparisonEntry[];
  nodeComparisons: NodeComparisonEntry[];
  finalOutputDiff: PayloadDiffReport;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

/**
 * Computes a structured key-by-key diff between two JSON payloads (e.g., node input vs. output,
 * or two runs' final outputs).
 */
export function computePayloadDiff(
  beforePayload: unknown,
  afterPayload: unknown,
): PayloadDiffReport {
  const entries: PayloadDiffEntry[] = [];

  if (isPlainRecord(beforePayload) && isPlainRecord(afterPayload)) {
    const allKeys = Array.from(
      new Set([...Object.keys(beforePayload), ...Object.keys(afterPayload)]),
    ).sort();

    for (const key of allKeys) {
      const inBefore = Object.prototype.hasOwnProperty.call(beforePayload, key);
      const inAfter = Object.prototype.hasOwnProperty.call(afterPayload, key);

      if (!inBefore && inAfter) {
        entries.push({
          key,
          changeType: 'added',
          afterValue: structuredClone(afterPayload[key]),
        });
      } else if (inBefore && !inAfter) {
        entries.push({
          key,
          changeType: 'removed',
          beforeValue: structuredClone(beforePayload[key]),
        });
      } else {
        const beforeVal = beforePayload[key];
        const afterVal = afterPayload[key];
        if (deepEqual(beforeVal, afterVal)) {
          entries.push({
            key,
            changeType: 'unchanged',
            beforeValue: structuredClone(beforeVal),
            afterValue: structuredClone(afterVal),
          });
        } else {
          entries.push({
            key,
            changeType: 'modified',
            beforeValue: structuredClone(beforeVal),
            afterValue: structuredClone(afterVal),
          });
        }
      }
    }
  } else if (beforePayload === undefined && afterPayload === undefined) {
    // Both undefined -> no entries
  } else if (beforePayload === undefined) {
    entries.push({
      key: '$value',
      changeType: 'added',
      afterValue: structuredClone(afterPayload),
    });
  } else if (afterPayload === undefined) {
    entries.push({
      key: '$value',
      changeType: 'removed',
      beforeValue: structuredClone(beforePayload),
    });
  } else if (deepEqual(beforePayload, afterPayload)) {
    entries.push({
      key: '$value',
      changeType: 'unchanged',
      beforeValue: structuredClone(beforePayload),
      afterValue: structuredClone(afterPayload),
    });
  } else {
    entries.push({
      key: '$value',
      changeType: 'modified',
      beforeValue: structuredClone(beforePayload),
      afterValue: structuredClone(afterPayload),
    });
  }

  const addedCount = entries.filter((e) => e.changeType === 'added').length;
  const modifiedCount = entries.filter((e) => e.changeType === 'modified').length;
  const removedCount = entries.filter((e) => e.changeType === 'removed').length;
  const unchangedCount = entries.filter(
    (e) => e.changeType === 'unchanged',
  ).length;

  return {
    hasChanges: addedCount > 0 || modifiedCount > 0 || removedCount > 0,
    addedCount,
    modifiedCount,
    removedCount,
    unchangedCount,
    entries,
  };
}

/**
 * Reconstructs a side-effect-free point-in-time snapshot of a `WorkflowRunRecord` at
 * `eventIndex` (`0 <= eventIndex < run.events.length`) without invoking any node handlers (FR-043).
 */
export function replayRunAtEventIndex(
  run: WorkflowRunRecord,
  eventIndex: number | null,
  workflowEdges: WorkflowEdge[] = [],
): WorkflowRunRecord {
  if (
    eventIndex === null ||
    eventIndex < 0 ||
    run.events.length === 0 ||
    eventIndex >= run.events.length - 1
  ) {
    return structuredClone(run);
  }

  const boundedIndex = Math.min(
    Math.max(0, Math.floor(eventIndex)),
    run.events.length - 1,
  );
  const slicedEvents = structuredClone(run.events.slice(0, boundedIndex + 1));

  // Initialize node traces as pending based on all known nodes in the run
  const replayedTraces: Record<string, NodeExecutionTrace> = {};
  for (const [nodeId, fullTrace] of Object.entries(run.nodeTraces)) {
    replayedTraces[nodeId] = {
      nodeId: fullTrace.nodeId,
      nodeName: fullTrace.nodeName,
      nodeType: fullTrace.nodeType,
      status: 'pending',
      attempts: 0,
    };
  }

  let status: RunStatus = 'running';
  let completedAt: number | undefined = undefined;
  let durationMs: number | undefined = undefined;
  let finalOutput: unknown = undefined;
  let error = undefined;

  const completedNodes = new Set<string>();
  const selectedBranchByNode = new Map<string, string>();

  for (const event of slicedEvents) {
    switch (event.type) {
      case 'run.started':
        status = 'running';
        break;

      case 'node.started': {
        const existing = replayedTraces[event.nodeId] ?? {
          nodeId: event.nodeId,
          nodeName: event.nodeName,
          nodeType: event.nodeType,
          status: 'pending',
          attempts: 0,
        };
        replayedTraces[event.nodeId] = {
          ...existing,
          status: 'running',
          startedAt: event.timestamp,
          input: structuredClone(event.input),
          attempts: event.attempt,
        };
        break;
      }

      case 'node.completed': {
        const existing = replayedTraces[event.nodeId] ?? {
          nodeId: event.nodeId,
          nodeName: event.nodeName,
          nodeType: event.nodeType,
          status: 'running',
          attempts: event.attempt,
        };
        replayedTraces[event.nodeId] = {
          ...existing,
          status: 'success',
          completedAt: event.timestamp,
          durationMs: event.durationMs,
          input: structuredClone(event.input),
          output: structuredClone(event.output),
          attempts: event.attempt,
        };
        completedNodes.add(event.nodeId);
        break;
      }

      case 'branch.selected': {
        const existing = replayedTraces[event.nodeId];
        if (existing) {
          replayedTraces[event.nodeId] = {
            ...existing,
            selectedHandleId: event.handleId,
            conditionReason: structuredClone(event.reason),
          };
        }
        selectedBranchByNode.set(event.nodeId, event.handleId);
        break;
      }

      case 'node.skipped': {
        const existing = replayedTraces[event.nodeId];
        if (existing) {
          replayedTraces[event.nodeId] = {
            ...existing,
            status: 'skipped',
            completedAt: event.timestamp,
            skipReason: event.reason,
          };
        }
        break;
      }

      case 'node.failed': {
        const existing = replayedTraces[event.nodeId] ?? {
          nodeId: event.nodeId,
          nodeName: event.nodeName,
          nodeType: event.nodeType,
          status: 'running',
          attempts: event.attempt,
        };
        replayedTraces[event.nodeId] = {
          ...existing,
          status: 'failed',
          completedAt: event.timestamp,
          durationMs: event.durationMs,
          input: structuredClone(event.input),
          error: structuredClone(event.error),
          attempts: event.attempt,
        };
        break;
      }

      case 'run.completed':
        status = 'success';
        completedAt = event.timestamp;
        durationMs = event.durationMs;
        finalOutput = structuredClone(event.output);
        break;

      case 'run.failed':
        status = 'failed';
        completedAt = event.timestamp;
        durationMs = event.durationMs;
        error = structuredClone(event.error);
        break;

      case 'run.cancelled':
        status = 'cancelled';
        completedAt = event.timestamp;
        durationMs = event.durationMs;
        break;
    }
  }

  // Recompute traversed edges up to this replay checkpoint
  const fullTraversedSet = new Set(run.traversedEdgeIds);
  let replayedTraversedEdgeIds: string[];

  if (workflowEdges.length > 0) {
    replayedTraversedEdgeIds = workflowEdges
      .filter((edge) => {
        if (!fullTraversedSet.has(edge.id)) return false;
        if (!completedNodes.has(edge.source)) return false;
        const sourceTrace = replayedTraces[edge.source];
        if (sourceTrace?.nodeType === 'condition') {
          const chosen = selectedBranchByNode.get(edge.source);
          if (!chosen) return false;
          return (edge.sourceHandle ?? 'true') === chosen;
        }
        return true;
      })
      .map((e) => e.id);
  } else {
    replayedTraversedEdgeIds = run.traversedEdgeIds.filter(() =>
      completedNodes.size > 0,
    );
  }

  return {
    ...structuredClone(run),
    status,
    completedAt,
    durationMs,
    finalOutput,
    error,
    nodeTraces: replayedTraces,
    traversedEdgeIds: replayedTraversedEdgeIds,
  };
}

/**
 * Compares two workflow runs (`baseRun` vs `targetRun`) across status, duration,
 * selected condition branches, per-node outcomes, and final output payloads (FR-044).
 */
export function compareWorkflowRuns(
  baseRun: WorkflowRunRecord,
  targetRun: WorkflowRunRecord,
  workflowNodes: WorkflowNode[] = [],
): RunComparisonReport {
  const durationDeltaMs =
    typeof baseRun.durationMs === 'number' &&
    typeof targetRun.durationMs === 'number'
      ? targetRun.durationMs - baseRun.durationMs
      : null;

  // Collect all node IDs in deterministic order
  const nodeOrder: Array<{ id: string; name: string; type?: string }> = [];
  const seenIds = new Set<string>();

  for (const node of workflowNodes) {
    seenIds.add(node.id);
    nodeOrder.push({ id: node.id, name: node.name, type: node.type });
  }
  for (const trace of Object.values(baseRun.nodeTraces)) {
    if (!seenIds.has(trace.nodeId)) {
      seenIds.add(trace.nodeId);
      nodeOrder.push({
        id: trace.nodeId,
        name: trace.nodeName,
        type: trace.nodeType,
      });
    }
  }
  for (const trace of Object.values(targetRun.nodeTraces)) {
    if (!seenIds.has(trace.nodeId)) {
      seenIds.add(trace.nodeId);
      nodeOrder.push({
        id: trace.nodeId,
        name: trace.nodeName,
        type: trace.nodeType,
      });
    }
  }

  const branchDifferences: BranchComparisonEntry[] = [];
  const nodeComparisons: NodeComparisonEntry[] = [];

  for (const item of nodeOrder) {
    const baseTrace = baseRun.nodeTraces[item.id];
    const targetTrace = targetRun.nodeTraces[item.id];

    const baseStatus: NodeStatus = baseTrace?.status ?? 'pending';
    const targetStatus: NodeStatus = targetTrace?.status ?? 'pending';

    nodeComparisons.push({
      nodeId: item.id,
      nodeName: item.name,
      baseStatus,
      targetStatus,
      statusChanged: baseStatus !== targetStatus,
      baseDurationMs: baseTrace?.durationMs,
      targetDurationMs: targetTrace?.durationMs,
      outputDiff: computePayloadDiff(baseTrace?.output, targetTrace?.output),
    });

    const isCondition =
      item.type === 'condition' ||
      baseTrace?.nodeType === 'condition' ||
      targetTrace?.nodeType === 'condition' ||
      baseTrace?.selectedHandleId !== undefined ||
      targetTrace?.selectedHandleId !== undefined;

    if (isCondition) {
      const baseBranch =
        baseTrace?.selectedHandleId ??
        (baseTrace?.conditionReason
          ? String(baseTrace.conditionReason.result)
          : undefined);
      const targetBranch =
        targetTrace?.selectedHandleId ??
        (targetTrace?.conditionReason
          ? String(targetTrace.conditionReason.result)
          : undefined);

      branchDifferences.push({
        nodeId: item.id,
        nodeName: item.name,
        baseBranch,
        targetBranch,
        changed: baseBranch !== targetBranch,
      });
    }
  }

  return {
    baseRunId: baseRun.runId,
    targetRunId: targetRun.runId,
    baseStatus: baseRun.status,
    targetStatus: targetRun.status,
    statusChanged: baseRun.status !== targetRun.status,
    baseDurationMs: baseRun.durationMs,
    targetDurationMs: targetRun.durationMs,
    durationDeltaMs,
    branchDifferences,
    nodeComparisons,
    finalOutputDiff: computePayloadDiff(
      baseRun.finalOutput,
      targetRun.finalOutput,
    ),
  };
}

