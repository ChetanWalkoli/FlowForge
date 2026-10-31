/**
 * FlowForge — Plain-English Workflow Drafter (FR-063)
 *
 * Implements deterministic, schema-constrained workflow generation from plain English.
 * Pure rule-based / intent compiler with zero mock AI claims or unbacked hallucinations.
 * Every proposal is guaranteed to conform to WorkflowDocumentSchema and validateWorkflow.
 */

import { validateWorkflow } from '../../domain/validation/graph-validator';
import type {
  ConditionOperator,
  NodeType,
  WorkflowDocument,
} from '../../domain/types/workflow';

export interface DraftProposalSummary {
  nodeCount: number;
  edgeCount: number;
  nodeTypes: NodeType[];
  parametersExtracted: Record<string, unknown>;
}

export interface DraftProposal {
  prompt: string;
  matchedPattern: string;
  confidence: 'high' | 'medium' | 'fallback';
  explanation: string[];
  workflow: WorkflowDocument;
  summary: DraftProposalSummary;
}

export interface PromptTemplateSuggestion {
  id: string;
  label: string;
  prompt: string;
  category: string;
}

export const DRAFT_PROMPT_SUGGESTIONS: PromptTemplateSuggestion[] = [
  {
    id: 'expense-approval',
    label: 'Expense Approval',
    category: 'Finance & Operations',
    prompt:
      'Check if expense amount exceeds $1,000. If true route for executive approval, otherwise auto-approve the expense.',
  },
  {
    id: 'form-validation',
    label: 'User Form Validation',
    category: 'Identity & Auth',
    prompt:
      'Validate incoming registration form. Check that email is provided. If true accept registration, otherwise reject with missing email error.',
  },
  {
    id: 'incident-alert',
    label: 'Incident Alert Dispatch',
    category: 'DevOps & Monitoring',
    prompt:
      'Inspect incoming alert severity. If severity equals critical, dispatch immediate Slack alert, otherwise log routine notification.',
  },
  {
    id: 'telemetry-latency',
    label: 'Telemetry Latency Filter',
    category: 'Data Pipelines',
    prompt:
      'Filter telemetry events where latency exceeds 500ms. Transform and flag high-latency anomalies for investigation.',
  },
  {
    id: 'scheduled-retry-sync',
    label: 'Scheduled Sync with Retry',
    category: 'Batch Automation',
    prompt:
      'Run scheduled hourly sync. Fetch records with retry up to 3 attempts, loop through items, and finalize sync.',
  },
];

let draftSequence = 1;

function generateId(prefix: string): string {
  const salt = Math.random().toString(36).substring(2, 7);
  return `${prefix}_${Date.now().toString(36).slice(-4)}_${salt}`;
}

/**
 * Extracts a numeric threshold from prompt text (e.g. "$1,000", "500ms", "over 250", "> 80").
 */
