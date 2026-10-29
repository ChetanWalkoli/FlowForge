/**
 * FlowForge — Workflow Serialization, Export, and Untrusted Import Validation
 * Implements FR-054 (versioned JSON export), FR-055 (validate and preview JSON imports),
 * and PRD.md §14 Security Requirements (strip secrets/credentials, never auto-execute).
 */

import type { ValidationReport, WorkflowDocument } from '../domain/types/workflow';
import { validateWorkflow } from '../domain/validation/graph-validator';
import { parseWorkflowDocument } from '../schemas/workflow-schema';

const SENSITIVE_KEY_PATTERN =
  /^(api[_-]?key|secret|password|token|authorization|private[_-]?key|client[_-]?secret|credential)$/i;

function scrubSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubSensitiveValues);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        continue;
      }
      out[k] = scrubSensitiveValues(v);
    }
    return out;
  }
  return value;
}

/**
 * Serializes a WorkflowDocument into a formatted, versioned JSON string (`flowforge.workflow` v1)
 * with any accidental credential/secret keys stripped by default (PRD.md §4.2 & §14).
 */
export function serializeWorkflowForExport(doc: WorkflowDocument): string {
  const sanitized = scrubSensitiveValues(structuredClone(doc)) as WorkflowDocument;
  const envelope: WorkflowDocument = {
    format: 'flowforge.workflow',
    formatVersion: 1,
    id: sanitized.id,
    name: sanitized.name,
    description: sanitized.description ?? '',
    revision: sanitized.revision,
    status: sanitized.status ?? 'draft',
    nodes: sanitized.nodes,
    edges: sanitized.edges,
    createdAt: sanitized.createdAt,
    updatedAt: new Date().toISOString(),
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Triggers a browser file download for a serialized workflow document.
 */
export function downloadWorkflowJson(doc: WorkflowDocument): string {
  const json = serializeWorkflowForExport(doc);
  const safeSlug = doc.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'workflow';
  const filename = `${safeSlug}.v${doc.revision}.flowforge.json`;

  if (typeof document !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return json;
}

export interface WorkflowImportPreview {
  valid: boolean;
  canCommit: boolean;
  document?: WorkflowDocument;
  validationReport?: ValidationReport;
  schemaErrors: string[];
  summary?: {
    name: string;
    description: string;
    formatVersion: number;
    revision: number;
    nodesCount: number;
    edgesCount: number;
    nodeTypes: string[];
    errorsCount: number;
    warningsCount: number;
  };
}

/**
 * Validates and builds an inspectable preview for an untrusted JSON import string.
 * Rejects malformed JSON, oversized payloads, invalid format versions, unknown node types,
 * and broken edge references before committing.
 */
export function validateAndPreviewImport(
  rawJson: string,
): WorkflowImportPreview {
  const parsed = parseWorkflowDocument(rawJson);
  if (!parsed.success || !parsed.document) {
    return {
      valid: false,
      canCommit: false,
      schemaErrors: parsed.errors,
    };
  }

  const doc = parsed.document;
  const report = validateWorkflow(doc);

  // Structural errors such as broken edge references, duplicate node IDs, or unknown node types
  // block import commitment to protect repository integrity (PRD.md Journey D / FR-055).
  const integrityBlockingCodes = new Set([
    'SCHEMA_INVALID',
    'DUPLICATE_NODE_ID',
    'BROKEN_EDGE_REFERENCE',
    'UNKNOWN_NODE_TYPE',
    'INVALID_CONNECTION',
  ]);

  const blockingIntegrityIssues = report.issues.filter((i) =>
    integrityBlockingCodes.has(i.code),
  );

  if (blockingIntegrityIssues.length > 0) {
    return {
      valid: false,
      canCommit: false,
      document: doc,
      validationReport: report,
      schemaErrors: blockingIntegrityIssues.map(
        (i) => `${i.code}: ${i.message}`,
      ),
    };
  }

  const distinctNodeTypes = Array.from(new Set(doc.nodes.map((n) => n.type)));

  return {
    valid: report.valid,
    canCommit: true,
    document: doc,
    validationReport: report,
    schemaErrors: [],
    summary: {
      name: doc.name,
      description: doc.description ?? '',
      formatVersion: doc.formatVersion,
      revision: doc.revision,
      nodesCount: doc.nodes.length,
      edgesCount: doc.edges.length,
      nodeTypes: distinctNodeTypes,
      errorsCount: report.errorsCount,
      warningsCount: report.warningsCount,
    },
  };
}

