import { describe, expect, it, vi } from 'vitest';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import {
  DATA_FILTERING_WORKFLOW,
  FORM_VALIDATION_WORKFLOW,
  NOTIFICATION_FLOW_WORKFLOW,
} from '../domain/fixtures/starter-templates';
import type {
  ConditionOperator,
  ExecutionEvent,
  WorkflowDocument,
  WorkflowNodeBase,
  WorkflowRunRecord,
} from '../domain/types/workflow';
import {
  buildGraphExecutionIndex,
  createExecutionContext,
  EngineExecutionError,
  executeActionNode,
  executeConditionNode,
  executeEndNode,
  executeNodeHandler,
  executeTransformNode,
  executeTriggerNode,
  executeWorkflow,
  resolveDotPath,
  resolveOperandReference,
  resolveSourcePayload,
  resolveValueMappingEntry,
  runWorkflowSchedule,
  toStructuredExecutionError,
  TraceRecorder,
  validateTriggerInput,
} from '../engine';

describe('Phase 5 Task 1 — Execution Context, Trigger Input Validation, and Safe Operand Resolution', () => {
  it('initializes an isolated ExecutionContext with deep-cloned input', () => {
    const rawInput = {
      amount: 4250,
      user: { email: 'ada@flowforge.dev' },
    };
    const ctx = createExecutionContext(rawInput);

    // Mutate original rawInput and verify ctx.input is unaffected
    rawInput.amount = 99999;
    rawInput.user.email = 'mutated@example.com';

    expect(ctx.input).toEqual({
      amount: 4250,
      user: { email: 'ada@flowforge.dev' },
    });
    expect(ctx.nodeOutputs).toEqual({});
    expect(ctx.variables).toEqual({});
    expect(ctx.logs).toEqual([]);
  });

  it('validates Trigger input payloads against inputSchema (all primitive types, missing fields, and type mismatches)', () => {
    const schema = {
      amount: 'number',
      requester: 'string',
      urgent: 'boolean',
      metadata: 'object',
      tags: 'array',
    } as const;

    // 1. Valid payload passes
    const validErr = validateTriggerInput(
      {
        amount: 4250,
        requester: 'ada@flowforge.dev',
        urgent: false,
        metadata: { costCenter: 'ENG-01' },
        tags: ['q4', 'hardware'],
      },
      schema,
      'trigger_1',
    );
    expect(validErr).toBeNull();

    // 2. Non-object payload fails
    const arrayErr = validateTriggerInput(['not', 'an', 'object'], schema, 'trigger_1');
    expect(arrayErr?.code).toBe('ERR_INVALID_TRIGGER_INPUT');
    expect(arrayErr?.nodeId).toBe('trigger_1');

    // 3. Missing required field fails
    const missingErr = validateTriggerInput(
      {
        amount: 4250,
      },
      schema,
      'trigger_1',
    );
    expect(missingErr?.code).toBe('ERR_MISSING_TRIGGER_INPUT_FIELD');
    expect(missingErr?.message).toContain('"requester"');

    // 4. Wrong type (string instead of number, or NaN) fails
    const wrongTypeErr = validateTriggerInput(
      {
        amount: '4250',
        requester: 'ada@flowforge.dev',
        urgent: true,
        metadata: {},
        tags: [],
      },
      schema,
      'trigger_1',
    );
    expect(wrongTypeErr?.code).toBe('ERR_INVALID_TRIGGER_INPUT');
    expect(wrongTypeErr?.message).toContain('"amount"');

    const nanErr = validateTriggerInput(
      {
        amount: Number.NaN,
        requester: 'ada@flowforge.dev',
        urgent: true,
        metadata: {},
        tags: [],
      },
      schema,
      'trigger_1',
    );
    expect(nanErr?.code).toBe('ERR_INVALID_TRIGGER_INPUT');
  });

  it('resolves nested dot paths safely, preserves falsy values, and blocks prototype pollution paths', () => {
    const payload = {
      amount: 0,
      approved: false,
      note: '',
      user: {
        profile: {
          email: 'grace@flowforge.dev',
        },
      },
    };

    // Root path
    expect(resolveDotPath(payload, '')).toEqual(payload);
    expect(resolveDotPath(payload, '$')).toEqual(payload);

    // Nested path
    expect(resolveDotPath(payload, 'user.profile.email')).toBe('grace@flowforge.dev');

    // Falsy values (0, false, '') must be preserved accurately
    expect(resolveDotPath(payload, 'amount')).toBe(0);
    expect(resolveDotPath(payload, 'approved')).toBe(false);
    expect(resolveDotPath(payload, 'note')).toBe('');

    // Missing nested field returns undefined without throwing
    expect(resolveDotPath(payload, 'user.profile.phone')).toBeUndefined();
    expect(resolveDotPath(payload, 'nonExistent.deep.field')).toBeUndefined();

    // Inherited Object.prototype properties are never returned
    expect(resolveDotPath(payload, 'toString')).toBeUndefined();
    expect(resolveDotPath(payload, 'valueOf')).toBeUndefined();

    // Forbidden prototype-chain segments throw ERR_FORBIDDEN_PATH
    for (const forbidden of [
      '__proto__.polluted',
      'user.constructor.prototype',
      'prototype.isAdmin',
    ]) {
      expect(() =>
        resolveDotPath(payload, forbidden, { nodeId: 'cond_1' }),
      ).toThrowError(EngineExecutionError);

      try {
        resolveDotPath(payload, forbidden, { nodeId: 'cond_1' });
      } catch (err) {
        const structured = toStructuredExecutionError(err);
        expect(structured.code).toBe('ERR_FORBIDDEN_PATH');
        expect(structured.nodeId).toBe('cond_1');
      }
    }

    // Empty segment in path throws ERR_INVALID_FIELD_PATH
    expect(() =>
      resolveDotPath(payload, 'user..email', { nodeId: 'cond_1' }),
    ).toThrowError(/empty path segment/);
  });

  it('resolves "trigger", <triggerNodeId>, "upstream", "variables", and executed node IDs, and fails on unexecuted nodes', () => {
    const ctx = createExecutionContext({
      amount: 4250,
      requester: 'ada@flowforge.dev',
    });
    ctx.nodeOutputs['trigger_1'] = {
      amount: 4250,
      requester: 'ada@flowforge.dev',
    };
    ctx.nodeOutputs['transform_1'] = {
      normalizedAmount: 4250,
      tier: 'standard',
    };
    ctx.variables['departmentBudget'] = 25000;

    const cursor = {
      triggerNodeId: 'trigger_1',
      currentNodeId: 'action_approve',
      upstreamNodeId: 'transform_1',
    };

    // Both "trigger" and "trigger_1" resolve to the trigger output
    expect(
      resolveOperandReference(ctx, { source: 'trigger', path: 'amount' }, cursor),
    ).toBe(4250);
    expect(
      resolveOperandReference(
        ctx,
        { source: 'trigger_1', path: 'requester' },
        cursor,
      ),
    ).toBe('ada@flowforge.dev');

    // "upstream" resolves to transform_1's output
    expect(
      resolveOperandReference(ctx, { source: 'upstream', path: 'tier' }, cursor),
    ).toBe('standard');

    // Specific executed node ID resolves
    expect(
      resolveOperandReference(
        ctx,
        { source: 'transform_1', path: 'normalizedAmount' },
        cursor,
      ),
    ).toBe(4250);

    // "variables" resolves to context.variables
    expect(
      resolveOperandReference(
        ctx,
        { source: 'variables', path: 'departmentBudget' },
        cursor,
      ),
    ).toBe(25000);

    // ValueMappingEntry literal vs ref
    expect(
      resolveValueMappingEntry(
        ctx,
        { kind: 'literal', value: 'approved' },
        cursor,
      ),
    ).toBe('approved');
    expect(
      resolveValueMappingEntry(
        ctx,
        { kind: 'ref', source: 'trigger_1', path: 'amount' },
        cursor,
      ),
    ).toBe(4250);

    // Referencing a skipped or unexecuted node throws ERR_MISSING_SOURCE_NODE
    expect(() =>
      resolveSourcePayload(ctx, 'action_skipped_branch', cursor),
    ).toThrowError(EngineExecutionError);

    try {
      resolveSourcePayload(ctx, 'action_skipped_branch', cursor);
    } catch (err) {
      const structured = toStructuredExecutionError(err);
      expect(structured.code).toBe('ERR_MISSING_SOURCE_NODE');
      expect(structured.nodeId).toBe('action_approve');
      expect(structured.message).toContain('action_skipped_branch');
    }
  });
});