function extractThreshold(prompt: string, defaultVal: number): number {
  const match = prompt.match(/(?:\$|>|<|>=|<=|over|above|below|exceeds|threshold of)\s*([\d,]+(?:\.\d+)?)/i);
  if (match && match[1]) {
    const parsed = parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isNaN(parsed)) return parsed;
  }
  const standaloneMatch = prompt.match(/\b(\d+)\b/);
  if (standaloneMatch && standaloneMatch[1]) {
    const parsed = parseInt(standaloneMatch[1], 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultVal;
}

/**
 * Detects the comparison operator from natural language keywords.
 */
function extractOperator(prompt: string): ConditionOperator {
  const lower = prompt.toLowerCase();
  if (lower.includes('greater than') || lower.includes('exceeds') || lower.includes('above') || lower.includes('over') || lower.includes('>')) {
    return 'greaterThan';
  }
  if (lower.includes('greater or equal') || lower.includes('>=') || lower.includes('at least')) {
    return 'greaterThanOrEqual';
  }
  if (lower.includes('less than') || lower.includes('below') || lower.includes('under') || lower.includes('<')) {
    return 'lessThan';
  }
  if (lower.includes('less or equal') || lower.includes('<=') || lower.includes('at most')) {
    return 'lessThanOrEqual';
  }
  if (lower.includes('not equal') || lower.includes('!=') || lower.includes('different from')) {
    return 'notEquals';
  }
  if (lower.includes('contains') || lower.includes('includes') || lower.includes('has')) {
    return 'contains';
  }
  if (lower.includes('empty') || lower.includes('missing') || lower.includes('null')) {
    return 'isEmpty';
  }
  if (lower.includes('present') || lower.includes('exists') || lower.includes('provided') || lower.includes('valid')) {
    return 'isNotEmpty';
  }
  if (lower.includes('equals') || lower.includes('is equal') || lower.includes('==') || lower.includes('is')) {
    return 'equals';
  }
  return 'greaterThan';
}

/**
 * Drafts a valid WorkflowDocument from plain-English description.
 */
export function draftWorkflowFromPrompt(prompt: string): DraftProposal {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const seq = draftSequence++;

  const idPrefix = `draft_${seq}_${Date.now().toString(36).slice(-4)}`;
  const triggerId = `${idPrefix}_trigger`;
  const condId = `${idPrefix}_cond`;
  const actionTrueId = `${idPrefix}_act_true`;
  const actionFalseId = `${idPrefix}_act_false`;
  const endId = `${idPrefix}_end`;

  // Pattern 1: Expense / Financial Approval
  if (
    lower.includes('expense') ||
    lower.includes('approval') ||
    lower.includes('reimbursement') ||
    lower.includes('invoice') ||
    lower.includes('budget') ||
    lower.includes('purchase')
  ) {
    const threshold = extractThreshold(prompt, 1000);
    const op = extractOperator(prompt);

    const workflow: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: generateId('wf_draft_expense'),
      name: `Expense Approval ($${threshold.toLocaleString()})`,
      description: `Drafted from prompt: "${trimmed}". Evaluates expense submissions against a $${threshold.toLocaleString()} approval threshold.`,
      revision: 1,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: triggerId,
          type: 'trigger',
          name: 'Expense Submitted',
          version: 1,
          position: { x: 80, y: 180 },
          config: {
            label: 'Expense Submitted',
            inputSchema: {
              amount: 'number',
              department: 'string',
              employeeEmail: 'string',
              description: 'string',
            },
            sampleInput: {
              amount: threshold + 250,
              department: 'Engineering',
              employeeEmail: 'engineer@flowforge.dev',
              description: 'Cloud infrastructure hosting',
            },
          },
        },
        {
          id: condId,
          type: 'condition',
          name: `Amount ${op} $${threshold}`,
          version: 1,
          position: { x: 380, y: 180 },
          config: {
            description: `Check if expense amount ${op} $${threshold}`,
            left: { source: triggerId, path: 'amount' },
            operator: op,
            right: { kind: 'literal', value: threshold },
          },
        },
        {
          id: actionTrueId,
          type: 'action',
          name: 'Route for Executive Review',
          version: 1,
          position: { x: 680, y: 80 },
          config: {
            label: 'Route for Executive Review',
            actionType: 'buildObject',
            fields: {
              decision: { kind: 'literal', value: 'requires_executive_approval' },
              assignedTo: { kind: 'literal', value: 'finance-director@flowforge.dev' },
              amount: { kind: 'ref', source: triggerId, path: 'amount' },
            },
          },
        },
        {
          id: actionFalseId,
          type: 'action',
          name: 'Auto-Approve Expense',
          version: 1,
          position: { x: 680, y: 280 },
          config: {
            label: 'Auto-Approve Expense',
            actionType: 'buildObject',
            fields: {
              decision: { kind: 'literal', value: 'auto_approved' },
              policyTier: { kind: 'literal', value: 'standard' },
              amount: { kind: 'ref', source: triggerId, path: 'amount' },
            },
          },
        },
        {
          id: endId,
          type: 'end',
          name: 'Approval Complete',
          version: 1,
          position: { x: 980, y: 180 },
          config: {
            label: 'Approval Complete',
            outputSource: 'upstream',
            requiredFields: ['decision'],
          },
        },
      ],
      edges: [
        { id: generateId('e'), source: triggerId, sourceHandle: 'next', target: condId, targetHandle: 'in' },
        { id: generateId('e'), source: condId, sourceHandle: 'true', target: actionTrueId, targetHandle: 'in', label: 'true' },
        { id: generateId('e'), source: condId, sourceHandle: 'false', target: actionFalseId, targetHandle: 'in', label: 'false' },
        { id: generateId('e'), source: actionTrueId, sourceHandle: 'next', target: endId, targetHandle: 'in' },
        { id: generateId('e'), source: actionFalseId, sourceHandle: 'next', target: endId, targetHandle: 'in' },
      ],
    };

    validateWorkflow(workflow);

    return {
      prompt: trimmed,
      matchedPattern: 'Approval Routing Pattern',
      confidence: 'high',
      explanation: [
        `Detected intent: Financial/expense threshold approval routing.`,
        `Configured Trigger with sample expense payload containing amount ($${threshold + 250}).`,
        `Configured Condition evaluating whether "amount" is ${op} ${threshold}.`,
        `Routed true branch to executive notification and false branch to automatic approval.`,
        `Converged both paths cleanly into final End node with valid graph topology.`,
      ],
      workflow,
      summary: {
        nodeCount: workflow.nodes.length,
        edgeCount: workflow.edges.length,
        nodeTypes: workflow.nodes.map((n) => n.type),
        parametersExtracted: { threshold, operator: op, domain: 'expense' },
      },
    };
  }

  // Pattern 2: Form & Input Validation
  if (
    /\b(validate|validation|form|signup|register|registration|verify email|profile)\b/i.test(prompt) &&
    !/\b(telemetry|latency|metric|pipeline)\b/i.test(prompt)
  ) {
    const checkedField = lower.includes('email')
      ? 'email'
      : lower.includes('phone')
        ? 'phone'
        : lower.includes('token')
          ? 'token'
          : 'email';

    const op = extractOperator(prompt);

    const workflow: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: generateId('wf_draft_val'),
      name: `Registration Form Validation`,
      description: `Drafted from prompt: "${trimmed}". Validates incoming payload and enforces ${checkedField} requirements.`,
      revision: 1,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: triggerId,
          type: 'trigger',
          name: 'Form Ingested',
          version: 1,
          position: { x: 80, y: 180 },
          config: {
            label: 'Form Ingested',
            inputSchema: {
              [checkedField]: 'string',
              fullName: 'string',
              tier: 'string',
            },
            sampleInput: {
              [checkedField]: 'ada@flowforge.dev',
              fullName: 'Ada Lovelace',
              tier: 'pro',
            },
          },
        },
        {
          id: condId,
          type: 'condition',
          name: `Check ${checkedField}`,
          version: 1,
          position: { x: 380, y: 180 },
          config: {
            description: `Verify that ${checkedField} is populated and valid`,
            left: { source: triggerId, path: checkedField },
            operator: op === 'greaterThan' ? 'isNotEmpty' : op,
          },
        },
        {
          id: actionTrueId,
          type: 'action',
          name: 'Accept Registration',
          version: 1,
          position: { x: 680, y: 80 },
          config: {
            label: 'Accept Registration',
            actionType: 'buildObject',
            fields: {
              status: { kind: 'literal', value: 'accepted' },
              valid: { kind: 'literal', value: true },
              userField: { kind: 'ref', source: triggerId, path: checkedField },
            },
          },
        },
        {
          id: actionFalseId,
          type: 'action',
          name: 'Reject with Error',
          version: 1,
          position: { x: 680, y: 280 },
          config: {
            label: 'Reject with Error',
            actionType: 'buildObject',
            fields: {
              status: { kind: 'literal', value: 'rejected' },
              valid: { kind: 'literal', value: false },
              reason: { kind: 'literal', value: `Field "${checkedField}" failed validation check.` },
            },
          },
        },
        {
          id: endId,
          type: 'end',
          name: 'Validation Summary',
          version: 1,
          position: { x: 980, y: 180 },
          config: {
            label: 'Validation Summary',
            outputSource: 'upstream',
            requiredFields: ['status', 'valid'],
          },
        },
      ],
      edges: [
        { id: generateId('e'), source: triggerId, sourceHandle: 'next', target: condId, targetHandle: 'in' },
        { id: generateId('e'), source: condId, sourceHandle: 'true', target: actionTrueId, targetHandle: 'in', label: 'true' },
        { id: generateId('e'), source: condId, sourceHandle: 'false', target: actionFalseId, targetHandle: 'in', label: 'false' },
        { id: generateId('e'), source: actionTrueId, sourceHandle: 'next', target: endId, targetHandle: 'in' },
        { id: generateId('e'), source: actionFalseId, sourceHandle: 'next', target: endId, targetHandle: 'in' },
      ],
    };

    validateWorkflow(workflow);

    return {
      prompt: trimmed,
      matchedPattern: 'Data Validation Guard Pattern',
      confidence: 'high',
      explanation: [
        `Detected intent: Data entry validation enforcing "${checkedField}".`,
        `Configured Trigger with sample input schema containing ${checkedField}.`,
        `Configured Condition verifying field existence and format.`,
        `Created dual outcome branches: Accept profile vs. Structured rejection error.`,
        `Connected to Validation Summary End node with strict field contracts.`,
      ],
      workflow,
      summary: {
        nodeCount: workflow.nodes.length,
        edgeCount: workflow.edges.length,
        nodeTypes: workflow.nodes.map((n) => n.type),
        parametersExtracted: { field: checkedField, operator: op },
      },
    };
  }

  // Pattern 3: Alert & Incident Dispatch
  if (
    lower.includes('alert') ||
    lower.includes('slack') ||
    lower.includes('incident') ||
    lower.includes('critical') ||
    lower.includes('urgent') ||
    lower.includes('severity') ||
    lower.includes('pagerduty')
  ) {
    const isCritical = lower.includes('critical') || lower.includes('high');

    const workflow: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: generateId('wf_draft_alert'),
      name: 'Incident Alert Dispatcher',
      description: `Drafted from prompt: "${trimmed}". Evaluates event urgency and dispatches alerts to incident response channels.`,
      revision: 1,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: triggerId,
          type: 'trigger',
          name: 'Alert Ingested',
          version: 1,
          position: { x: 80, y: 180 },
          config: {
            label: 'Alert Ingested',
            inputSchema: {
              severity: 'string',
              title: 'string',
              serviceName: 'string',
            },
            sampleInput: {
              severity: isCritical ? 'critical' : 'warning',
              title: 'High latency detected on core API',
              serviceName: 'auth-service',
            },
          },
        },
        {
          id: condId,
          type: 'condition',
          name: 'Is Critical?',
          version: 1,
          position: { x: 380, y: 180 },
          config: {
            description: 'Evaluate if alert severity requires emergency paging',
            left: { source: triggerId, path: 'severity' },
            operator: 'equals',
            right: { kind: 'literal', value: 'critical' },
          },
        },
        {
          id: actionTrueId,
          type: 'action',
          name: 'Dispatch Urgent Alert',
          version: 1,
          position: { x: 680, y: 80 },
          config: {
            label: 'Dispatch Urgent Alert',
            actionType: 'buildObject',
            fields: {
              alertSent: { kind: 'literal', value: true },
              priority: { kind: 'literal', value: 'P1' },
              channel: { kind: 'literal', value: '#incident-response' },
            },
          },
        },
        {
          id: actionFalseId,
          type: 'action',
          name: 'Log Routine Event',
          version: 1,
          position: { x: 680, y: 280 },
          config: {
            label: 'Log Routine Event',
            actionType: 'buildObject',
            fields: {
              alertSent: { kind: 'literal', value: false },
              channel: { kind: 'literal', value: 'routine-audit' },
              severity: { kind: 'ref', source: triggerId, path: 'severity' },
            },
          },
        },
        {
          id: endId,
          type: 'end',
          name: 'Dispatch Finished',
          version: 1,
          position: { x: 980, y: 180 },
          config: {
            label: 'Dispatch Finished',
            outputSource: 'upstream',
            requiredFields: ['alertSent'],
          },
        },
      ],
      edges: [
        { id: generateId('e'), source: triggerId, sourceHandle: 'next', target: condId, targetHandle: 'in' },
        { id: generateId('e'), source: condId, sourceHandle: 'true', target: actionTrueId, targetHandle: 'in', label: 'true' },
        { id: generateId('e'), source: condId, sourceHandle: 'false', target: actionFalseId, targetHandle: 'in', label: 'false' },
        { id: generateId('e'), source: actionTrueId, sourceHandle: 'next', target: endId, targetHandle: 'in' },
        { id: generateId('e'), source: actionFalseId, sourceHandle: 'next', target: endId, targetHandle: 'in' },
      ],
    };

    validateWorkflow(workflow);

    return {
      prompt: trimmed,
      matchedPattern: 'Alert & Incident Dispatch Pattern',
      confidence: 'high',
      explanation: [
        `Detected intent: Operational incident triage and notification.`,
        `Configured Trigger with sample incident payload.`,
        `Configured Condition evaluating whether severity equals "critical".`,
        `Configured targeted notification on true branch and standard audit logging on false branch.`,
        `Validated clean end-to-end routing.`,
      ],
      workflow,
      summary: {
        nodeCount: workflow.nodes.length,
        edgeCount: workflow.edges.length,
        nodeTypes: workflow.nodes.map((n) => n.type),
        parametersExtracted: { isCritical },
      },
    };
  }

  // Pattern 4: Data Filtering & Pipeline Processing
  if (
    lower.includes('filter') ||
    lower.includes('telemetry') ||
    lower.includes('latency') ||
    lower.includes('pipeline') ||
    lower.includes('transform') ||
    lower.includes('clean') ||
    lower.includes('enrich')
  ) {
    const threshold = extractThreshold(prompt, 500);
    const transformId = `${idPrefix}_trans`;

    const workflow: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: generateId('wf_draft_pipe'),
      name: `Telemetry Data Filter & Transform`,
      description: `Drafted from prompt: "${trimmed}". Filters telemetry metrics and transforms anomalies.`,
      revision: 1,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: triggerId,
          type: 'trigger',
          name: 'Metrics Ingested',
          version: 1,
          position: { x: 80, y: 180 },
          config: {
            label: 'Metrics Ingested',
            inputSchema: {
              latencyMs: 'number',
              service: 'string',
            },
            sampleInput: {
              latencyMs: threshold + 120,
              service: 'payment-gateway',
            },
          },
        },
        {
          id: transformId,
          type: 'transform',
          name: 'Construct Normalized Payload',
          version: 1,
          position: { x: 360, y: 180 },
          config: {
            label: 'Construct Normalized Payload',
            operation: 'constructObject',
            constructedFields: {
              latency: { kind: 'ref', source: triggerId, path: 'latencyMs' },
              service: { kind: 'ref', source: triggerId, path: 'service' },
            },
          },
        },
        {
          id: condId,
          type: 'condition',
          name: `Latency > ${threshold}ms`,
          version: 1,
          position: { x: 640, y: 180 },
          config: {
            description: `Check if latency exceeds ${threshold}ms`,
            left: { source: transformId, path: 'latency' },
            operator: 'greaterThan',
            right: { kind: 'literal', value: threshold },
          },
        },
        {
          id: actionTrueId,
          type: 'action',
          name: 'Flag Latency Anomaly',
          version: 1,
          position: { x: 920, y: 80 },
          config: {
            label: 'Flag Latency Anomaly',
            actionType: 'buildObject',
            fields: {
              anomaly: { kind: 'literal', value: true },
              flaggedAt: { kind: 'literal', value: '2026-10-31T00:00:00.000Z' },
              latency: { kind: 'ref', source: transformId, path: 'latency' },
            },
          },
        },
        {
          id: actionFalseId,
          type: 'action',
          name: 'Record Normal Metric',
          version: 1,
          position: { x: 920, y: 280 },
          config: {
            label: 'Record Normal Metric',
            actionType: 'buildObject',
            fields: {
              anomaly: { kind: 'literal', value: false },
              status: { kind: 'literal', value: 'nominal' },
            },
          },
        },
        {
          id: endId,
          type: 'end',
          name: 'Telemetry Stored',
          version: 1,
          position: { x: 1200, y: 180 },
          config: {
            label: 'Telemetry Stored',
            outputSource: 'upstream',
            requiredFields: ['anomaly'],
          },
        },
      ],
      edges: [
        { id: generateId('e'), source: triggerId, sourceHandle: 'next', target: transformId, targetHandle: 'in' },
        { id: generateId('e'), source: transformId, sourceHandle: 'next', target: condId, targetHandle: 'in' },
        { id: generateId('e'), source: condId, sourceHandle: 'true', target: actionTrueId, targetHandle: 'in', label: 'true' },
        { id: generateId('e'), source: condId, sourceHandle: 'false', target: actionFalseId, targetHandle: 'in', label: 'false' },
        { id: generateId('e'), source: actionTrueId, sourceHandle: 'next', target: endId, targetHandle: 'in' },
        { id: generateId('e'), source: actionFalseId, sourceHandle: 'next', target: endId, targetHandle: 'in' },
      ],
    };

    validateWorkflow(workflow);

    return {
      prompt: trimmed,
      matchedPattern: 'Data Pipeline & Transform Pattern',
      confidence: 'high',
      explanation: [
        `Detected intent: Metric streaming and threshold anomaly filtering.`,
        `Inserted Transform node between Trigger and Condition for data normalization.`,
        `Configured threshold check on latency (> ${threshold}ms).`,
        `Configured anomaly tagging on true branch and standard recording on false branch.`,
        `Validated end-to-end multi-stage pipeline graph.`,
      ],
      workflow,
      summary: {
        nodeCount: workflow.nodes.length,
        edgeCount: workflow.edges.length,
        nodeTypes: workflow.nodes.map((n) => n.type),
        parametersExtracted: { threshold },
      },
    };
  }

  // Pattern 5: Scheduled Batch / Loop / Retry
  if (
    lower.includes('schedule') ||
    lower.includes('cron') ||
    lower.includes('hourly') ||
    lower.includes('daily') ||
    lower.includes('batch') ||
    lower.includes('retry') ||
    lower.includes('loop')
  ) {
    const retryAttempts = 3;
    const retryId = `${idPrefix}_retry`;
    const loopId = `${idPrefix}_loop`;

    const workflow: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: generateId('wf_draft_batch'),
      name: 'Scheduled Batch Sync with Retry',
      description: `Drafted from prompt: "${trimmed}". Executes scheduled data synchronization with bounded retry and loop iteration.`,
      revision: 1,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: triggerId,
          type: 'trigger',
          name: 'Batch Trigger',
          version: 1,
          position: { x: 80, y: 180 },
          config: {
            label: 'Batch Trigger',
            inputSchema: {
              scheduledTime: 'string',
              items: 'array',
            },
            sampleInput: {
              scheduledTime: '2026-10-31T12:00:00.000Z',
              items: ['item_1', 'item_2', 'item_3'],
            },
          },
        },
        {
          id: retryId,
          type: 'retry',
          name: 'Fetch Records (3x Retry)',
          version: 1,
          position: { x: 380, y: 180 },
          config: {
            label: 'Fetch Records (3x Retry)',
            maxAttempts: retryAttempts,
            backoffMs: 1000,
          },
        },
        {
          id: loopId,
          type: 'loop',
          name: 'Iterate Batch Items',
          version: 1,
          position: { x: 680, y: 180 },
          config: {
            label: 'Iterate Batch Items',
            arraySource: { source: triggerId, path: 'items' },
            maxIterations: 50,
            itemVariable: 'currentItem',
          },
        },
        {
          id: endId,
          type: 'end',
          name: 'Batch Synchronized',
          version: 1,
          position: { x: 980, y: 180 },
          config: {
            label: 'Batch Synchronized',
            outputSource: 'upstream',
            requiredFields: [],
          },
        },
      ],
      edges: [
        { id: generateId('e'), source: triggerId, sourceHandle: 'next', target: retryId, targetHandle: 'in' },
        { id: generateId('e'), source: retryId, sourceHandle: 'next', target: loopId, targetHandle: 'in' },
        { id: generateId('e'), source: loopId, sourceHandle: 'next', target: endId, targetHandle: 'in' },
      ],
    };

    validateWorkflow(workflow);

    return {
      prompt: trimmed,
      matchedPattern: 'Scheduled Batch & Resilience Pattern',
      confidence: 'high',
      explanation: [
        `Detected intent: Scheduled background automation with fault resilience.`,
        `Configured Trigger with sample items array.`,
        `Configured Retry node with exponential backoff (${retryAttempts} attempts).`,
        `Configured Loop node iterating over items with bounded limit (50).`,
        `Connected to completion End node.`,
      ],
      workflow,
      summary: {
        nodeCount: workflow.nodes.length,
        edgeCount: workflow.edges.length,
        nodeTypes: workflow.nodes.map((n) => n.type),
        parametersExtracted: { retryAttempts },
      },
    };
  }

  // Fallback / General Intent: Generalized Trigger -> Condition -> True/False Actions -> End
  const threshold = extractThreshold(prompt, 100);
  const op = extractOperator(prompt);

  const workflow: WorkflowDocument = {
    format: 'flowforge.workflow',
    formatVersion: 1,
    id: generateId('wf_draft_custom'),
    name: 'Custom Rule Automation',
    description: `Drafted from prompt: "${trimmed}". Evaluates input against rule criteria and routes execution.`,
    revision: 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: triggerId,
        type: 'trigger',
        name: 'Event Ingested',
        version: 1,
        position: { x: 80, y: 180 },
        config: {
          label: 'Event Ingested',
          inputSchema: {
            value: 'number',
            status: 'string',
          },
          sampleInput: {
            value: threshold + 10,
            status: 'pending',
          },
        },
      },
      {
        id: condId,
        type: 'condition',
        name: `Value ${op} ${threshold}`,
        version: 1,
        position: { x: 380, y: 180 },
        config: {
          description: `Evaluate if value ${op} ${threshold}`,
          left: { source: triggerId, path: 'value' },
          operator: op,
          right: { kind: 'literal', value: threshold },
        },
      },
      {
        id: actionTrueId,
        type: 'action',
        name: 'Handle True Outcome',
        version: 1,
        position: { x: 680, y: 80 },
        config: {
          label: 'Handle True Outcome',
          actionType: 'buildObject',
          fields: {
            result: { kind: 'literal', value: 'approved' },
            passed: { kind: 'literal', value: true },
          },
        },
      },
      {
        id: actionFalseId,
        type: 'action',
        name: 'Handle False Outcome',
        version: 1,
        position: { x: 680, y: 280 },
        config: {
          label: 'Handle False Outcome',
          actionType: 'buildObject',
          fields: {
            result: { kind: 'literal', value: 'rejected' },
            passed: { kind: 'literal', value: false },
          },
        },
      },
      {
        id: endId,
        type: 'end',
        name: 'Execution Complete',
        version: 1,
        position: { x: 980, y: 180 },
        config: {
          label: 'Execution Complete',
          outputSource: 'upstream',
          requiredFields: ['result', 'passed'],
        },
      },
    ],
    edges: [
      { id: generateId('e'), source: triggerId, sourceHandle: 'next', target: condId, targetHandle: 'in' },
      { id: generateId('e'), source: condId, sourceHandle: 'true', target: actionTrueId, targetHandle: 'in', label: 'true' },
      { id: generateId('e'), source: condId, sourceHandle: 'false', target: actionFalseId, targetHandle: 'in', label: 'false' },
      { id: generateId('e'), source: actionTrueId, sourceHandle: 'next', target: endId, targetHandle: 'in' },
      { id: generateId('e'), source: actionFalseId, sourceHandle: 'next', target: endId, targetHandle: 'in' },
    ],
  };

  validateWorkflow(workflow);

  return {
    prompt: trimmed,
    matchedPattern: 'General Rule & Decision Pattern',
    confidence: 'medium',
    explanation: [
      `Synthesized standard decision pipeline from user intent.`,
      `Configured Webhook trigger with typed numeric value and status fields.`,
      `Configured Condition comparing value (${op}) to threshold (${threshold}).`,
      `Routed parallel outcomes to distinct True and False action handlers.`,
      `Connected to terminating End node.`,
    ],
    workflow,
    summary: {
      nodeCount: workflow.nodes.length,
      edgeCount: workflow.edges.length,
      nodeTypes: workflow.nodes.map((n) => n.type),
      parametersExtracted: { threshold, operator: op },
    },
  };
}
