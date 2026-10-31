/**
 * FlowForge — End-to-End User Journeys Verification Test Suite
 *
 * Verifies all 7 core journeys end-to-end:
 * 1. Create workflow -> configure nodes -> execute.
 * 2. Execute -> pause -> resume -> inspect trace.
 * 3. Create test cases -> run suite -> reload -> verify persistence.
 * 4. Save revision -> modify workflow -> restore revision.
 * 5. Create parent and child workflows -> execute subflow.
 * 6. Draft workflow from natural language -> review -> apply.
 * 7. Disconnect network -> queue sync -> reconnect -> verify sync behavior.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceStore } from '../store/workspace-store';
import { executeWorkflow } from '../engine';
import { ExecutionPauseController } from '../engine/pause-controller';
import { draftWorkflowFromPrompt } from '../features/generator/workflow-drafter';
import { MemorySyncTransport, ServerSyncAdapter } from '../persistence/adapters/server-sync-adapter';
import { defaultPersistenceAdapter } from '../persistence/indexeddb/indexeddb-adapter';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import type { WorkflowDocument } from '../domain/types/workflow';

describe('FlowForge — End-to-End User Journeys (Final Audit)', () => {
  beforeEach(async () => {
    await defaultPersistenceAdapter.clearAll();
    useWorkspaceStore.getState().createBlankWorkflow();
  });

  // Journey 1: Create workflow -> configure nodes -> execute
  it('Journey 1: creates a workflow from scratch, configures nodes, and executes deterministically', async () => {
    const store = useWorkspaceStore.getState();

    // Rename workflow
    store.renameWorkflow('Order Value Evaluation');

    // Add nodes
    const trigger = store.addNodeByType('trigger', { x: 50, y: 150 });
    const cond = store.addNodeByType('condition', { x: 300, y: 150 });
    const action = store.addNodeByType('action', { x: 600, y: 150 });
    const end = store.addNodeByType('end', { x: 900, y: 150 });

    // Configure trigger node
    store.updateNodeConfig(trigger.id, {
      label: 'Order Placed',
      inputSchema: { orderAmount: 'number' },
      sampleInput: { orderAmount: 750 },
    });

    // Configure condition node
    store.updateNodeConfig(cond.id, {
      description: 'Check if order exceeds 500',
      left: { source: trigger.id, path: 'orderAmount' },
      operator: 'greaterThan',
      right: { kind: 'literal', value: 500 },
    });

    // Configure action node
    store.updateNodeConfig(action.id, {
      label: 'Construct VIP Order',
      actionType: 'buildObject',
      fields: {
        vipTier: { kind: 'literal', value: 'Gold' },
        amount: { kind: 'ref', source: trigger.id, path: 'orderAmount' },
      },
    });

    // Connect edges
    store.connectNodes({
      source: trigger.id,
      sourceHandle: 'next',
      target: cond.id,
      targetHandle: 'in',
    });
    store.connectNodes({
      source: cond.id,
      sourceHandle: 'true',
      target: action.id,
      targetHandle: 'in',
    });
    store.connectNodes({
      source: cond.id,
      sourceHandle: 'false',
      target: end.id,
      targetHandle: 'in',
    });
    store.connectNodes({
      source: action.id,
      sourceHandle: 'next',
      target: end.id,
      targetHandle: 'in',
    });

    // Run static validation
    const report = store.runStaticValidation();
    expect(report.valid).toBe(true);
    expect(report.canExecute).toBe(true);

    // Execute with payload
    const runResult = await store.executeCurrentWorkflow({ orderAmount: 1200 });
    expect(runResult).toBeDefined();
    expect(runResult?.status).toBe('success');
    expect(runResult?.nodeTraces[action.id]?.status).toBe('success');
    expect(runResult?.nodeTraces[action.id]?.output).toEqual({
      vipTier: 'Gold',
      amount: 1200,
    });
  });

  // Journey 2: Execute -> pause -> resume -> inspect trace
  it('Journey 2: pauses execution at a checkpoint, resumes, and inspects trace events', async () => {
    const pauseController = new ExecutionPauseController();

    const doc: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'wf_pause_resume_e2e',
      name: 'Pause Resume Test',
      revision: 1,
      status: 'validated',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'trig',
          type: 'trigger',
          name: 'Start',
          version: 1,
          position: { x: 0, y: 0 },
          config: { label: 'Start', inputSchema: {} },
        },
        {
          id: 'step1',
          type: 'action',
          name: 'Step 1',
          version: 1,
          position: { x: 200, y: 0 },
          config: { label: 'Step 1', actionType: 'buildObject', fields: { step: { kind: 'literal', value: 1 } } },
        },
        {
          id: 'step2',
          type: 'action',
          name: 'Step 2',
          version: 1,
          position: { x: 400, y: 0 },
          config: { label: 'Step 2', actionType: 'buildObject', fields: { step: { kind: 'literal', value: 2 } } },
        },
        {
          id: 'end',
          type: 'end',
          name: 'Finish',
          version: 1,
          position: { x: 600, y: 0 },
          config: { label: 'Finish', outputSource: 'upstream' },
        },
      ],
      edges: [
        { id: 'e1', source: 'trig', sourceHandle: 'next', target: 'step1', targetHandle: 'in' },
        { id: 'e2', source: 'step1', sourceHandle: 'next', target: 'step2', targetHandle: 'in' },
        { id: 'e3', source: 'step2', sourceHandle: 'next', target: 'end', targetHandle: 'in' },
      ],
    };

    // Pause before launching
    pauseController.pause();
    expect(pauseController.isPaused).toBe(true);

    const runPromise = executeWorkflow(doc, { pauseController });

    // Allow scheduler to hit pause barrier
    await new Promise((r) => setTimeout(r, 40));
    expect(pauseController.isPaused).toBe(true);

    // Resume execution
    pauseController.resume();
    expect(pauseController.isPaused).toBe(false);

    const record = await runPromise;
    expect(record.status).toBe('success');

    // Inspect trace events for pause/resume order
    const eventTypes = record.events.map((e) => e.type);
    expect(eventTypes).toContain('run.paused');
    expect(eventTypes).toContain('run.resumed');
    expect(eventTypes).toContain('run.completed');
  });

  // Journey 3: Create test cases -> run suite -> reload -> verify persistence
  it('Journey 3: creates test cases, runs suite, reloads from storage, and preserves suite state', async () => {
    const store = useWorkspaceStore.getState();
    store.loadWorkflow(EXPENSE_APPROVAL_WORKFLOW);

    // Add 2 test cases
    const tc1 = store.addTestCase({
      name: 'High amount order (VIP path)',
      input: { amount: 15000, department: 'Finance', requester: 'clara@flowforge.dev' },
      assertions: [
        { id: 'a1', kind: 'status', expectedStatus: 'success' },
        { id: 'a2', kind: 'branchSelected', conditionNodeId: 'condition_1', expectedHandle: 'false' },
      ],
    });

    const tc2 = store.addTestCase({
      name: 'Low amount order (Auto-approve path)',
      input: { amount: 250, department: 'Finance', requester: 'clara@flowforge.dev' },
      assertions: [
        { id: 'a3', kind: 'status', expectedStatus: 'success' },
        { id: 'a4', kind: 'branchSelected', conditionNodeId: 'condition_1', expectedHandle: 'true' },
      ],
    });

    expect(useWorkspaceStore.getState().testCases).toHaveLength(4);

    // Run test suite
    const report = await store.runTestSuite();
    expect(report.totalCases).toBe(4);
    expect(report.passedCases).toBe(4);

    // Simulate page reload by clearing in-memory store and rehydrating
    useWorkspaceStore.setState({ testCases: [], testSuiteReport: null, isHydrated: false });
    await useWorkspaceStore.getState().hydrateFromStorage();

    const hydratedStore = useWorkspaceStore.getState();
    expect(hydratedStore.testCases.map((tc) => tc.id)).toContain(tc1.id);
    expect(hydratedStore.testCases.map((tc) => tc.id)).toContain(tc2.id);
    expect(hydratedStore.testSuiteReport?.passedCases).toBe(4);
  });

  // Journey 4: Save revision -> modify workflow -> restore revision
  it('Journey 4: saves an immutable revision snapshot, edits graph, and restores revision non-destructively', async () => {
    const store = useWorkspaceStore.getState();
    const originalNodeCount = store.workflow.nodes.length;

    // Save revision checkpoint v2
    const rev1 = store.saveRevisionCheckpoint('Baseline before adding audit node', 'validated');
    expect(rev1.revisionNumber).toBe(2);

    // Modify workflow by adding an extra Action node
    const auditNode = store.addNodeByType('action', { x: 700, y: 400 });
    store.updateNodeName(auditNode.id, 'Audit Log Entry');
    expect(useWorkspaceStore.getState().workflow.nodes.length).toBe(originalNodeCount + 1);

    // Save revision checkpoint v3
    const rev2 = store.saveRevisionCheckpoint('Added audit log node', 'draft');
    expect(rev2.revisionNumber).toBe(3);

    // Restore revision 2: PRD FR-058 requires restoring revision k creates revision n + 1
    const restored = store.restoreRevision(rev1.revisionId);
    expect(restored).not.toBeNull();
    expect(useWorkspaceStore.getState().workflow.revision).toBe(4); // n + 1 (4)
    expect(useWorkspaceStore.getState().workflow.nodes.length).toBe(originalNodeCount); // reverted node count
    expect(useWorkspaceStore.getState().workflow.nodes.some((n) => n.id === auditNode.id)).toBe(false);
  });

  // Journey 5: Create parent and child workflows -> execute subflow
  it('Journey 5: creates parent and child workflows and executes subflow with input/output mapping', async () => {
    const store = useWorkspaceStore.getState();

    // 1. Create Child workflow
    const childWorkflow: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'wf_child_tax_calculator',
      name: 'Tax Calculation Subflow',
      revision: 1,
      status: 'validated',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'child_trig',
          type: 'trigger',
          name: 'Tax Input',
          version: 1,
          position: { x: 0, y: 0 },
          config: {
            label: 'Tax Input',
            inputSchema: { baseAmount: 'number' },
            sampleInput: { baseAmount: 100 },
          },
        },
        {
          id: 'child_act',
          type: 'action',
          name: 'Apply Tax',
          version: 1,
          position: { x: 200, y: 0 },
          config: {
            label: 'Apply Tax',
            actionType: 'buildObject',
            fields: {
              taxAmount: { kind: 'ref', source: 'child_trig', path: 'baseAmount' },
              taxRate: { kind: 'literal', value: 0.15 },
            },
          },
        },
        {
          id: 'child_end',
          type: 'end',
          name: 'Tax Output',
          version: 1,
          position: { x: 400, y: 0 },
          config: { label: 'Tax Output', outputSource: 'child_act' },
        },
      ],
      edges: [
        { id: 'ce1', source: 'child_trig', sourceHandle: 'next', target: 'child_act', targetHandle: 'in' },
        { id: 'ce2', source: 'child_act', sourceHandle: 'next', target: 'child_end', targetHandle: 'in' },
      ],
    };

    // Save child workflow in store
    useWorkspaceStore.setState({ savedWorkflows: [childWorkflow] });

    // 2. Create Parent workflow invoking Child via Subflow node
    const parentWorkflow: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'wf_parent_checkout',
      name: 'Checkout Flow',
      revision: 1,
      status: 'validated',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'parent_trig',
          type: 'trigger',
          name: 'Cart Submitted',
          version: 1,
          position: { x: 0, y: 0 },
          config: {
            label: 'Cart Submitted',
            inputSchema: { subtotal: 'number' },
            sampleInput: { subtotal: 500 },
          },
        },
        {
          id: 'parent_subflow',
          type: 'subflow',
          name: 'Compute Taxes',
          version: 1,
          position: { x: 250, y: 0 },
          config: {
            label: 'Compute Taxes',
            targetWorkflowId: 'wf_child_tax_calculator',
            targetWorkflowName: 'Tax Calculation Subflow',
            inputMapping: [
              { targetField: 'baseAmount', source: { source: 'parent_trig', path: 'subtotal' } },
            ],
            outputMapping: [
              { targetField: 'calculatedTax', sourcePath: 'taxAmount' },
            ],
          },
        },
        {
          id: 'parent_end',
          type: 'end',
          name: 'Order Summary',
          version: 1,
          position: { x: 500, y: 0 },
          config: { label: 'Order Summary', outputSource: 'parent_subflow' },
        },
      ],
      edges: [
        { id: 'pe1', source: 'parent_trig', sourceHandle: 'next', target: 'parent_subflow', targetHandle: 'in' },
        { id: 'pe2', source: 'parent_subflow', sourceHandle: 'next', target: 'parent_end', targetHandle: 'in' },
      ],
    };

    store.loadWorkflow(parentWorkflow);

    // Execute parent workflow
    const result = await store.executeCurrentWorkflow({ subtotal: 800 });
    expect(result?.status).toBe('success');

    // Verify subflow node output
    const subflowTrace = result?.nodeTraces['parent_subflow'];
    expect(subflowTrace?.status).toBe('success');
    expect(subflowTrace?.output).toEqual({
      calculatedTax: 800,
    });
  });

  // Journey 6: Draft workflow from natural language -> review -> apply
  it('Journey 6: drafts a workflow from a prompt, verifies proposal, and applies to canvas', () => {
    const prompt = 'Validate incoming registration form. Check that email is provided. If true accept registration, otherwise reject.';
    const proposal = draftWorkflowFromPrompt(prompt);

    expect(proposal.matchedPattern).toBe('Data Validation Guard Pattern');
    expect(proposal.confidence).toBe('high');
    expect(proposal.summary.nodeCount).toBeGreaterThanOrEqual(4);

    // Apply to canvas in Replace mode
    const store = useWorkspaceStore.getState();
    store.applyDraftWorkflow(proposal.workflow, 'replace');

    // Canvas now reflects the drafted workflow
    const activeDoc = useWorkspaceStore.getState().workflow;
    expect(activeDoc.name).toMatch(/Registration Form Validation/);
    expect(activeDoc.nodes.some((n) => n.type === 'condition')).toBe(true);
    expect(useWorkspaceStore.getState().validationReport.valid).toBe(true);
  });

  // Journey 7: Disconnect network -> queue sync -> reconnect -> verify sync behavior
  it('Journey 7: disconnects network, queues modifications locally, reconnects, and verifies sync flush', async () => {
    const transport = new MemorySyncTransport();
    const syncAdapter = new ServerSyncAdapter({
      localAdapter: defaultPersistenceAdapter,
      transport,
      authToken: 'test_token',
      conflictStrategy: 'revision-fork',
    });

    // 1. Go offline
    syncAdapter.setOnline(false);
    expect(syncAdapter.getStatus()).toBe('offline');

    // 2. Perform workflow save while offline
    const doc = useWorkspaceStore.getState().workflow;
    await syncAdapter.saveWorkflow(doc);

    // Verify write succeeded in local IndexedDB immediately
    const locallySaved = await defaultPersistenceAdapter.getWorkflow(doc.id);
    expect(locallySaved).toBeDefined();

    // Verify change is queued in sync adapter
    expect(syncAdapter.getQueueLength()).toBe(1);

    // 3. Reconnect to network
    syncAdapter.setOnline(true);

    // Allow async queue flush to complete
    await new Promise((r) => setTimeout(r, 30));

    expect(syncAdapter.getStatus()).toBe('idle');
    expect(syncAdapter.getQueueLength()).toBe(0);

    // Verify remote transport received the synced workflow
    const remoteRecord = await transport.pullRemote(doc.id);
    expect(remoteRecord.ok).toBe(true);
    expect(remoteRecord.data?.workflow?.id).toBe(doc.id);
  });
});