describe('Phase 5 Task 2 — Execution Event Recorder and Trace State Builder', () => {
  it('records chronological ExecutionEvents, updates NodeExecutionTrace statuses, tracks condition reasons, and deduplicates traversed edges', () => {
    let clock = 1000;
    const now = () => {
      clock += 15;
      return clock;
    };

    const emittedEvents: ExecutionEvent[] = [];
    const emittedSnapshots: WorkflowRunRecord[] = [];

    const recorder = new TraceRecorder({
      runId: 'run_test_001',
      workflow: EXPENSE_APPROVAL_WORKFLOW,
      input: {
        amount: 4250,
        requester: 'ada@flowforge.dev',
        department: 'Core Platform',
      },
      now,
      onEvent: (event, snapshot) => {
        emittedEvents.push(event);
        emittedSnapshots.push(snapshot);
      },
    });

    // Initially all 5 nodes in EXPENSE_APPROVAL_WORKFLOW are 'pending' with 0 attempts
    const initialSnap = recorder.getSnapshot();
    expect(initialSnap.status).toBe('starting');
    expect(Object.keys(initialSnap.nodeTraces)).toHaveLength(5);
    for (const trace of Object.values(initialSnap.nodeTraces)) {
      expect(trace.status).toBe('pending');
      expect(trace.attempts).toBe(0);
    }

    const triggerNode = EXPENSE_APPROVAL_WORKFLOW.nodes.find(
      (n) => n.id === 'trigger_1',
    )!;
    const conditionNode = EXPENSE_APPROVAL_WORKFLOW.nodes.find(
      (n) => n.id === 'condition_1',
    )!;
    const approveNode = EXPENSE_APPROVAL_WORKFLOW.nodes.find(
      (n) => n.id === 'action_approve',
    )!;
    const reviewNode = EXPENSE_APPROVAL_WORKFLOW.nodes.find(
      (n) => n.id === 'action_review',
    )!;
    const endNode = EXPENSE_APPROVAL_WORKFLOW.nodes.find(
      (n) => n.id === 'end_1',
    )!;

    // 1. Run started
    recorder.recordRunStarted();
    expect(recorder.getSnapshot().status).toBe('running');

    // 2. Trigger node started & completed
    recorder.recordNodeStarted(triggerNode, initialSnap.input);
    expect(recorder.getNodeTrace('trigger_1')?.status).toBe('running');
    expect(recorder.getNodeTrace('trigger_1')?.attempts).toBe(1);

    recorder.recordNodeCompleted(
      triggerNode,
      initialSnap.input,
      initialSnap.input,
    );
    expect(recorder.getNodeTrace('trigger_1')?.status).toBe('success');
    expect(recorder.getNodeTrace('trigger_1')?.durationMs).toBe(15);

    recorder.recordEdgeTraversed('edge_trigger_to_cond');
    recorder.recordEdgeTraversed('edge_trigger_to_cond'); // duplicate should be ignored

    // 3. Condition node started, completed, and branch selected
    recorder.recordNodeStarted(conditionNode, initialSnap.input);
    recorder.recordNodeCompleted(
      conditionNode,
      initialSnap.input,
      initialSnap.input,
    );
    recorder.recordBranchSelected('condition_1', 'true', {
      leftSource: 'trigger_1',
      leftPath: 'amount',
      leftValue: 4250,
      operator: 'lessThanOrEqual',
      rightValue: 10000,
      result: true,
      explanation: 'trigger_1.amount (4250) <= 10000 evaluated to true',
    });

    const condTrace = recorder.getNodeTrace('condition_1')!;
    expect(condTrace.status).toBe('success');
    expect(condTrace.selectedHandleId).toBe('true');
    expect(condTrace.conditionReason?.result).toBe(true);
    expect(condTrace.conditionReason?.leftValue).toBe(4250);

    // 4. False branch skipped
    recorder.recordNodeSkipped(
      reviewNode,
      'Branch not selected (condition_1:false)',
    );
    const skippedTrace = recorder.getNodeTrace('action_review')!;
    expect(skippedTrace.status).toBe('skipped');
    expect(skippedTrace.skipReason).toBe(
      'Branch not selected (condition_1:false)',
    );
    expect(skippedTrace.durationMs).toBe(0);

    // 5. True branch & End node completed
    recorder.recordEdgeTraversed('edge_cond_true');
    const approvedPayload = {
      decision: 'approved',
      routing: 'automatic',
      amount: 4250,
      requester: 'ada@flowforge.dev',
    };
    recorder.recordNodeStarted(approveNode, initialSnap.input);
    recorder.recordNodeCompleted(approveNode, initialSnap.input, approvedPayload);
    recorder.recordEdgeTraversed('edge_approve_to_end');

    recorder.recordNodeStarted(endNode, approvedPayload);
    recorder.recordNodeCompleted(endNode, approvedPayload, approvedPayload);

    // 6. Run completed
    recorder.recordRunCompleted(approvedPayload);

    const finalSnap = recorder.getSnapshot();
    expect(finalSnap.status).toBe('success');
    expect(finalSnap.finalOutput).toEqual(approvedPayload);
    expect(finalSnap.durationMs).toBeGreaterThan(0);
    expect(finalSnap.traversedEdgeIds).toEqual([
      'edge_trigger_to_cond',
      'edge_cond_true',
      'edge_approve_to_end',
    ]);

    // Verify exact chronological event order
    expect(finalSnap.events.map((e) => e.type)).toEqual([
      'run.started',
      'node.started',
      'node.completed',
      'node.started',
      'node.completed',
      'branch.selected',
      'node.skipped',
      'node.started',
      'node.completed',
      'node.started',
      'node.completed',
      'run.completed',
    ]);
    expect(emittedEvents).toHaveLength(12);
    expect(emittedSnapshots).toHaveLength(12);
  });

  it('records node.failed, run.failed, and run.cancelled states with structured error details and timing', () => {
    let clock = 5000;
    const recorder = new TraceRecorder({
      runId: 'run_fail_001',
      workflow: EXPENSE_APPROVAL_WORKFLOW,
      input: { amount: 4250 },
      now: () => {
        clock += 25;
        return clock;
      },
    });

    const conditionNode = EXPENSE_APPROVAL_WORKFLOW.nodes.find(
      (n) => n.id === 'condition_1',
    )!;

    recorder.recordRunStarted();
    recorder.recordNodeStarted(conditionNode, { amount: undefined });

    const errorPayload = {
      code: 'ERR_OPERAND_TYPE_MISMATCH',
      message: 'Left operand trigger_1.amount resolved to undefined',
      remediation: 'Provide a numeric amount in the trigger input.',
    };

    recorder.recordNodeFailed(conditionNode, { amount: undefined }, errorPayload);
    recorder.recordRunFailed(errorPayload);

    const failedSnap = recorder.getSnapshot();
    expect(failedSnap.status).toBe('failed');
    expect(failedSnap.error?.code).toBe('ERR_OPERAND_TYPE_MISMATCH');
    expect(failedSnap.nodeTraces['condition_1'].status).toBe('failed');
    expect(failedSnap.nodeTraces['condition_1'].error?.nodeId).toBe(
      'condition_1',
    );
    expect(failedSnap.nodeTraces['condition_1'].durationMs).toBe(25);

    // Also verify run.cancelled on a separate recorder
    const cancelRecorder = new TraceRecorder({
      runId: 'run_cancel_001',
      workflow: EXPENSE_APPROVAL_WORKFLOW,
      input: { amount: 4250 },
      now: () => {
        clock += 10;
        return clock;
      },
    });
    cancelRecorder.recordRunStarted();
    cancelRecorder.recordRunCancelled();

    const cancelledSnap = cancelRecorder.getSnapshot();
    expect(cancelledSnap.status).toBe('cancelled');
    expect(cancelledSnap.durationMs).toBe(10);
    expect(cancelledSnap.events.map((e) => e.type)).toEqual([
      'run.started',
      'run.cancelled',
    ]);
  });

  it('prevents accidental mutation of recorded events and node traces from external object changes', () => {
    const mutableInput: Record<string, unknown> = {
      amount: 4250,
      nested: { tag: 'original' },
    };
    const mutableOutput: Record<string, unknown> = {
      decision: 'approved',
      nestedOut: { tier: 'auto' },
    };

    const recorder = new TraceRecorder({
      runId: 'run_immutability',
      workflow: EXPENSE_APPROVAL_WORKFLOW,
      input: mutableInput,
    });

    const triggerNode = EXPENSE_APPROVAL_WORKFLOW.nodes[0];
    recorder.recordRunStarted();
    recorder.recordNodeStarted(triggerNode, mutableInput);
    recorder.recordNodeCompleted(triggerNode, mutableInput, mutableOutput);

    // Mutate original objects after recording
    mutableInput.amount = 999999;
    (mutableInput.nested as { tag: string }).tag = 'corrupted';
    mutableOutput.decision = 'corrupted';
    (mutableOutput.nestedOut as { tier: string }).tier = 'corrupted';

    // Mutate a retrieved snapshot and verify internal state remains pristine
    const snap1 = recorder.getSnapshot();
    snap1.status = 'failed';
    snap1.events.pop();
    snap1.nodeTraces['trigger_1'].status = 'failed';

    const snap2 = recorder.getSnapshot();
    expect(snap2.status).toBe('running');
    expect(snap2.events).toHaveLength(3);
    expect(snap2.input).toEqual({
      amount: 4250,
      nested: { tag: 'original' },
    });
    expect(snap2.nodeTraces['trigger_1'].status).toBe('success');
    expect(snap2.nodeTraces['trigger_1'].output).toEqual({
      decision: 'approved',
      nestedOut: { tier: 'auto' },
    });
  });
});

