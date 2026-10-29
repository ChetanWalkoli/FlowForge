/**
 * FlowForge — Node Type Registry & Port Definitions
 * Defines the metadata, ports, and default configurations for all supported node types.
 */

import type {
  NodeCategory,
  NodeConfigMap,
  NodeType,
  PortDataType,
  PortDefinition,
} from '../types/workflow';

export interface NodeTypeSpecification<T extends NodeType = NodeType> {
  type: T;
  label: string;
  category: NodeCategory;
  subtitle: string;
  description: string;
  iconName: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  createDefaultConfig: () => NodeConfigMap[T];
  isMvp: boolean;
}

export const NODE_REGISTRY: { [K in NodeType]: NodeTypeSpecification<K> } = {
  trigger: {
    type: 'trigger',
    label: 'Trigger',
    category: 'triggers',
    subtitle: 'Entry point & input schema',
    description:
      'Defines the workflow entry point, expected input schema, and default sample payload.',
    iconName: 'Play',
    inputs: [],
    outputs: [
      {
        id: 'next',
        label: 'Out',
        direction: 'output',
        dataType: 'object',
        required: true,
      },
    ],
    createDefaultConfig: () => ({
      label: 'Workflow trigger',
      inputSchema: {
        amount: 'number',
        requester: 'string',
      },
      sampleInput: {
        amount: 4500,
        requester: 'ada@example.com',
      },
    }),
    isMvp: true,
  },
  condition: {
    type: 'condition',
    label: 'Condition',
    category: 'logic',
    subtitle: 'True / False branch decision',
    description:
      'Evaluates a safe comparison between an input value and a literal or reference operand, routing execution to Either the true or false handle.',
    iconName: 'GitBranch',
    inputs: [
      {
        id: 'in',
        label: 'In',
        direction: 'input',
        dataType: 'any',
        required: true,
      },
    ],
    outputs: [
      {
        id: 'true',
        label: 'True',
        direction: 'output',
        dataType: 'any',
        required: true,
      },
      {
        id: 'false',
        label: 'False',
        direction: 'output',
        dataType: 'any',
        required: true,
      },
    ],
    createDefaultConfig: () => ({
      description: 'Compare value',
      left: {
        source: 'trigger',
        path: 'amount',
      },
      operator: 'lessThanOrEqual',
      right: {
        kind: 'literal',
        value: 10000,
      },
    }),
    isMvp: true,
  },
  action: {
    type: 'action',
    label: 'Action',
    category: 'actions',
    subtitle: 'Controlled state or output operation',
    description:
      'Performs a controlled, deterministic action such as building an output object, setting a result field, or recording a structured log message.',
    iconName: 'Zap',
    inputs: [
      {
        id: 'in',
        label: 'In',
        direction: 'input',
        dataType: 'any',
        required: true,
      },
    ],
    outputs: [
      {
        id: 'next',
        label: 'Out',
        direction: 'output',
        dataType: 'any',
        required: false,
      },
    ],
    createDefaultConfig: () => ({
      label: 'Build result',
      actionType: 'buildObject',
      fields: {
        status: { kind: 'literal', value: 'approved' },
        amount: { kind: 'ref', source: 'trigger', path: 'amount' },
      },
    }),
    isMvp: true,
  },
  transform: {
    type: 'transform',
    label: 'Transform',
    category: 'data',
    subtitle: 'Map, extract, or convert data',
    description:
      'Transforms structured data using safe operations: selecting a field by path, renaming keys, constructing an object, or converting primitive types.',
    iconName: 'Shuffle',
    inputs: [
      {
        id: 'in',
        label: 'In',
        direction: 'input',
        dataType: 'any',
        required: true,
      },
    ],
    outputs: [
      {
        id: 'next',
        label: 'Out',
        direction: 'output',
        dataType: 'any',
        required: true,
      },
    ],
    createDefaultConfig: () => ({
      label: 'Extract field',
      operation: 'selectField',
      source: 'trigger',
      fieldPath: 'amount',
    }),
    isMvp: true,
  },
  end: {
    type: 'end',
    label: 'End',
    category: 'flow',
    subtitle: 'Terminal workflow output',
    description:
      'Marks a successful terminal state for an execution path and exposes the final workflow output.',
    iconName: 'Flag',
    inputs: [
      {
        id: 'in',
        label: 'In',
        direction: 'input',
        dataType: 'any',
        required: true,
      },
    ],
    outputs: [],
    createDefaultConfig: () => ({
      label: 'Workflow complete',
      outputSource: 'upstream',
      requiredFields: [],
    }),
    isMvp: true,
  },
  delay: {
    type: 'delay',
    label: 'Delay',
    category: 'flow',
    subtitle: 'Bounded wait step',
    description: 'Pauses branch execution for a bounded duration in milliseconds.',
    iconName: 'Clock',
    inputs: [
      { id: 'in', label: 'In', direction: 'input', dataType: 'any', required: true },
    ],
    outputs: [
      { id: 'next', label: 'Out', direction: 'output', dataType: 'any', required: true },
    ],
    createDefaultConfig: () => ({
      label: 'Wait 100ms',
      durationMs: 100,
    }),
    isMvp: false,
  },
  retry: {
    type: 'retry',
    label: 'Retry Policy',
    category: 'flow',
    subtitle: 'Bounded retry wrapper',
    description: 'Executes an operation with bounded retry attempts and backoff.',
    iconName: 'RotateCw',
    inputs: [
      { id: 'in', label: 'In', direction: 'input', dataType: 'any', required: true },
    ],
    outputs: [
      { id: 'next', label: 'Out', direction: 'output', dataType: 'any', required: true },
    ],
    createDefaultConfig: () => ({
      label: 'Retry up to 3x',
      maxAttempts: 3,
      backoffMs: 50,
      simulateFailuresBeforeSuccess: 0,
    }),
    isMvp: false,
  },
  loop: {
    type: 'loop',
    label: 'Bounded Loop',
    category: 'flow',
    subtitle: 'Iterate array with limit',
    description: 'Iterates over an array input with a strict maximum iteration cap.',
    iconName: 'Repeat',
    inputs: [
      { id: 'in', label: 'In', direction: 'input', dataType: 'any', required: true },
    ],
    outputs: [
      { id: 'next', label: 'Out', direction: 'output', dataType: 'array', required: true },
    ],
    createDefaultConfig: () => ({
      label: 'For each item',
      arraySource: { source: 'trigger', path: 'items' },
      maxIterations: 25,
      itemVariable: 'item',
    }),
    isMvp: false,
  },
  merge: {
    type: 'merge',
    label: 'Merge',
    category: 'flow',
    subtitle: 'Synchronize branches',
    description: 'Synchronizes parallel branches and merges their outputs deterministically.',
    iconName: 'GitMerge',
    inputs: [
      { id: 'in', label: 'In', direction: 'input', dataType: 'any', required: true },
    ],
    outputs: [
      { id: 'next', label: 'Out', direction: 'output', dataType: 'object', required: true },
    ],
    createDefaultConfig: () => ({
      label: 'Merge branches',
      strategy: 'combineObjects',
      expectedBranches: 2,
    }),
    isMvp: false,
  },
};

export function getNodeSpecification<T extends NodeType>(
  type: T,
): NodeTypeSpecification<T> {
  return NODE_REGISTRY[type];
}

export function arePortTypesCompatible(
  sourceType: PortDataType,
  targetType: PortDataType,
): boolean {
  if (sourceType === 'any' || targetType === 'any') {
    return true;
  }
  return sourceType === targetType;
}

