/**
 * FlowForge — Execution Engine Public API
 * Pure TypeScript runtime barrel export (independent of React, Zustand, DOM, and IndexedDB).
 */

export {
  createExecutionContext,
  describeValueType,
  EngineExecutionError,
  matchesPrimitiveType,
  resolveDotPath,
  resolveOperandReference,
  resolveSourcePayload,
  resolveValueMappingEntry,
  toStructuredExecutionError,
  validateTriggerInput,
  type SourceResolutionCursor,
} from './context';

export {
  createRunId,
  TraceRecorder,
  type ExecutionEventListener,
  type TraceRecorderOptions,
} from './trace';

export {
  executeActionNode,
  executeConditionNode,
  executeEndNode,
  executeNodeHandler,
  executeTransformNode,
  executeTriggerNode,
  type NodeHandlerInput,
  type NodeHandlerResult,
} from './handlers';

export {
  buildGraphExecutionIndex,
  DEFAULT_HANDLER_TIMEOUT_MS,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_MAX_STEPS,
  runWorkflowSchedule,
  type GraphExecutionIndex,
  type NodeHandlerRunner,
  type NormalizedWorkflowEdge,
  type SchedulerOptions,
} from './scheduler';

export {
  executeWorkflow,
  type ExecuteWorkflowOptions,
} from './executor';