describe('Phase 5 Task 3 — Pure Node Handlers (Trigger, Condition, Action, Transform, End)', () => {
  it('executes Trigger handler with schema validation and preserves input immutability', () => {
    const triggerNode: WorkflowNodeBase<'trigger'> = {
      id: 'trigger_1',
      type: 'trigger',
      name: 'Expense submitted',
      version: 1,
      position: { x: 0, y: 0 },
      config: {
        label: 'Expense submitted',
        inputSchema: {
          amount: 'number',
          requester: 'string',
        },
      },
    };

    const ctx = createExecutionContext({
      amount: 4250,
      requester: 'ada@flowforge.dev',
    });

    const result = executeTriggerNode({
      node: triggerNode,
      context: ctx,
      triggerNodeId: 'trigger_1',
    });

    expect(result.nextHandleIds).toEqual(['next']);
    expect(result.output).toEqual({
      amount: 4250,
      requester: 'ada@flowforge.dev',
    });

    // Mutate result.output and confirm ctx.input is not mutated
    (result.output as Record<string, unknown>).amount = 999999;
    expect(ctx.input.amount).toBe(4250);

    // Invalid trigger input throws ERR_INVALID_TRIGGER_INPUT
    const invalidCtx = createExecutionContext({
      amount: 'not-a-number',
      requester: 'ada@flowforge.dev',
    });
    expect(() =>
      executeTriggerNode({
        node: triggerNode,
        context: invalidCtx,
        triggerNodeId: 'trigger_1',
      }),
    ).toThrowError(/expected type "number"/);
  });

  it('evaluates all 9 Condition operators deterministically, handles falsy values (0, false, ""), and emits structured ConditionEvaluationReason', () => {
    const ctx = createExecutionContext({
      amount: 4250,
      zeroVal: 0,
      falseVal: false,
      emptyStr: '',
      whitespaceStr: '   ',
      emptyArr: [],
      emptyObj: {},
      tags: ['urgent', 'finance'],
      summary: 'Database replica lag elevated',
      user: {
        role: 'admin',
      },
    });
    ctx.nodeOutputs['trigger_1'] = structuredClone(ctx.input);

    const runCondition = (
      path: string,
      operator: ConditionOperator,
      right?:
        | { kind: 'literal'; value: string | number | boolean | null }
        | { kind: 'ref'; source: string; path: string },
    ) => {
      const node: WorkflowNodeBase<'condition'> = {
        id: 'cond_test',
        type: 'condition',
        name: 'Test Condition',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          left: { source: 'trigger_1', path },
          operator,
          right,
        },
      };
      return executeConditionNode({
        node,
        context: ctx,
        triggerNodeId: 'trigger_1',
        upstreamNodeId: 'trigger_1',
      });
    };

    // 1. equals & notEquals (including nested paths and falsy 0 / false)
    const eqRes = runCondition('user.role', 'equals', {
      kind: 'literal',
      value: 'admin',
    });
    expect(eqRes.nextHandleIds).toEqual(['true']);
    expect(eqRes.conditionReason?.result).toBe(true);
    expect(eqRes.conditionReason?.leftValue).toBe('admin');

    expect(
      runCondition('zeroVal', 'equals', { kind: 'literal', value: 0 })
        .nextHandleIds,
    ).toEqual(['true']);
    expect(
      runCondition('falseVal', 'equals', { kind: 'literal', value: false })
        .nextHandleIds,
    ).toEqual(['true']);
    expect(
      runCondition('user.role', 'notEquals', {
        kind: 'literal',
        value: 'guest',
      }).nextHandleIds,
    ).toEqual(['true']);

    // 2. greaterThan & greaterThanOrEqual
    expect(
      runCondition('amount', 'greaterThan', { kind: 'literal', value: 1000 })
        .nextHandleIds,
    ).toEqual(['true']);
    expect(
      runCondition('amount', 'greaterThan', { kind: 'literal', value: 4250 })
        .nextHandleIds,
    ).toEqual(['false']);
    expect(
      runCondition('amount', 'greaterThanOrEqual', {
        kind: 'literal',
        value: 4250,
      }).nextHandleIds,
    ).toEqual(['true']);

    // 3. lessThan & lessThanOrEqual
    expect(
      runCondition('amount', 'lessThan', { kind: 'literal', value: 10000 })
        .nextHandleIds,
    ).toEqual(['true']);
    expect(
      runCondition('amount', 'lessThan', { kind: 'literal', value: 4250 })
        .nextHandleIds,
    ).toEqual(['false']);
    expect(
      runCondition('amount', 'lessThanOrEqual', {
        kind: 'literal',
        value: 4250,
      }).nextHandleIds,
    ).toEqual(['true']);

    // 4. isEmpty & isNotEmpty (falsy 0 and false are NOT empty!)
    expect(runCondition('emptyStr', 'isEmpty').nextHandleIds).toEqual(['true']);
    expect(runCondition('whitespaceStr', 'isEmpty').nextHandleIds).toEqual([
      'true',
    ]);
    expect(runCondition('emptyArr', 'isEmpty').nextHandleIds).toEqual(['true']);
    expect(runCondition('emptyObj', 'isEmpty').nextHandleIds).toEqual(['true']);
    expect(runCondition('nonExistentField', 'isEmpty').nextHandleIds).toEqual([
      'true',
    ]);
    expect(runCondition('zeroVal', 'isEmpty').nextHandleIds).toEqual(['false']);
    expect(runCondition('falseVal', 'isEmpty').nextHandleIds).toEqual([
      'false',
    ]);
    expect(runCondition('zeroVal', 'isNotEmpty').nextHandleIds).toEqual([
      'true',
    ]);
    expect(runCondition('falseVal', 'isNotEmpty').nextHandleIds).toEqual([
      'true',
    ]);
    expect(runCondition('user.role', 'isNotEmpty').nextHandleIds).toEqual([
      'true',
    ]);

    // 5. contains (string substring & array membership)
    expect(
      runCondition('summary', 'contains', {
        kind: 'literal',
        value: 'replica lag',
      }).nextHandleIds,
    ).toEqual(['true']);
    expect(
      runCondition('tags', 'contains', { kind: 'literal', value: 'finance' })
        .nextHandleIds,
    ).toEqual(['true']);
    expect(
      runCondition('tags', 'contains', { kind: 'literal', value: 'marketing' })
        .nextHandleIds,
    ).toEqual(['false']);

    // 6. Missing operand or incompatible types throw ERR_OPERAND_TYPE_MISMATCH
    expect(() =>
      runCondition('missingField', 'greaterThan', {
        kind: 'literal',
        value: 10,
      }),
    ).toThrowError(/resolved to undefined/);

    expect(() =>
      runCondition('amount', 'greaterThan', {
        kind: 'literal',
        value: '1000',
      }),
    ).toThrowError(/requires comparable numbers or strings/);

    expect(() =>
      runCondition('amount', 'contains', {
        kind: 'literal',
        value: '42',
      }),
    ).toThrowError(/requires a string .* or an array/);
  });

  it('executes all 4 Action operations (setValue, buildObject, appendLog, returnResult) and handles missing operands', () => {
    const ctx = createExecutionContext({
      amount: 0,
      approved: false,
      requester: 'ada@flowforge.dev',
    });
    ctx.nodeOutputs['trigger_1'] = structuredClone(ctx.input);

    // 1. setValue (preserving falsy 0 and updating context.variables)
    const setValRes = executeActionNode({
      node: {
        id: 'act_set',
        type: 'action',
        name: 'Set discount',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          label: 'Set discount',
          actionType: 'setValue',
          key: 'discount',
          value: { kind: 'ref', source: 'trigger_1', path: 'amount' },
        },
      },
      context: ctx,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect(ctx.variables['discount']).toBe(0);
    expect(setValRes.output).toEqual({
      amount: 0,
      approved: false,
      requester: 'ada@flowforge.dev',
      discount: 0,
    });

    // 2. buildObject
    const buildObjRes = executeActionNode({
      node: {
        id: 'act_build',
        type: 'action',
        name: 'Build decision',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          label: 'Build decision',
          actionType: 'buildObject',
          fields: {
            decision: { kind: 'literal', value: 'approved' },
            requester: { kind: 'ref', source: 'trigger_1', path: 'requester' },
            approvedFlag: {
              kind: 'ref',
              source: 'trigger_1',
              path: 'approved',
            },
          },
        },
      },
      context: ctx,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect(buildObjRes.output).toEqual({
      decision: 'approved',
      requester: 'ada@flowforge.dev',
      approvedFlag: false,
    });

    // 3. appendLog (with safe {{trigger_1.requester}} template interpolation)
    const logRes = executeActionNode({
      node: {
        id: 'act_log',
        type: 'action',
        name: 'Audit log',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          label: 'Audit log',
          actionType: 'appendLog',
          logMessage: 'Processed request for {{trigger_1.requester}}',
        },
      },
      context: ctx,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
      now: () => 123456,
    });
    expect(ctx.logs).toEqual([
      {
        nodeId: 'act_log',
        message: 'Processed request for ada@flowforge.dev',
        timestamp: 123456,
      },
    ]);
    expect((logRes.output as Record<string, unknown>).lastLogMessage).toBe(
      'Processed request for ada@flowforge.dev',
    );

    // 4. returnResult
    const returnRes = executeActionNode({
      node: {
        id: 'act_return',
        type: 'action',
        name: 'Return summary',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          label: 'Return summary',
          actionType: 'returnResult',
          fields: {
            finalStatus: { kind: 'literal', value: 'completed' },
            discount: { kind: 'ref', source: 'variables', path: 'discount' },
          },
        },
      },
      context: ctx,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect(returnRes.output).toEqual({
      finalStatus: 'completed',
      discount: 0,
    });

    // 5. Missing referenced field in buildObject throws ERR_MISSING_OPERAND_VALUE
    expect(() =>
      executeActionNode({
        node: {
          id: 'act_bad_ref',
          type: 'action',
          name: 'Bad ref',
          version: 1,
          position: { x: 0, y: 0 },
          config: {
            label: 'Bad ref',
            actionType: 'buildObject',
            fields: {
              missing: {
                kind: 'ref',
                source: 'trigger_1',
                path: 'nonExistentField',
              },
            },
          },
        },
        context: ctx,
        triggerNodeId: 'trigger_1',
        upstreamNodeId: 'trigger_1',
      }),
    ).toThrowError(/resolved to undefined/);
  });

  it('executes all 4 Transform operations (selectField, renameFields, constructObject, convertType) and handles conversion errors', () => {
    const ctx = createExecutionContext({
      rawAmount: '4250.5',
      rawFlag: 'true',
      badNumber: 'not_a_number',
      service: 'checkout-api',
      nested: {
        region: 'us-east',
      },
    });
    ctx.nodeOutputs['trigger_1'] = structuredClone(ctx.input);

    // 1. selectField
    const selectRes = executeTransformNode({
      node: {
        id: 'tr_select',
        type: 'transform',
        name: 'Select region',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          label: 'Select region',
          operation: 'selectField',
          source: 'trigger_1',
          fieldPath: 'nested.region',
        },
      },
      context: ctx,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect(selectRes.output).toBe('us-east');

    // 2. renameFields
    const renameRes = executeTransformNode({
      node: {
        id: 'tr_rename',
        type: 'transform',
        name: 'Rename service',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          label: 'Rename service',
          operation: 'renameFields',
          source: 'trigger_1',
          fieldMappings: {
            service: 'serviceName',
          },
        },
      },
      context: ctx,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect(
      (renameRes.output as Record<string, unknown>).serviceName,
    ).toBe('checkout-api');
    expect(
      (renameRes.output as Record<string, unknown>).service,
    ).toBeUndefined();

    // 3. constructObject
    const constructRes = executeTransformNode({
      node: {
        id: 'tr_construct',
        type: 'transform',
        name: 'Construct telemetry',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          label: 'Construct telemetry',
          operation: 'constructObject',
          constructedFields: {
            svc: { kind: 'ref', source: 'trigger_1', path: 'service' },
            region: {
              kind: 'ref',
              source: 'trigger_1',
              path: 'nested.region',
            },
            env: { kind: 'literal', value: 'prod' },
          },
        },
      },
      context: ctx,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect(constructRes.output).toEqual({
      svc: 'checkout-api',
      region: 'us-east',
      env: 'prod',
    });

    // 4. convertType (valid string -> number, string -> boolean, number -> string)
    const convNumRes = executeTransformNode({
      node: {
        id: 'tr_conv_num',
        type: 'transform',
        name: 'Convert amount',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          label: 'Convert amount',
          operation: 'convertType',
          source: 'trigger_1',
          fieldPath: 'rawAmount',
          targetType: 'number',
        },
      },
      context: ctx,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect((convNumRes.output as Record<string, unknown>).rawAmount).toBe(
      4250.5,
    );

    const convBoolRes = executeTransformNode({
      node: {
        id: 'tr_conv_bool',
        type: 'transform',
        name: 'Convert flag',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          label: 'Convert flag',
          operation: 'convertType',
          source: 'trigger_1',
          fieldPath: 'rawFlag',
          targetType: 'boolean',
        },
      },
      context: ctx,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect((convBoolRes.output as Record<string, unknown>).rawFlag).toBe(true);

    // 5. Invalid convertType fails with ERR_TYPE_CONVERSION_FAILED
    expect(() =>
      executeTransformNode({
        node: {
          id: 'tr_conv_bad',
          type: 'transform',
          name: 'Bad number conversion',
          version: 1,
          position: { x: 0, y: 0 },
          config: {
            label: 'Bad number conversion',
            operation: 'convertType',
            source: 'trigger_1',
            fieldPath: 'badNumber',
            targetType: 'number',
          },
        },
        context: ctx,
        triggerNodeId: 'trigger_1',
        upstreamNodeId: 'trigger_1',
      }),
    ).toThrowError(/failed to convert "not_a_number"/);
  });

  it('executes End handler, validates requiredFields, and blocks prototype-pollution paths across handlers', () => {
    const ctx = createExecutionContext({});
    ctx.nodeOutputs['trigger_1'] = {};
    ctx.nodeOutputs['action_approve'] = {
      decision: 'approved',
      routing: 'automatic',
      amount: 0, // falsy 0 must be accepted as a valid present field!
    };

    const endRes = executeEndNode({
      node: {
        id: 'end_1',
        type: 'end',
        name: 'Decision complete',
        version: 1,
        position: { x: 0, y: 0 },
        config: {
          label: 'Decision complete',
          outputSource: 'upstream',
          requiredFields: ['decision', 'routing', 'amount'],
        },
      },
      context: ctx,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'action_approve',
    });

    expect(endRes.isTerminal).toBe(true);
    expect(endRes.nextHandleIds).toEqual([]);
    expect(endRes.output).toEqual({
      decision: 'approved',
      routing: 'automatic',
      amount: 0,
    });

    // Missing required field throws ERR_MISSING_REQUIRED_OUTPUT_FIELD
    expect(() =>
      executeEndNode({
        node: {
          id: 'end_missing',
          type: 'end',
          name: 'Missing field end',
          version: 1,
          position: { x: 0, y: 0 },
          config: {
            label: 'Missing field end',
            outputSource: 'upstream',
            requiredFields: ['decision', 'auditSignature'],
          },
        },
        context: ctx,
        triggerNodeId: 'trigger_1',
        upstreamNodeId: 'action_approve',
      }),
    ).toThrowError(/missing required output field "auditSignature"/);

    // Prototype pollution path in handler config is rejected with ERR_FORBIDDEN_PATH
    expect(() =>
      executeNodeHandler({
        node: {
          id: 'tr_proto',
          type: 'transform',
          name: 'Proto attempt',
          version: 1,
          position: { x: 0, y: 0 },
          config: {
            label: 'Proto attempt',
            operation: 'selectField',
            source: 'upstream',
            fieldPath: '__proto__.polluted',
          },
        },
        context: ctx,
        triggerNodeId: 'trigger_1',
        upstreamNodeId: 'action_approve',
      }),
    ).toThrowError(/Forbidden property segment "__proto__"/);
  });
});

describe('Phase 5 Task 4 — Graph Adjacency Indexer and Deterministic Scheduler', () => {
  const executeWithScheduler = async (
    workflow: WorkflowDocument,
    input: Record<string, unknown>,
    options: Parameters<typeof runWorkflowSchedule>[3] = {},
  ) => {
    const ctx = createExecutionContext(input);
    const recorder = new TraceRecorder({
      workflow,
      input,
      now: options.now,
    });
    return runWorkflowSchedule(workflow, ctx, recorder, options);
  };

  it('executes a linear Trigger → Action → End workflow in deterministic order', async () => {
    const linearWorkflow: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'wf_linear',
      name: 'Linear workflow',
      revision: 1,
      createdAt: '2026-10-30T00:00:00.000Z',
      updatedAt: '2026-10-30T00:00:00.000Z',
      nodes: [
        {
          id: 'trig_1',
          type: 'trigger',
          name: 'Start',
          version: 1,
          position: { x: 0, y: 0 },
          config: {
            label: 'Start',
            inputSchema: { user: 'string' },
          },
        },
        {
          id: 'act_1',
          type: 'action',
          name: 'Format Greeting',
          version: 1,
          position: { x: 200, y: 0 },
          config: {
            label: 'Format Greeting',
            actionType: 'buildObject',
            fields: {
              greeting: { kind: 'literal', value: 'Hello' },
              user: { kind: 'ref', source: 'trig_1', path: 'user' },
            },
          },
        },
        {
          id: 'end_1',
          type: 'end',
          name: 'Done',
          version: 1,
          position: { x: 400, y: 0 },
          config: {
            label: 'Done',
            outputSource: 'upstream',
            requiredFields: ['greeting', 'user'],
          },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'trig_1',
          sourceHandle: 'next',
          target: 'act_1',
          targetHandle: 'in',
        },
        {
          id: 'e2',
          source: 'act_1',
          sourceHandle: 'next',
          target: 'end_1',
          targetHandle: 'in',
        },
      ],
    };

    const run = await executeWithScheduler(linearWorkflow, { user: 'Ada' });
    expect(run.status).toBe('success');
    expect(run.finalOutput).toEqual({ greeting: 'Hello', user: 'Ada' });
    expect(run.traversedEdgeIds).toEqual(['e1', 'e2']);

    const startedNodeIds = run.events
      .filter((e) => e.type === 'node.started')
      .map((e) => (e as Extract<ExecutionEvent, { type: 'node.started' }>).nodeId);
    expect(startedNodeIds).toEqual(['trig_1', 'act_1', 'end_1']);
  });

  it('executes diamond-convergent true and false branches accurately (Shared End executes exactly once and is never skipped)', async () => {
    // 1. True branch (amount: 4250 <= 10000)
    const lowRun = await executeWithScheduler(EXPENSE_APPROVAL_WORKFLOW, {
      amount: 4250,
      requester: 'ada@flowforge.dev',
      department: 'Core Platform',
    });

    expect(lowRun.status).toBe('success');
    expect(lowRun.finalOutput).toEqual({
      decision: 'approved',
      routing: 'automatic',
      amount: 4250,
      requester: 'ada@flowforge.dev',
    });

    // Node A (action_approve) executed; Node B (action_review) skipped; Shared End (end_1) executed exactly once!
    expect(lowRun.nodeTraces['trigger_1'].status).toBe('success');
    expect(lowRun.nodeTraces['condition_1'].status).toBe('success');
    expect(lowRun.nodeTraces['condition_1'].selectedHandleId).toBe('true');
    expect(lowRun.nodeTraces['action_approve'].status).toBe('success');
    expect(lowRun.nodeTraces['action_approve'].attempts).toBe(1);
    expect(lowRun.nodeTraces['action_review'].status).toBe('skipped');
    expect(lowRun.nodeTraces['action_review'].attempts).toBe(0);
    expect(lowRun.nodeTraces['end_1'].status).toBe('success');
    expect(lowRun.nodeTraces['end_1'].attempts).toBe(1);

    expect(lowRun.traversedEdgeIds).toEqual([
      'edge_trigger_to_cond',
      'edge_cond_true',
      'edge_approve_to_end',
    ]);

    // 2. False branch (amount: 18500 > 10000)
    const highRun = await executeWithScheduler(EXPENSE_APPROVAL_WORKFLOW, {
      amount: 18500,
      requester: 'linus@flowforge.dev',
      department: 'Infrastructure',
    });

    expect(highRun.status).toBe('success');
    expect(highRun.finalOutput).toEqual({
      decision: 'manual_review',
      routing: 'finance_committee',
      amount: 18500,
      requester: 'linus@flowforge.dev',
    });

    expect(highRun.nodeTraces['action_approve'].status).toBe('skipped');
    expect(highRun.nodeTraces['action_approve'].attempts).toBe(0);
    expect(highRun.nodeTraces['action_review'].status).toBe('success');
    expect(highRun.nodeTraces['action_review'].attempts).toBe(1);
    expect(highRun.nodeTraces['end_1'].status).toBe('success');
    expect(highRun.nodeTraces['end_1'].attempts).toBe(1);

    expect(highRun.traversedEdgeIds).toEqual([
      'edge_trigger_to_cond',
      'edge_cond_false',
      'edge_review_to_end',
    ]);
  });

  it('handles nested conditions and skips a downstream convergence node when ALL of its incoming branches are skipped', async () => {
    // Structure:
    // trig -> cond_outer (amount <= 10000)
    //   true  -> act_fast_approve -> end_shared
    //   false -> cond_inner (amount <= 50000)
    //              true  -> act_mgr_review -> tr_escalation_summary -> end_shared
    //              false -> act_exec_board -> tr_escalation_summary -> end_shared
    // When amount = 2500 (cond_outer is true):
    //   cond_inner, act_mgr_review, act_exec_board, AND tr_escalation_summary (which has 2 incoming edges, both skipped)
    //   must ALL be marked 'skipped', while end_shared still executes once via act_fast_approve!
    const nestedWorkflow: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'wf_nested_diamond',
      name: 'Nested diamond workflow',
      revision: 1,
      createdAt: '2026-10-30T00:00:00.000Z',
      updatedAt: '2026-10-30T00:00:00.000Z',
      nodes: [
        {
          id: 'trig',
          type: 'trigger',
          name: 'Trigger',
          version: 1,
          position: { x: 0, y: 0 },
          config: { label: 'Trigger', inputSchema: { amount: 'number' } },
        },
        {
          id: 'cond_outer',
          type: 'condition',
          name: 'Outer <= 10k',
          version: 1,
          position: { x: 200, y: 0 },
          config: {
            left: { source: 'trig', path: 'amount' },
            operator: 'lessThanOrEqual',
            right: { kind: 'literal', value: 10000 },
          },
        },
        {
          id: 'act_fast_approve',
          type: 'action',
          name: 'Fast Approve',
          version: 1,
          position: { x: 400, y: -100 },
          config: {
            label: 'Fast Approve',
            actionType: 'buildObject',
            fields: { tier: { kind: 'literal', value: 'fast_auto' } },
          },
        },
        {
          id: 'cond_inner',
          type: 'condition',
          name: 'Inner <= 50k',
          version: 1,
          position: { x: 400, y: 100 },
          config: {
            left: { source: 'trig', path: 'amount' },
            operator: 'lessThanOrEqual',
            right: { kind: 'literal', value: 50000 },
          },
        },
        {
          id: 'act_mgr_review',
          type: 'action',
          name: 'Manager Review',
          version: 1,
          position: { x: 600, y: 60 },
          config: {
            label: 'Manager Review',
            actionType: 'buildObject',
            fields: { tier: { kind: 'literal', value: 'manager' } },
          },
        },
        {
          id: 'act_exec_board',
          type: 'action',
          name: 'Exec Board',
          version: 1,
          position: { x: 600, y: 180 },
          config: {
            label: 'Exec Board',
            actionType: 'buildObject',
            fields: { tier: { kind: 'literal', value: 'board' } },
          },
        },
        {
          id: 'tr_escalation_summary',
          type: 'transform',
          name: 'Escalation Summary',
          version: 1,
          position: { x: 800, y: 120 },
          config: {
            label: 'Escalation Summary',
            operation: 'constructObject',
            constructedFields: {
              tier: { kind: 'ref', source: 'upstream', path: 'tier' },
            },
          },
        },
        {
          id: 'end_shared',
          type: 'end',
          name: 'Shared End',
          version: 1,
          position: { x: 1000, y: 0 },
          config: {
            label: 'Shared End',
            outputSource: 'upstream',
            requiredFields: ['tier'],
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trig', sourceHandle: 'next', target: 'cond_outer', targetHandle: 'in' },
        { id: 'e2', source: 'cond_outer', sourceHandle: 'true', target: 'act_fast_approve', targetHandle: 'in' },
        { id: 'e3', source: 'cond_outer', sourceHandle: 'false', target: 'cond_inner', targetHandle: 'in' },
        { id: 'e4', source: 'cond_inner', sourceHandle: 'true', target: 'act_mgr_review', targetHandle: 'in' },
        { id: 'e5', source: 'cond_inner', sourceHandle: 'false', target: 'act_exec_board', targetHandle: 'in' },
        { id: 'e6', source: 'act_mgr_review', sourceHandle: 'next', target: 'tr_escalation_summary', targetHandle: 'in' },
        { id: 'e7', source: 'act_exec_board', sourceHandle: 'next', target: 'tr_escalation_summary', targetHandle: 'in' },
        { id: 'e8', source: 'act_fast_approve', sourceHandle: 'next', target: 'end_shared', targetHandle: 'in' },
        { id: 'e9', source: 'tr_escalation_summary', sourceHandle: 'next', target: 'end_shared', targetHandle: 'in' },
      ],
    };

    // Case 1: amount = 2500 -> outer true; entire inner sub-diamond (including tr_escalation_summary) is skipped
    const runFast = await executeWithScheduler(nestedWorkflow, { amount: 2500 });
    expect(runFast.status).toBe('success');
    expect(runFast.finalOutput).toEqual({ tier: 'fast_auto' });
    expect(runFast.nodeTraces['cond_inner'].status).toBe('skipped');
    expect(runFast.nodeTraces['act_mgr_review'].status).toBe('skipped');
    expect(runFast.nodeTraces['act_exec_board'].status).toBe('skipped');
    expect(runFast.nodeTraces['tr_escalation_summary'].status).toBe('skipped');
    expect(runFast.nodeTraces['end_shared'].status).toBe('success');
    expect(runFast.nodeTraces['end_shared'].attempts).toBe(1);

    // Case 2: amount = 75000 -> outer false, inner false -> act_exec_board -> tr_escalation_summary -> end_shared
    const runBoard = await executeWithScheduler(nestedWorkflow, {
      amount: 75000,
    });
    expect(runBoard.status).toBe('success');
    expect(runBoard.finalOutput).toEqual({ tier: 'board' });
    expect(runBoard.nodeTraces['act_fast_approve'].status).toBe('skipped');
    expect(runBoard.nodeTraces['cond_inner'].status).toBe('success');
    expect(runBoard.nodeTraces['act_mgr_review'].status).toBe('skipped');
    expect(runBoard.nodeTraces['act_exec_board'].status).toBe('success');
    expect(runBoard.nodeTraces['tr_escalation_summary'].status).toBe('success');
    expect(runBoard.nodeTraces['end_shared'].status).toBe('success');
    expect(runBoard.nodeTraces['end_shared'].attempts).toBe(1);
  });

  it('prevents duplicate node execution when two active branches converge on the same node, and skips disconnected nodes safely', async () => {
    // Trigger fans out to act_a and act_b, both connecting to end_1; plus a disconnected node act_orphan -> end_1
    const fanoutWorkflow: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'wf_fanout',
      name: 'Fanout & disconnected test',
      revision: 1,
      createdAt: '2026-10-30T00:00:00.000Z',
      updatedAt: '2026-10-30T00:00:00.000Z',
      nodes: [
        {
          id: 'trig_1',
          type: 'trigger',
          name: 'Trigger',
          version: 1,
          position: { x: 0, y: 0 },
          config: { label: 'Trigger', inputSchema: { x: 'number' } },
        },
        {
          id: 'act_a',
          type: 'action',
          name: 'Branch A',
          version: 1,
          position: { x: 200, y: -50 },
          config: {
            label: 'Branch A',
            actionType: 'setValue',
            key: 'fromA',
            value: { kind: 'literal', value: true },
          },
        },
        {
          id: 'act_b',
          type: 'action',
          name: 'Branch B',
          version: 1,
          position: { x: 200, y: 50 },
          config: {
            label: 'Branch B',
            actionType: 'setValue',
            key: 'fromB',
            value: { kind: 'literal', value: true },
          },
        },
        {
          id: 'act_orphan',
          type: 'action',
          name: 'Disconnected Orphan',
          version: 1,
          position: { x: 200, y: 200 },
          config: {
            label: 'Disconnected Orphan',
            actionType: 'setValue',
            key: 'orphanRan',
            value: { kind: 'literal', value: true },
          },
        },
        {
          id: 'end_1',
          type: 'end',
          name: 'Shared End',
          version: 1,
          position: { x: 500, y: 0 },
          config: { label: 'Shared End', outputSource: 'upstream' },
        },
      ],
      edges: [
        { id: 'e_t_a', source: 'trig_1', sourceHandle: 'next', target: 'act_a', targetHandle: 'in' },
        { id: 'e_t_b', source: 'trig_1', sourceHandle: 'next', target: 'act_b', targetHandle: 'in' },
        { id: 'e_a_end', source: 'act_a', sourceHandle: 'next', target: 'end_1', targetHandle: 'in' },
        { id: 'e_b_end', source: 'act_b', sourceHandle: 'next', target: 'end_1', targetHandle: 'in' },
        { id: 'e_orphan_end', source: 'act_orphan', sourceHandle: 'next', target: 'end_1', targetHandle: 'in' },
      ],
    };

    const run = await executeWithScheduler(fanoutWorkflow, { x: 10 });
    expect(run.status).toBe('success');
    expect(run.nodeTraces['act_a'].status).toBe('success');
    expect(run.nodeTraces['act_a'].attempts).toBe(1);
    expect(run.nodeTraces['act_b'].status).toBe('success');
    expect(run.nodeTraces['act_b'].attempts).toBe(1);
    expect(run.nodeTraces['act_orphan'].status).toBe('skipped');
    expect(run.nodeTraces['act_orphan'].skipReason).toMatch(/Disconnected from Trigger/);
    expect(run.nodeTraces['end_1'].status).toBe('success');
    expect(run.nodeTraces['end_1'].attempts).toBe(1);
  });

  it('rejects invalid graph references, invalid handles, and cycles during indexing and scheduling', async () => {
    // 1. Broken edge reference
    const brokenEdgeWf: WorkflowDocument = structuredClone(
      EXPENSE_APPROVAL_WORKFLOW,
    );
    brokenEdgeWf.edges.push({
      id: 'e_broken',
      source: 'condition_1',
      sourceHandle: 'true',
      target: 'missing_node_99',
      targetHandle: 'in',
    });
    expect(() => buildGraphExecutionIndex(brokenEdgeWf)).toThrowError(
      /references missing target node "missing_node_99"/,
    );

    const brokenRun = await executeWithScheduler(brokenEdgeWf, {
      amount: 4250,
      requester: 'ada@flowforge.dev',
      department: 'Core',
    });
    expect(brokenRun.status).toBe('failed');
    expect(brokenRun.error?.code).toBe('ERR_BROKEN_EDGE_REFERENCE');

    // 2. Invalid sourceHandle on Condition node
    const badHandleWf: WorkflowDocument = structuredClone(
      EXPENSE_APPROVAL_WORKFLOW,
    );
    badHandleWf.edges[1].sourceHandle = 'maybe';
    expect(() => buildGraphExecutionIndex(badHandleWf)).toThrowError(
      /invalid output handle "maybe"/,
    );

    // 3. Cycle detection
    const cyclicWf: WorkflowDocument = structuredClone(
      EXPENSE_APPROVAL_WORKFLOW,
    );
    cyclicWf.edges.push({
      id: 'e_cycle',
      source: 'action_approve',
      sourceHandle: 'next',
      target: 'condition_1',
      targetHandle: 'in',
    });
    expect(() => buildGraphExecutionIndex(cyclicWf)).toThrowError(
      /Unsupported cycle detected/,
    );
  });

  it('enforces maxSteps execution budget, maxDurationMs timeout, and AbortSignal cancellation', async () => {
    // 1. maxSteps budget exceeded
    const budgetRun = await executeWithScheduler(
      EXPENSE_APPROVAL_WORKFLOW,
      {
        amount: 4250,
        requester: 'ada@flowforge.dev',
        department: 'Core',
      },
      { maxSteps: 2 },
    );
    expect(budgetRun.status).toBe('failed');
    expect(budgetRun.error?.code).toBe('ERR_MAX_STEPS_EXCEEDED');

    // 2. AbortSignal cancellation mid-run via onBeforeNodeStep hook
    const controller = new AbortController();
    const visitedBeforeAbort: string[] = [];

    const cancelledRun = await executeWithScheduler(
      EXPENSE_APPROVAL_WORKFLOW,
      {
        amount: 4250,
        requester: 'ada@flowforge.dev',
        department: 'Core',
      },
      {
        signal: controller.signal,
        onBeforeNodeStep: (node) => {
          visitedBeforeAbort.push(node.id);
          if (node.id === 'condition_1') {
            controller.abort();
          }
        },
      },
    );

    expect(cancelledRun.status).toBe('cancelled');
    expect(visitedBeforeAbort).toEqual(['trigger_1', 'condition_1']);
    expect(cancelledRun.nodeTraces['trigger_1'].status).toBe('success');
    expect(cancelledRun.nodeTraces['condition_1'].status).toBe('pending');
  });
});

describe('Phase 5 Task 5 — Top-Level Workflow Executor (executeWorkflow)', () => {
  it('executes all 4 starter templates end-to-end across both true and false branches using executeWorkflow()', async () => {
    // 1. Expense Approval (default sampleInput = 4250 -> true branch; 25000 -> false branch)
    const expDefault = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    expect(expDefault.status).toBe('success');
    expect(expDefault.finalOutput).toEqual({
      decision: 'approved',
      routing: 'automatic',
      amount: 4250,
      requester: 'ada@flowforge.dev',
    });

    const expHigh = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      input: {
        amount: 25000,
        requester: 'linus@flowforge.dev',
        department: 'Systems',
      },
    });
    expect(expHigh.status).toBe('success');
    expect(expHigh.finalOutput).toEqual({
      decision: 'manual_review',
      routing: 'finance_committee',
      amount: 25000,
      requester: 'linus@flowforge.dev',
    });

    // 2. Registration Form Validation (non-empty email -> valid: true; empty email -> valid: false)
    const formValid = await executeWorkflow(FORM_VALIDATION_WORKFLOW);
    expect(formValid.status).toBe('success');
    expect(formValid.finalOutput).toEqual({
      valid: true,
      email: 'grace@flowforge.dev',
      fullName: 'Grace Hopper',
    });
    expect(formValid.nodeTraces['action_valid'].status).toBe('success');
    expect(formValid.nodeTraces['action_reject'].status).toBe('skipped');

    const formReject = await executeWorkflow(FORM_VALIDATION_WORKFLOW, {
      input: {
        email: '   ',
        fullName: 'Grace Hopper',
        role: 'developer',
      },
    });
    expect(formReject.status).toBe('success');
    expect(formReject.finalOutput).toEqual({
      valid: false,
      reason: 'Email address is required',
    });
    expect(formReject.nodeTraces['action_valid'].status).toBe('skipped');
    expect(formReject.nodeTraces['action_reject'].status).toBe('success');

    // 3. Telemetry Priority Filter (latencyMs: 820 > 500 -> sla_breach; latencyMs: 120 -> normal)
    const telemetryBreach = await executeWorkflow(DATA_FILTERING_WORKFLOW);
    expect(telemetryBreach.status).toBe('success');
    expect(telemetryBreach.finalOutput).toEqual({
      classification: 'sla_breach',
      service: 'checkout-api',
      latencyMs: 820,
    });
    expect(telemetryBreach.nodeTraces['transform_alert'].status).toBe('success');
    expect(telemetryBreach.nodeTraces['action_normal'].status).toBe('skipped');

    const telemetryNormal = await executeWorkflow(DATA_FILTERING_WORKFLOW, {
      input: {
        service: 'checkout-api',
        latencyMs: 120,
        region: 'us-east',
      },
    });
    expect(telemetryNormal.status).toBe('success');
    expect(telemetryNormal.finalOutput).toEqual({
      classification: 'normal',
      service: 'checkout-api',
      latencyMs: 120,
    });
    expect(telemetryNormal.nodeTraces['transform_alert'].status).toBe('skipped');
    expect(telemetryNormal.nodeTraces['action_normal'].status).toBe('success');

    // 4. Incident Notification Dispatch (severity: 'critical' -> pager_immediate; 'low' -> email_digest)
    const notifyPage = await executeWorkflow(NOTIFICATION_FLOW_WORKFLOW);
    expect(notifyPage.status).toBe('success');
    expect(notifyPage.finalOutput).toEqual({
      channel: 'pager_immediate',
      summary: 'Database replica lag elevated',
      owner: 'oncall-sre',
    });
    expect(notifyPage.nodeTraces['action_page'].status).toBe('success');
    expect(notifyPage.nodeTraces['action_digest'].status).toBe('skipped');

    const notifyDigest = await executeWorkflow(NOTIFICATION_FLOW_WORKFLOW, {
      input: {
        severity: 'low',
        summary: 'Routine cache eviction',
        owner: 'oncall-sre',
      },
    });
    expect(notifyDigest.status).toBe('success');
    expect(notifyDigest.finalOutput).toEqual({
      channel: 'email_digest',
      summary: 'Routine cache eviction',
      owner: 'oncall-sre',
    });
    expect(notifyDigest.nodeTraces['action_page'].status).toBe('skipped');
    expect(notifyDigest.nodeTraces['action_digest'].status).toBe('success');
  });

  it('rejects invalid workflows before execution (FR-024) without invoking any node handler', async () => {
    const invalidWorkflow: WorkflowDocument = structuredClone(
      EXPENSE_APPROVAL_WORKFLOW,
    );
    // Remove Trigger node to make workflow invalid
    invalidWorkflow.nodes = invalidWorkflow.nodes.filter(
      (n) => n.type !== 'trigger',
    );

    let handlerInvocations = 0;
    const run = await executeWorkflow(invalidWorkflow, {
      nodeRunner: (params) => {
        handlerInvocations += 1;
        return executeNodeHandler(params);
      },
    });

    expect(handlerInvocations).toBe(0);
    expect(run.status).toBe('failed');
    expect(run.error?.code).toBe('ERR_WORKFLOW_INVALID');
    expect(run.events.map((e) => e.type)).toEqual([
      'run.started',
      'run.failed',
    ]);
  });

  it('validates Trigger inputs and records structured handler failures with fail-fast termination', async () => {
    // 1. Missing required trigger input field
    const missingInputRun = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      input: {
        amount: 4250,
        // requester and department omitted
      },
    });
    expect(missingInputRun.status).toBe('failed');
    expect(missingInputRun.error?.code).toBe('ERR_MISSING_TRIGGER_INPUT_FIELD');
    expect(missingInputRun.nodeTraces['trigger_1'].status).toBe('failed');
    expect(missingInputRun.nodeTraces['condition_1'].status).toBe('pending');

    // 2. Non-object runtime input (array cast as input)
    const arrayInputRun = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      input: ['bad'] as unknown as Record<string, unknown>,
    });
    expect(arrayInputRun.status).toBe('failed');
    expect(arrayInputRun.error?.code).toBe('ERR_INVALID_TRIGGER_INPUT');
    expect(arrayInputRun.nodeTraces['trigger_1'].status).toBe('failed');

    // 3. Downstream handler failure (End node missing a required output field)
    const failingEndWf: WorkflowDocument = structuredClone(
      EXPENSE_APPROVAL_WORKFLOW,
    );
    const endNode = failingEndWf.nodes.find((n) => n.id === 'end_1');
    if (endNode && endNode.type === 'end') {
      endNode.config.requiredFields = [
        'decision',
        'routing',
        'amount',
        'executiveSignoffToken',
      ];
    }

    const failedEndRun = await executeWorkflow(failingEndWf, {
      input: {
        amount: 4250,
        requester: 'ada@flowforge.dev',
        department: 'Core',
      },
    });
    expect(failedEndRun.status).toBe('failed');
    expect(failedEndRun.error?.code).toBe('ERR_MISSING_REQUIRED_OUTPUT_FIELD');
    expect(failedEndRun.error?.nodeId).toBe('end_1');
    expect(failedEndRun.nodeTraces['end_1'].status).toBe('failed');
  });

  it('enforces AbortSignal cancellation (before and during execution), maxSteps, maxDurationMs, and handlerTimeoutMs', async () => {
    // 1. Pre-aborted AbortSignal before execution starts
    const preAborted = new AbortController();
    preAborted.abort();
    const preCancelledRun = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      signal: preAborted.signal,
    });
    expect(preCancelledRun.status).toBe('cancelled');
    expect(preCancelledRun.events.map((e) => e.type)).toEqual([
      'run.started',
      'run.cancelled',
    ]);

    // 2. maxSteps budget via executeWorkflow
    const maxStepsRun = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      maxSteps: 3,
    });
    expect(maxStepsRun.status).toBe('failed');
    expect(maxStepsRun.error?.code).toBe('ERR_MAX_STEPS_EXCEEDED');

    // 3. maxDurationMs total workflow timeout
    let clock = 1000;
    const durationRun = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      maxDurationMs: 50,
      now: () => {
        clock += 30;
        return clock;
      },
    });
    expect(durationRun.status).toBe('failed');
    expect(durationRun.error?.code).toBe('ERR_EXECUTION_TIMEOUT');

    // 4. handlerTimeoutMs for a slow async node handler
    const asyncTimeoutRun = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      handlerTimeoutMs: 25,
      nodeRunner: async (params) => {
        if (params.node.id === 'action_approve') {
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        return executeNodeHandler(params);
      },
    });
    expect(asyncTimeoutRun.status).toBe('failed');
    expect(asyncTimeoutRun.error?.code).toBe('ERR_HANDLER_TIMEOUT');
    expect(asyncTimeoutRun.error?.nodeId).toBe('action_approve');
    expect(asyncTimeoutRun.nodeTraces['action_approve'].status).toBe('failed');
  });

  it('maintains completely isolated execution contexts and run records across concurrent and sequential runs', async () => {
    const [runA, runB] = await Promise.all([
      executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
        runId: 'run_isolated_low',
        input: {
          amount: 1200,
          requester: 'alice@flowforge.dev',
          department: 'Design',
        },
      }),
      executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
        runId: 'run_isolated_high',
        input: {
          amount: 45000,
          requester: 'bob@flowforge.dev',
          department: 'Security',
        },
      }),
    ]);

    expect(runA.runId).toBe('run_isolated_low');
    expect(runB.runId).toBe('run_isolated_high');

    expect(runA.finalOutput).toEqual({
      decision: 'approved',
      routing: 'automatic',
      amount: 1200,
      requester: 'alice@flowforge.dev',
    });
    expect(runB.finalOutput).toEqual({
      decision: 'manual_review',
      routing: 'finance_committee',
      amount: 45000,
      requester: 'bob@flowforge.dev',
    });

    expect(runA.nodeTraces['action_approve'].status).toBe('success');
    expect(runA.nodeTraces['action_review'].status).toBe('skipped');
    expect(runB.nodeTraces['action_approve'].status).toBe('skipped');
    expect(runB.nodeTraces['action_review'].status).toBe('success');
  });
});

