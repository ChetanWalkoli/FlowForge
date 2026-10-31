import { describe, expect, it } from 'vitest';
import { getNodeSpecification } from '../domain/registry/node-registry';
import type { WorkflowDocument } from '../domain/types/workflow';
import { validateWorkflow } from '../domain/validation/graph-validator';
import { executeWorkflow } from '../engine';

describe('Task 3 — Subflow Node (FR-016)', () => {
  const createChildWorkflow = (id: string, name: string): WorkflowDocument => ({
    format: 'flowforge.workflow',
    formatVersion: 1,
    id,
    name,
    revision: 1,
    status: 'draft',
    nodes: [
      {
        id: 'child_trig',
        type: 'trigger',
        name: 'Child Trigger',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          label: 'Child Trigger',
          inputSchema: { basePrice: 'number', discount: 'number' },
          sampleInput: { basePrice: 100, discount: 20 },
        },
      },
      {
        id: 'child_action',
        type: 'action',
        name: 'Compute Discounted',
        version: 1,
        position: { x: 250, y: 0 },
        config: {
          label: 'Compute final price',
          actionType: 'buildObject',
          fields: {
            finalPrice: { kind: 'ref', source: 'trigger', path: 'basePrice' },
            savings: { kind: 'ref', source: 'trigger', path: 'discount' },
          },
        },
      },
      {
        id: 'child_end',
        type: 'end',
        name: 'Child Complete',
        version: 1,
        position: { x: 500, y: 0 },
        config: {
          label: 'Done',
          outputSource: 'child_action',
        },
      },
    ],
    edges: [
      { id: 'ce_1', source: 'child_trig', sourceHandle: 'next', target: 'child_action', targetHandle: 'in' },
      { id: 'ce_2', source: 'child_action', sourceHandle: 'next', target: 'child_end', targetHandle: 'in' },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  it('registers subflow node type in NODE_REGISTRY with typed ports and defaults', () => {
    const spec = getNodeSpecification('subflow');
    expect(spec).toBeDefined();
    expect(spec.type).toBe('subflow');
    expect(spec.label).toBe('Subflow');
    expect(spec.category).toBe('flow');
    expect(spec.inputs).toHaveLength(1);
    expect(spec.outputs).toHaveLength(1);
    expect(spec.createDefaultConfig()).toEqual({
      label: 'Invoke subflow',
      targetWorkflowId: '',
      inputMapping: [],
      outputMapping: [],
    });
  });

  it('validates subflow nodes: warns if unconfigured and blocks self-referential recursion', () => {
    const parentDoc: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'parent_wf_001',
      name: 'Parent Workflow',
      revision: 1,
      status: 'draft',
      nodes: [
        {
          id: 'trig_1',
          type: 'trigger',
          name: 'Start',
          version: 1,
          position: { x: 0, y: 0 },
          config: { label: 'Start', inputSchema: {} },
        },
        {
          id: 'subflow_1',
          type: 'subflow',
          name: 'Self Recursive Subflow',
          version: 1,
          position: { x: 250, y: 0 },
          config: {
            label: 'Call Myself',
            targetWorkflowId: 'parent_wf_001', // Self reference
            inputMapping: [],
          },
        },
        {
          id: 'end_1',
          type: 'end',
          name: 'End',
          version: 1,
          position: { x: 500, y: 0 },
          config: { label: 'End' },
        },
      ],
      edges: [
        { id: 'e1', source: 'trig_1', sourceHandle: 'next', target: 'subflow_1', targetHandle: 'in' },
        { id: 'e2', source: 'subflow_1', sourceHandle: 'next', target: 'end_1', targetHandle: 'in' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const reportSelf = validateWorkflow(parentDoc);
    expect(reportSelf.canExecute).toBe(false);
    expect(reportSelf.issues.some((i) => i.code === 'SUBFLOW_CIRCULAR_REFERENCE')).toBe(true);

    // Empty target workflow warning
    const subflowNode = parentDoc.nodes.find((n) => n.type === 'subflow');
    if (subflowNode && subflowNode.type === 'subflow') {
      subflowNode.config.targetWorkflowId = '';
    }
    const reportEmpty = validateWorkflow(parentDoc);
    expect(reportEmpty.issues.some((i) => i.code === 'SUBFLOW_TARGET_MISSING')).toBe(true);
  });

  it('executes child subflow with mapped inputs and returns mapped outputs to parent context', async () => {
    const childDoc = createChildWorkflow('child_pricing_001', 'Pricing Calculator');

    const parentDoc: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'parent_order_wf',
      name: 'Order Processing',
      revision: 1,
      status: 'draft',
      nodes: [
        {
          id: 'p_trig',
          type: 'trigger',
          name: 'Order Submitted',
          version: 1,
          position: { x: 0, y: 0 },
          config: {
            label: 'Order Trigger',
            inputSchema: { orderAmount: 'number', promoReduction: 'number' },
            sampleInput: { orderAmount: 500, promoReduction: 50 },
          },
        },
        {
          id: 'p_subflow',
          type: 'subflow',
          name: 'Calculate Pricing Subflow',
          version: 1,
          position: { x: 250, y: 0 },
          config: {
            label: 'Invoke Pricing',
            targetWorkflowId: 'child_pricing_001',
            inputMapping: [
              { targetField: 'basePrice', source: { source: 'trigger', path: 'orderAmount' } },
              { targetField: 'discount', source: { source: 'trigger', path: 'promoReduction' } },
            ],
            outputMapping: [
              { targetField: 'netCharge', sourcePath: 'finalPrice' },
            ],
          },
        },
        {
          id: 'p_end',
          type: 'end',
          name: 'Order Complete',
          version: 1,
          position: { x: 500, y: 0 },
          config: {
            label: 'Finish',
            outputSource: 'p_subflow',
          },
        },
      ],
      edges: [
        { id: 'pe_1', source: 'p_trig', sourceHandle: 'next', target: 'p_subflow', targetHandle: 'in' },
        { id: 'pe_2', source: 'p_subflow', sourceHandle: 'next', target: 'p_end', targetHandle: 'in' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const workflowMap = new Map<string, WorkflowDocument>([
      [childDoc.id, childDoc],
      [parentDoc.id, parentDoc],
    ]);

    const runResult = await executeWorkflow(parentDoc, {
      input: { orderAmount: 750, promoReduction: 75 },
      workflowLookup: (id) => workflowMap.get(id) ?? null,
    });

    expect(runResult.status).toBe('success');
    expect(runResult.finalOutput).toEqual({
      netCharge: 750,
    });
  });

  it('fails with ERR_SUBFLOW_NOT_FOUND when child workflow does not exist', async () => {
    const parentDoc: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'parent_missing_subflow',
      name: 'Missing Subflow Test',
      revision: 1,
      status: 'draft',
      nodes: [
        {
          id: 'trig',
          type: 'trigger',
          name: 'Trigger',
          version: 1,
          position: { x: 0, y: 0 },
          config: { label: 'Start', inputSchema: {} },
        },
        {
          id: 'subflow_missing',
          type: 'subflow',
          name: 'Call Nonexistent Subflow',
          version: 1,
          position: { x: 250, y: 0 },
          config: {
            label: 'Invoke Nonexistent',
            targetWorkflowId: 'nonexistent_wf_999',
            inputMapping: [],
          },
        },
        {
          id: 'end',
          type: 'end',
          name: 'End',
          version: 1,
          position: { x: 500, y: 0 },
          config: { label: 'End' },
        },
      ],
      edges: [
        { id: 'e1', source: 'trig', sourceHandle: 'next', target: 'subflow_missing', targetHandle: 'in' },
        { id: 'e2', source: 'subflow_missing', sourceHandle: 'next', target: 'end', targetHandle: 'in' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const runResult = await executeWorkflow(parentDoc, {
      workflowLookup: () => null,
    });

    expect(runResult.status).toBe('failed');
    expect(runResult.error?.code).toBe('ERR_SUBFLOW_NOT_FOUND');
    expect(runResult.error?.message).toContain('nonexistent_wf_999');
  });

  it('detects and prevents recursive call cycles between subflows', async () => {
    // Workflow A calls Workflow B
    // Workflow B calls Workflow A
    const wfA: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'wf_alpha',
      name: 'Workflow Alpha',
      revision: 1,
      status: 'draft',
      nodes: [
        {
          id: 'trig_a',
          type: 'trigger',
          name: 'Start A',
          version: 1,
          position: { x: 0, y: 0 },
          config: { label: 'Start', inputSchema: {} },
        },
        {
          id: 'subflow_to_b',
          type: 'subflow',
          name: 'Call B',
          version: 1,
          position: { x: 200, y: 0 },
          config: {
            label: 'Call Workflow Beta',
            targetWorkflowId: 'wf_beta',
          },
        },
        {
          id: 'end_a',
          type: 'end',
          name: 'End A',
          version: 1,
          position: { x: 400, y: 0 },
          config: { label: 'End' },
        },
      ],
      edges: [
        { id: 'ea_1', source: 'trig_a', sourceHandle: 'next', target: 'subflow_to_b', targetHandle: 'in' },
        { id: 'ea_2', source: 'subflow_to_b', sourceHandle: 'next', target: 'end_a', targetHandle: 'in' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const wfB: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'wf_beta',
      name: 'Workflow Beta',
      revision: 1,
      status: 'draft',
      nodes: [
        {
          id: 'trig_b',
          type: 'trigger',
          name: 'Start B',
          version: 1,
          position: { x: 0, y: 0 },
          config: { label: 'Start', inputSchema: {} },
        },
        {
          id: 'subflow_to_a',
          type: 'subflow',
          name: 'Call A',
          version: 1,
          position: { x: 200, y: 0 },
          config: {
            label: 'Call Workflow Alpha',
            targetWorkflowId: 'wf_alpha', // Cycle back to A
          },
        },
        {
          id: 'end_b',
          type: 'end',
          name: 'End B',
          version: 1,
          position: { x: 400, y: 0 },
          config: { label: 'End' },
        },
      ],
      edges: [
        { id: 'eb_1', source: 'trig_b', sourceHandle: 'next', target: 'subflow_to_a', targetHandle: 'in' },
        { id: 'eb_2', source: 'subflow_to_a', sourceHandle: 'next', target: 'end_b', targetHandle: 'in' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const workflowMap = new Map<string, WorkflowDocument>([
      [wfA.id, wfA],
      [wfB.id, wfB],
    ]);

    const runResult = await executeWorkflow(wfA, {
      workflowLookup: (id) => workflowMap.get(id) ?? null,
    });

    expect(runResult.status).toBe('failed');
    expect(runResult.error?.code).toBe('ERR_SUBFLOW_RECURSION_DETECTED');
    expect(runResult.error?.message).toContain('wf_alpha');
  });
});
