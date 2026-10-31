/**
 * FlowForge — Immutable Workflow Versioning & Structural Diff Engine
 * Pure TypeScript module (zero React or UI imports).
 * Implements FR-056, FR-057, and FR-058.
 */

import type {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowLifecycleStatus,
  WorkflowNode,
} from '../types/workflow';

export interface WorkflowRevisionRecord {
  revisionId: string;
  workflowId: string;
  revisionNumber: number;
  status: WorkflowLifecycleStatus;
  note: string;
  createdAt: string;
  snapshot: WorkflowDocument;
}

export interface ModifiedNodeDiff {
  nodeId: string;
  nodeName: string;
  nameChanged: boolean;
  positionChanged: boolean;
  configChanged: boolean;
  beforeNode: WorkflowNode;
  afterNode: WorkflowNode;
}

export interface RevisionDiffReport {
  baseRevision: number;
  targetRevision: number;
  hasChanges: boolean;
  addedNodes: WorkflowNode[];
  removedNodes: WorkflowNode[];
  modifiedNodes: ModifiedNodeDiff[];
  addedEdges: WorkflowEdge[];
  removedEdges: WorkflowEdge[];
  summary: string;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
    .join(',')}}`;
}

/**
 * Creates an immutable revision record snapshot for a workflow document (FR-056).
 */
export function createWorkflowRevisionRecord(
  workflow: WorkflowDocument,
  options: {
    revisionNumber?: number;
    status?: WorkflowLifecycleStatus;
    note?: string;
    nowIso?: string;
  } = {},
): WorkflowRevisionRecord {
  const revisionNumber = options.revisionNumber ?? workflow.revision;
  const status = options.status ?? workflow.status ?? 'validated';
  const createdAt = options.nowIso ?? new Date().toISOString();
  const note =
    options.note?.trim() || `Checkpoint rev ${revisionNumber} (${status})`;

  const snapshot: WorkflowDocument = {
    ...structuredClone(workflow),
    revision: revisionNumber,
    status,
    updatedAt: createdAt,
  };

  return {
    revisionId: `rev_${workflow.id}_v${revisionNumber}_${Date.now()}`,
    workflowId: workflow.id,
    revisionNumber,
    status,
    note,
    createdAt,
    snapshot,
  };
}

/**
 * Compares two workflow documents (`baseDoc` vs `targetDoc`) across nodes, positions,
 * configurations, and edge connections (FR-057).
 */
export function compareWorkflowRevisions(
  baseDoc: WorkflowDocument,
  targetDoc: WorkflowDocument,
): RevisionDiffReport {
  const baseNodeMap = new Map<string, WorkflowNode>();
  for (const node of baseDoc.nodes) {
    baseNodeMap.set(node.id, node);
  }

  const targetNodeMap = new Map<string, WorkflowNode>();
  for (const node of targetDoc.nodes) {
    targetNodeMap.set(node.id, node);
  }

  const addedNodes: WorkflowNode[] = [];
  const removedNodes: WorkflowNode[] = [];
  const modifiedNodes: ModifiedNodeDiff[] = [];

  for (const node of targetDoc.nodes) {
    const prev = baseNodeMap.get(node.id);
    if (!prev) {
      addedNodes.push(structuredClone(node));
    } else {
      const nameChanged = prev.name !== node.name;
      const positionChanged =
        prev.position.x !== node.position.x ||
        prev.position.y !== node.position.y;
      const configChanged = stableJson(prev.config) !== stableJson(node.config);

      if (nameChanged || positionChanged || configChanged) {
        modifiedNodes.push({
          nodeId: node.id,
          nodeName: node.name,
          nameChanged,
          positionChanged,
          configChanged,
          beforeNode: structuredClone(prev),
          afterNode: structuredClone(node),
        });
      }
    }
  }

  for (const node of baseDoc.nodes) {
    if (!targetNodeMap.has(node.id)) {
      removedNodes.push(structuredClone(node));
    }
  }

  const edgeSignature = (e: WorkflowEdge) =>
    `${e.id}::${e.source}:${e.sourceHandle ?? ''}->${e.target}:${e.targetHandle ?? ''}`;

  const baseEdgeMap = new Map<string, WorkflowEdge>();
  for (const edge of baseDoc.edges) {
    baseEdgeMap.set(edgeSignature(edge), edge);
  }

  const targetEdgeMap = new Map<string, WorkflowEdge>();
  for (const edge of targetDoc.edges) {
    targetEdgeMap.set(edgeSignature(edge), edge);
  }

  const addedEdges: WorkflowEdge[] = [];
  const removedEdges: WorkflowEdge[] = [];

  for (const [sig, edge] of targetEdgeMap.entries()) {
    if (!baseEdgeMap.has(sig)) {
      addedEdges.push(structuredClone(edge));
    }
  }

  for (const [sig, edge] of baseEdgeMap.entries()) {
    if (!targetEdgeMap.has(sig)) {
      removedEdges.push(structuredClone(edge));
    }
  }

  const hasChanges =
    addedNodes.length > 0 ||
    removedNodes.length > 0 ||
    modifiedNodes.length > 0 ||
    addedEdges.length > 0 ||
    removedEdges.length > 0;

  const parts: string[] = [];
  if (addedNodes.length > 0) parts.push(`+${addedNodes.length} node(s)`);
  if (removedNodes.length > 0) parts.push(`-${removedNodes.length} node(s)`);
  if (modifiedNodes.length > 0) parts.push(`~${modifiedNodes.length} modified`);
  if (addedEdges.length > 0) parts.push(`+${addedEdges.length} edge(s)`);
  if (removedEdges.length > 0) parts.push(`-${removedEdges.length} edge(s)`);

  const summary =
    parts.length > 0 ? parts.join(', ') : 'No structural or config differences';

  return {
    baseRevision: baseDoc.revision,
    targetRevision: targetDoc.revision,
    hasChanges,
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    summary,
  };
}

/**
 * Restores a historical revision snapshot by creating a new revision `highestRevision + 1`
 * instead of overwriting existing revision history (FR-058).
 */
export function buildRestoredWorkflowRevision(
  targetRevisionRecord: WorkflowRevisionRecord,
  highestRevisionNumber: number,
  nowIso: string = new Date().toISOString(),
): WorkflowDocument {
  const nextRevision =
    Math.max(highestRevisionNumber, targetRevisionRecord.revisionNumber) + 1;
  return {
    ...structuredClone(targetRevisionRecord.snapshot),
    revision: nextRevision,
    status: 'draft',
    updatedAt: nowIso,
  };
}