describe('Phase 5 Task 6 — Coverage Audit & Edge-Case Verification', () => {
  it('finalizes in-flight node traces as skipped upon mid-handler cancellation and cleans up AbortSignal listeners across all settlement paths', async () => {
    // 1. Mid-flight async cancellation while action_approve is awaiting
    const midFlightController = new AbortController();
    const midFlightAddSpy = vi.spyOn(midFlightController.signal, 'addEventListener');
    const midFlightRemoveSpy = vi.spyOn(midFlightController.signal, 'removeEventListener');

    const midFlightRun = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      signal: midFlightController.signal,
      handlerTimeoutMs: 5000,
      nodeRunner: async (params) => {
        if (params.node.id === 'action_approve') {
          await new Promise<void>((resolve) => {
            setTimeout(() => {
              midFlightController.abort();
              resolve();
            }, 15);
          });
        }
        return executeNodeHandler(params);
      },
    });

    expect(midFlightRun.status).toBe('cancelled');
    expect(midFlightRun.events.at(-1)?.type).toBe('run.cancelled');
    expect(midFlightRun.nodeTraces['action_approve'].status).toBe('skipped');
    expect(midFlightRun.nodeTraces['action_approve'].skipReason).toBe(
      'Run cancelled while node was executing',
    );
    expect(midFlightRun.nodeTraces['action_approve'].completedAt).toBeDefined();
    expect(midFlightRun.nodeTraces['action_approve'].durationMs).toBeGreaterThanOrEqual(0);
    // Every addEventListener on the AbortSignal must have a matching removeEventListener
    expect(midFlightRemoveSpy.mock.calls.length).toBe(midFlightAddSpy.mock.calls.length);

    // 2. Verify AbortSignal listener cleanup when handlerTimeoutMs rejects before abort
    const timeoutController = new AbortController();
    const timeoutAddSpy = vi.spyOn(timeoutController.signal, 'addEventListener');
    const timeoutRemoveSpy = vi.spyOn(timeoutController.signal, 'removeEventListener');

    const timeoutRun = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      signal: timeoutController.signal,
      handlerTimeoutMs: 20,
      nodeRunner: async (params) => {
        if (params.node.id === 'action_approve') {
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        return executeNodeHandler(params);
      },
    });

    expect(timeoutRun.status).toBe('failed');
    expect(timeoutRun.error?.code).toBe('ERR_HANDLER_TIMEOUT');
    expect(timeoutRemoveSpy.mock.calls.length).toBeGreaterThan(0);
    expect(timeoutRemoveSpy.mock.calls.length).toBe(timeoutAddSpy.mock.calls.length);
  });

  it('enforces synchronous post-step handlerTimeoutMs checks when a step exceeds the configured per-node timeout', async () => {
    let clock = 1000;
    const syncTimeoutRun = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      handlerTimeoutMs: 50,
      now: () => clock,
      nodeRunner: (params) => {
        if (params.node.id === 'action_approve') {
          // Simulate a synchronous handler taking 75ms (> 50ms budget)
          clock += 75;
        } else {
          clock += 5;
        }
        return executeNodeHandler(params);
      },
    });

    expect(syncTimeoutRun.status).toBe('failed');
    expect(syncTimeoutRun.error?.code).toBe('ERR_HANDLER_TIMEOUT');
    expect(syncTimeoutRun.error?.nodeId).toBe('action_approve');
    expect(syncTimeoutRun.nodeTraces['action_approve'].status).toBe('failed');
    expect(syncTimeoutRun.events.some((e) => e.type === 'node.failed')).toBe(true);
    expect(syncTimeoutRun.events.at(-1)?.type).toBe('run.failed');
  });

  it('rejects malformed node configurations across all 5 node handlers and rejects unsupported node handler types', () => {
    const context = createExecutionContext({ amount: 100 });
    const badConfig = { invalidField: 123 } as unknown as never;

    const makeBadNode = <T extends WorkflowNodeBase['type']>(
      id: string,
      type: T,
    ): WorkflowNodeBase<T> => ({
      id,
      type,
      name: id,
      version: 1,
      position: { x: 0, y: 0 },
      config: badConfig,
    });

    expect(() =>
      executeTriggerNode({
        node: makeBadNode('bad_trig', 'trigger'),
        context,
        triggerNodeId: 'bad_trig',
      }),
    ).toThrowError(EngineExecutionError);

    expect(() =>
      executeConditionNode({
        node: makeBadNode('bad_cond', 'condition'),
        context,
        triggerNodeId: 'trigger_1',
      }),
    ).toThrowError(EngineExecutionError);

    expect(() =>
      executeActionNode({
        node: makeBadNode('bad_act', 'action'),
        context,
        triggerNodeId: 'trigger_1',
      }),
    ).toThrowError(EngineExecutionError);

    expect(() =>
      executeTransformNode({
        node: makeBadNode('bad_xform', 'transform'),
        context,
        triggerNodeId: 'trigger_1',
      }),
    ).toThrowError(EngineExecutionError);

    expect(() =>
      executeEndNode({
        node: makeBadNode('bad_end', 'end'),
        context,
        triggerNodeId: 'trigger_1',
      }),
    ).toThrowError(EngineExecutionError);

    try {
      executeActionNode({
        node: makeBadNode('bad_act', 'action'),
        context,
        triggerNodeId: 'trigger_1',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(EngineExecutionError);
      expect((err as EngineExecutionError).structured.code).toBe(
        'ERR_INVALID_NODE_CONFIG',
      );
      expect((err as EngineExecutionError).structured.nodeId).toBe('bad_act');
    }

    // Non-MVP node type passed to executeNodeHandler
    const unsupportedNode = {
      id: 'node_delay_1',
      type: 'delay',
      name: 'Unsupported Delay',
      version: 1,
      position: { x: 0, y: 0 },
      config: {},
    } as unknown as WorkflowNodeBase;

    try {
      executeNodeHandler({
        node: unsupportedNode,
        context,
        triggerNodeId: 'trigger_1',
      });
      expect.fail('Expected executeNodeHandler to throw ERR_UNSUPPORTED_NODE_HANDLER');
    } catch (err) {
      expect(err).toBeInstanceOf(EngineExecutionError);
      expect((err as EngineExecutionError).structured.code).toBe(
        'ERR_UNSUPPORTED_NODE_HANDLER',
      );
      expect((err as EngineExecutionError).structured.nodeId).toBe(
        'node_delay_1',
      );
    }
  });
});






