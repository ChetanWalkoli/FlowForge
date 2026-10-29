import { describe, expect, it } from 'vitest';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import {
  arePortTypesCompatible,
  getNodeSpecification,
  NODE_REGISTRY,
} from '../domain/registry/node-registry';
import {
  validateConnection,
  validateWorkflow,
} from '../domain/validation/graph-validator';
import {
  MAX_IMPORT_BYTES,
  parseWorkflowDocument,
  WorkflowDocumentSchema,
} from '../schemas/workflow-schema';
import type { WorkflowDocument } from '../domain/types/workflow';

describe('Domain Schemas & Expense Approval Fixture', () => {
  it('validates the canonical Expense Approval workflow fixture without errors', () => {
    const parseResult = parseWorkflowDocument(EXPENSE_APPROVAL_WORKFLOW);
    expect(parseResult.success).toBe(true);
    expect(parseResult.errors).toHaveLength(0);

    const report = validateWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    expect(report.valid).toBe(true);
    expect(report.canExecute).toBe(true);
    expect(report.errorsCount).toBe(0);
    expect(report.warningsCount).toBe(0);
  });

  it('rejects malformed or oversized JSON strings safely', () => {
    const malformed = parseWorkflowDocument('{ invalid json');
    expect(malformed.success).toBe(false);
    expect(malformed.errors[0]).toMatch(/Malformed JSON/);

    const oversized = 'x'.repeat(MAX_IMPORT_BYTES + 10);
    const oversizedResult = parseWorkflowDocument(oversized);
    expect(oversizedResult.success).toBe(false);
    expect(oversizedResult.errors[0]).toMatch(/exceeds maximum allowed size/);
  });

  it('rejects binary condition operators when right operand is missing', () => {
    const broken: WorkflowDocument = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
    const condNode = broken.nodes.find((n) => n.type === 'condition');
    if (condNode && condNode.type === 'condition') {
      delete condNode.config.right;
    }

    const schemaResult = WorkflowDocumentSchema.safeParse(broken);
    expect(schemaResult.success).toBe(false);
    if (!schemaResult.success) {
      expect(schemaResult.error.issues[0].message).toMatch(
        /requires a right-hand operand/,
      );
    }
  });

  it('allows unary condition operators (isEmpty, isNotEmpty) without right operand', () => {
    const unaryDoc: WorkflowDocument = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
    const condNode = unaryDoc.nodes.find((n) => n.type === 'condition');
    if (condNode && condNode.type === 'condition') {
      condNode.config.operator = 'isNotEmpty';
      delete condNode.config.right;
    }

    const schemaResult = WorkflowDocumentSchema.safeParse(unaryDoc);
    expect(schemaResult.success).toBe(true);
  });
});

describe('Node Registry & Port Compatibility', () => {
  it('defines specifications and default configs for all 5 MVP node types', () => {
    const mvpTypes = ['trigger', 'condition', 'action', 'transform', 'end'] as const;
    for (const type of mvpTypes) {
      const spec = getNodeSpecification(type);
      expect(spec.isMvp).toBe(true);
      expect(spec.createDefaultConfig()).toBeDefined();
    }
    expect(Object.keys(NODE_REGISTRY).length).toBeGreaterThanOrEqual(5);
  });

  it('checks port type compatibility accurately', () => {
    expect(arePortTypesCompatible('number', 'number')).toBe(true);
    expect(arePortTypesCompatible('object', 'any')).toBe(true);
    expect(arePortTypesCompatible('any', 'string')).toBe(true);
    expect(arePortTypesCompatible('number', 'boolean')).toBe(false);
  });

  it('rejects invalid connections (self-loops, incoming to trigger, outgoing from end, duplicates)', () => {
    const nodes = EXPENSE_APPROVAL_WORKFLOW.nodes;
    const edges = EXPENSE_APPROVAL_WORKFLOW.edges;

    // Self-loop
    expect(
      validateConnection(nodes, edges, {
        source: 'condition_1',
        sourceHandle: 'true',
        target: 'condition_1',
        targetHandle: 'in',
      }),
    ).toEqual({
      valid: false,
      reason: 'Self-connections on the same node are not allowed.',
    });

    // Incoming to Trigger
    expect(
      validateConnection(nodes, edges, {
        source: 'action_approve',
        sourceHandle: 'next',
        target: 'trigger_1',
        targetHandle: 'in',
      }),
    ).toEqual({
      valid: false,
      reason:
        'Trigger nodes are entry points and cannot receive incoming connections.',
    });

    // Outgoing from End
    expect(
      validateConnection(nodes, edges, {
        source: 'end_1',
        sourceHandle: 'next',
        target: 'action_approve',
        targetHandle: 'in',
      }),
    ).toEqual({
      valid: false,
      reason: 'End nodes are terminal and cannot have outgoing connections.',
    });

    // Duplicate connection
    expect(
      validateConnection(nodes, edges, {
        source: 'trigger_1',
        sourceHandle: 'next',
        target: 'condition_1',
        targetHandle: 'in',
      }),
    ).toEqual({
      valid: false,
      reason: 'A connection between these exact ports already exists.',
    });
  });
});

describe('Static Graph Validator', () => {
  it('detects missing Trigger and End nodes', () => {
    const noTrigger: WorkflowDocument = {
      ...structuredClone(EXPENSE_APPROVAL_WORKFLOW),
      nodes: EXPENSE_APPROVAL_WORKFLOW.nodes.filter((n) => n.type !== 'trigger'),
      edges: [],
    };
    const report = validateWorkflow(noTrigger);
    expect(report.canExecute).toBe(false);
    expect(report.issues.some((i) => i.code === 'MISSING_TRIGGER')).toBe(true);
  });

  it('detects unreachable nodes and disconnected inputs', () => {
    const doc = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
    doc.nodes.push({
      id: 'orphan_action',
      type: 'action',
      name: 'Orphan Step',
      version: 1,
      position: { x: 500, y: 500 },
      config: {
        label: 'Orphan Step',
        actionType: 'appendLog',
        logMessage: 'Unreachable',
      },
    });

    const report = validateWorkflow(doc);
    expect(report.canExecute).toBe(false);
    expect(
      report.issues.some(
        (i) => i.code === 'UNREACHABLE_NODE' && i.nodeId === 'orphan_action',
      ),
    ).toBe(true);
  });

  it('detects unsupported cycles in workflow graphs', () => {
    const cyclic = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
    cyclic.edges.push({
      id: 'edge_cycle',
      source: 'action_approve',
      sourceHandle: 'next',
      target: 'condition_1',
      targetHandle: 'in',
    });

    const report = validateWorkflow(cyclic);
    expect(report.canExecute).toBe(false);
    expect(report.issues.some((i) => i.code === 'CYCLE_DETECTED')).toBe(true);
  });

  it('warns when a condition node has only one branch connected', () => {
    const singleBranch = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
    singleBranch.edges = singleBranch.edges.filter(
      (e) => e.id !== 'edge_cond_false' && e.id !== 'edge_review_to_end',
    );
    singleBranch.nodes = singleBranch.nodes.filter(
      (n) => n.id !== 'action_review',
    );

    const report = validateWorkflow(singleBranch);
    expect(report.canExecute).toBe(true);
    expect(report.warningsCount).toBe(1);
    expect(
      report.issues.some((i) => i.code === 'INCOMPLETE_CONDITION_BRANCH'),
    ).toBe(true);
  });
});

