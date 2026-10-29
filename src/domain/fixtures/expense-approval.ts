/**
 * FlowForge — Sample Expense Approval Workflow Fixture
 * Canonical MVP workflow defined in PRD.md §4.1, §7, §8, and §12 Phase 0.
 * Structure: Trigger -> Condition (amount <= 10000) -> True Action (Auto-approve) / False Action (Manual review) -> End
 */

import type { WorkflowDocument } from '../types/workflow';

export const EXPENSE_APPROVAL_WORKFLOW: WorkflowDocument = {
  format: 'flowforge.workflow',
  formatVersion: 1,
  id: 'wf_expense_approval',
  name: 'Expense approval',
  description:
    'Routes submitted employee expenses based on a $10,000 threshold into automatic approval or executive manual review.',
  revision: 1,
  status: 'validated',
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
  nodes: [
    {
      id: 'trigger_1',
      type: 'trigger',
      name: 'Expense submitted',
      version: 1,
      position: { x: 80, y: 200 },
      config: {
        label: 'Expense submitted',
        inputSchema: {
          amount: 'number',
          requester: 'string',
          department: 'string',
        },
        sampleInput: {
          amount: 4250,
          requester: 'ada@flowforge.dev',
          department: 'Core Platform',
        },
      },
    },
    {
      id: 'condition_1',
      type: 'condition',
      name: 'Threshold check (<= $10k)',
      version: 1,
      position: { x: 360, y: 200 },
      config: {
        description: 'Approve automatically when amount is $10,000 or less',
        left: {
          source: 'trigger_1',
          path: 'amount',
        },
        operator: 'lessThanOrEqual',
        right: {
          kind: 'literal',
          value: 10000,
        },
      },
    },
    {
      id: 'action_approve',
      type: 'action',
      name: 'Auto-approve expense',
      version: 1,
      position: { x: 660, y: 90 },
      config: {
        label: 'Auto-approve expense',
        actionType: 'buildObject',
        fields: {
          decision: { kind: 'literal', value: 'approved' },
          routing: { kind: 'literal', value: 'automatic' },
          amount: { kind: 'ref', source: 'trigger_1', path: 'amount' },
          requester: { kind: 'ref', source: 'trigger_1', path: 'requester' },
        },
      },
    },
    {
      id: 'action_review',
      type: 'action',
      name: 'Route to manual review',
      version: 1,
      position: { x: 660, y: 310 },
      config: {
        label: 'Route to manual review',
        actionType: 'buildObject',
        fields: {
          decision: { kind: 'literal', value: 'manual_review' },
          routing: { kind: 'literal', value: 'finance_committee' },
          amount: { kind: 'ref', source: 'trigger_1', path: 'amount' },
          requester: { kind: 'ref', source: 'trigger_1', path: 'requester' },
        },
      },
    },
    {
      id: 'end_1',
      type: 'end',
      name: 'Decision complete',
      version: 1,
      position: { x: 960, y: 200 },
      config: {
        label: 'Decision complete',
        outputSource: 'upstream',
        requiredFields: ['decision', 'routing', 'amount'],
      },
    },
  ],
  edges: [
    {
      id: 'edge_trigger_to_cond',
      source: 'trigger_1',
      sourceHandle: 'next',
      target: 'condition_1',
      targetHandle: 'in',
    },
    {
      id: 'edge_cond_true',
      source: 'condition_1',
      sourceHandle: 'true',
      target: 'action_approve',
      targetHandle: 'in',
      label: 'true',
    },
    {
      id: 'edge_cond_false',
      source: 'condition_1',
      sourceHandle: 'false',
      target: 'action_review',
      targetHandle: 'in',
      label: 'false',
    },
    {
      id: 'edge_approve_to_end',
      source: 'action_approve',
      sourceHandle: 'next',
      target: 'end_1',
      targetHandle: 'in',
    },
    {
      id: 'edge_review_to_end',
      source: 'action_review',
      sourceHandle: 'next',
      target: 'end_1',
      targetHandle: 'in',
    },
  ],
};

