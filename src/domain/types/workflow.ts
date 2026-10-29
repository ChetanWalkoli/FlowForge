/**
 * FlowForge — Core Domain Types
 * Pure TypeScript definitions with zero React or UI dependencies.
 */

export type NodeStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped';

export type RunStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'paused'
  | 'success'
  | 'failed'
  | 'cancelled';

export type PortDataType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'any';

export type NodeCategory =
  | 'triggers'
  | 'logic'
  | 'data'
  | 'actions'
  | 'flow';

export type NodeType =
  | 'trigger'
  | 'condition'
  | 'action'
  | 'transform'
  | 'end'
  | 'delay'
  | 'retry'
  | 'loop'
  | 'merge';

export type WorkflowLifecycleStatus =
  | 'draft'
  | 'validated'
  | 'tested'
  | 'published';

export type SaveStatus =
  | 'saved'
  | 'unsaved'
  | 'saving'
  | 'error';

export interface PortDefinition {
  id: string;
  label: string;
  direction: 'input' | 'output';
  dataType: PortDataType;
  required?: boolean;
  maxConnections?: number;
}

export type PrimitiveTypeName = 'string' | 'number' | 'boolean' | 'object' | 'array';

// --- Node Configurations ---

export interface TriggerNodeConfig {
  label: string;
  inputSchema: Record<string, PrimitiveTypeName>;
  sampleInput?: Record<string, unknown>;
}

export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'contains';

export interface OperandReference {
  source: string; // "trigger" | "upstream" | <nodeId>
  path: string;   // dot-separated path, e.g. "amount" or "user.email"
}

export type RightOperand =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'ref'; source: string; path: string };

export interface ConditionNodeConfig {
  description?: string;
  left: OperandReference;
  operator: ConditionOperator;
  right?: RightOperand;
}

export type ActionOperationType =
  | 'setValue'
  | 'buildObject'
  | 'appendLog'
  | 'returnResult';

export type ValueMappingEntry =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'ref'; source: string; path: string };

export interface ActionNodeConfig {
  label: string;
  actionType: ActionOperationType;
  key?: string;
  value?: ValueMappingEntry;
  fields?: Record<string, ValueMappingEntry>;
  logMessage?: string;
}

export type TransformOperationType =
  | 'selectField'
  | 'renameFields'
  | 'constructObject'
  | 'convertType';

export interface TransformNodeConfig {
  label: string;
  operation: TransformOperationType;
  source?: string;
  fieldPath?: string;
  targetType?: 'string' | 'number' | 'boolean';
  fieldMappings?: Record<string, string>;
  constructedFields?: Record<string, ValueMappingEntry>;
}

export interface EndNodeConfig {
  label: string;
  outputSource?: string; // "upstream" | <nodeId>
  requiredFields?: string[];
}

export interface DelayNodeConfig {
  label: string;
  durationMs: number;
}

export interface RetryNodeConfig {
  label: string;
  maxAttempts: number;
  backoffMs: number;
  simulateFailuresBeforeSuccess?: number;
}

export interface LoopNodeConfig {
  label: string;
  arraySource: OperandReference;
  maxIterations: number;
  itemVariable: string;
}

export interface MergeNodeConfig {
  label: string;
  strategy: 'combineObjects' | 'collectArray' | 'firstCompleted';
  expectedBranches: number;
}

export type NodeConfigMap = {
  trigger: TriggerNodeConfig;
  condition: ConditionNodeConfig;
  action: ActionNodeConfig;
  transform: TransformNodeConfig;
  end: EndNodeConfig;
  delay: DelayNodeConfig;
  retry: RetryNodeConfig;
  loop: LoopNodeConfig;
  merge: MergeNodeConfig;
};

export type AnyNodeConfig = NodeConfigMap[NodeType];

export interface WorkflowNodeBase<T extends NodeType = NodeType> {
  id: string;
  type: T;
  name: string;
  version: number;
  position: { x: number; y: number };
  config: NodeConfigMap[T];
}

export type WorkflowNode =
  | WorkflowNodeBase<'trigger'>
  | WorkflowNodeBase<'condition'>
  | WorkflowNodeBase<'action'>
  | WorkflowNodeBase<'transform'>
  | WorkflowNodeBase<'end'>
  | WorkflowNodeBase<'delay'>
  | WorkflowNodeBase<'retry'>
  | WorkflowNodeBase<'loop'>
  | WorkflowNodeBase<'merge'>;

export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
  label?: string;
}

export interface WorkflowDocument {
  format: 'flowforge.workflow';
  formatVersion: 1;
  id: string;
  name: string;
  description?: string;
  revision: number;
  status?: WorkflowLifecycleStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

// --- Validation Types ---

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  id: string;
  code: string;
  severity: ValidationSeverity;
  message: string;
  remediation: string;
  nodeId?: string;
  edgeId?: string;
  fieldPath?: string;
}

export interface ValidationReport {
  valid: boolean;
  canExecute: boolean;
  issues: ValidationIssue[];
  errorsCount: number;
  warningsCount: number;
}

// --- Execution & TraceLab Types ---

export interface ExecutionContext {
  input: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  variables: Record<string, unknown>;
  logs: Array<{
    nodeId: string;
    message: string;
    timestamp: number;
  }>;
}

export interface ConditionEvaluationReason {
  leftSource: string;
  leftPath: string;
  leftValue: unknown;
  operator: ConditionOperator;
  rightValue: unknown;
  result: boolean;
  explanation: string;
}

export interface StructuredExecutionError {
  code: string;
  message: string;
  nodeId?: string;
  details?: unknown;
  remediation?: string;
}

export type ExecutionEvent =
  | { type: 'run.started'; runId: string; workflowId: string; revision: number; input: Record<string, unknown>; timestamp: number }
  | { type: 'node.started'; nodeId: string; nodeName: string; nodeType: NodeType; input: unknown; attempt: number; timestamp: number }
  | {
      type: 'node.completed';
      nodeId: string;
      nodeName: string;
      nodeType: NodeType;
      input: unknown;
      output: unknown;
      durationMs: number;
      attempt: number;
      timestamp: number;
    }
  | {
      type: 'branch.selected';
      nodeId: string;
      handleId: string;
      reason: ConditionEvaluationReason;
      timestamp: number;
    }
  | {
      type: 'node.failed';
      nodeId: string;
      nodeName: string;
      nodeType: NodeType;
      input: unknown;
      error: StructuredExecutionError;
      durationMs: number;
      attempt: number;
      timestamp: number;
    }
  | { type: 'node.skipped'; nodeId: string; nodeName: string; reason: string; timestamp: number }
  | { type: 'run.completed'; runId: string; output: unknown; durationMs: number; timestamp: number }
  | { type: 'run.failed'; runId: string; error: StructuredExecutionError; durationMs: number; timestamp: number }
  | { type: 'run.cancelled'; runId: string; durationMs: number; timestamp: number };

export interface NodeExecutionTrace {
  nodeId: string;
  nodeName: string;
  nodeType: NodeType;
  status: NodeStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  attempts: number;
  input?: unknown;
  output?: unknown;
  conditionReason?: ConditionEvaluationReason;
  selectedHandleId?: string;
  skipReason?: string;
  error?: StructuredExecutionError;
}

export interface WorkflowRunRecord {
  runId: string;
  workflowId: string;
  workflowName: string;
  revision: number;
  status: RunStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  input: Record<string, unknown>;
  finalOutput?: unknown;
  error?: StructuredExecutionError;
  events: ExecutionEvent[];
  nodeTraces: Record<string, NodeExecutionTrace>;
  traversedEdgeIds: string[];
}

