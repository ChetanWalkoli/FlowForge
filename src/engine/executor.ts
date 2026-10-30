/**
 * FlowForge — Top-Level Workflow Executor
 * Validates workflows before execution, initializes isolated execution context and trace recording,
 * enforces safety budgets (`maxSteps`, `maxDurationMs`, `handlerTimeoutMs`) and `AbortSignal` cancellation,
 * and returns a complete `WorkflowRunRecord`.
 *
 * Pure TypeScript module with zero React, Zustand, DOM, or IndexedDB dependencies.
 * Never uses eval() or new Function().
 */

import type {
  StructuredExecutionError,
  WorkflowDocument,
  WorkflowNode,
  WorkflowRunRecord,
} from '../domain/types/workflow';
import { validateWorkflow } from '../domain/validation/graph-validator';
import { createExecutionContext, validateTriggerInput } from './context';
import {
  DEFAULT_HANDLER_TIMEOUT_MS,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_MAX_STEPS,
  runWorkflowSchedule,
  type NodeHandlerRunner,
} from './scheduler';
import { TraceRecorder, type ExecutionEventListener } from './trace';

export interface ExecuteWorkflowOptions {
  runId?: string;
  input?: Record<string, unknown>;
  signal?: AbortSignal;
  maxSteps?: number;
  maxDurationMs?: number;
  handlerTimeoutMs?: number;
  now?: () => number;
  onEvent?: ExecutionEventListener;
  onBeforeNodeStep?: (node: WorkflowNode) => Promise<void> | void;
  /**
   * Optional handler runner override for testing async handler timeouts or custom execution hooks.
   * Note: In single-threaded JavaScript, a timer/Promise race stops awaiting an asynchronous handler
   * after `handlerTimeoutMs` and verifies elapsed clock time after synchronous return; all built-in
   * FlowForge handlers are synchronous, bounded, and eval-free.
   */
  nodeRunner?: NodeHandlerRunner;
}

/**
 * Executes a FlowForge workflow document deterministically from its Trigger node.
 *
 * Lifecycle:
 * 1. Validates the workflow structure and node schemas via `validateWorkflow(workflow)` (`FR-024`).
 *    If any blocking error exists, fails immediately with `ERR_WORKFLOW_INVALID` without running any handler.
 * 2. Resolves runtime input (`options.input` or the Trigger node's `sampleInput`).
 * 3. Creates an isolated `ExecutionContext` and `TraceRecorder`.
 * 4. Runs the deterministic `runWorkflowSchedule` loop with `AbortSignal`, `maxSteps` (default 500),
 *    `maxDurationMs` (default 30,000ms), and `handlerTimeoutMs` (default 5,000ms).
 * 5. Returns an immutable `WorkflowRunRecord` snapshot.
 */
export async function executeWorkflow(
  workflow: WorkflowDocument,
  options: ExecuteWorkflowOptions = {},
): Promise<WorkflowRunRecord> {
  const now = options.now ?? (() => Date.now());

  const triggerNode = workflow.nodes.find((n) => n.type === 'trigger');
  const rawInput: unknown =
    options.input !== undefined
      ? options.input
      : triggerNode && triggerNode.type === 'trigger'
        ? (triggerNode.config.sampleInput ?? {})
        : {};

  const safeRecordInput: Record<string, unknown> =
    typeof rawInput === 'object' && rawInput !== null && !Array.isArray(rawInput)
      ? structuredClone(rawInput as Record<string, unknown>)
      : {};

  // 1. Pre-execution static graph & schema validation gate (FR-024)
  const validationReport = validateWorkflow(workflow);
  if (!validationReport.canExecute) {
    const firstBlockingError =
      validationReport.issues.find((i) => i.severity === 'error') ??
      validationReport.issues[0];

    const recorder = new TraceRecorder({
      runId: options.runId,
      workflow,
      input: safeRecordInput,
      now,
      onEvent: options.onEvent,
    });

    const structuredError: StructuredExecutionError = {
      code: 'ERR_WORKFLOW_INVALID',
      message:
        firstBlockingError?.message ??
        'Workflow failed pre-execution validation.',
      nodeId: firstBlockingError?.nodeId,
      remediation:
        firstBlockingError?.remediation ??
        'Resolve all blocking validation errors before running the workflow.',
      details: {
        validationCode: firstBlockingError?.code,
        errorsCount: validationReport.errorsCount,
        issues: validationReport.issues,
      },
    };

    recorder.recordRunStarted(now());
    recorder.recordRunFailed(structuredError, now());
    return recorder.getSnapshot();
  }

  // 2. Check if caller supplied a non-object input payload at runtime
  if (
    typeof rawInput !== 'object' ||
    rawInput === null ||
    Array.isArray(rawInput)
  ) {
    const recorder = new TraceRecorder({
      runId: options.runId,
      workflow,
      input: {},
      now,
      onEvent: options.onEvent,
    });

    const tNode = triggerNode!;
    const inputErr = validateTriggerInput(
      rawInput,
      tNode.type === 'trigger' ? tNode.config.inputSchema : {},
      tNode.id,
    )!;

    recorder.recordRunStarted(now());
    recorder.recordNodeStarted(tNode, rawInput, 1, now());
    recorder.recordNodeFailed(tNode, rawInput, inputErr, 1, now());
    recorder.recordRunFailed(inputErr, now());
    return recorder.getSnapshot();
  }

  // 3. Initialize isolated ExecutionContext and TraceRecorder
  const context = createExecutionContext(safeRecordInput);
  const recorder = new TraceRecorder({
    runId: options.runId,
    workflow,
    input: safeRecordInput,
    now,
    onEvent: options.onEvent,
  });

  // 4. Delegate to the deterministic graph scheduler
  return runWorkflowSchedule(workflow, context, recorder, {
    signal: options.signal,
    maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS,
    maxDurationMs: options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS,
    handlerTimeoutMs: options.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS,
    now,
    onBeforeNodeStep: options.onBeforeNodeStep,
    nodeRunner: options.nodeRunner,
  });
}

