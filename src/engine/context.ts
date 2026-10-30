/**
 * FlowForge — Execution Context, Trigger Input Validation, and Safe Operand Resolution
 * Pure TypeScript runtime module with zero React, Zustand, or DOM dependencies.
 * Never uses eval() or new Function().
 */

import type {
  ExecutionContext,
  OperandReference,
  PrimitiveTypeName,
  StructuredExecutionError,
  ValueMappingEntry,
} from '../domain/types/workflow';

const FORBIDDEN_PATH_SEGMENTS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export interface SourceResolutionCursor {
  triggerNodeId: string;
  currentNodeId?: string;
  upstreamNodeId?: string | null;
}

/**
 * Strongly typed runtime error carrying a StructuredExecutionError payload.
 */
export class EngineExecutionError extends Error {
  public readonly structured: StructuredExecutionError;

  constructor(structured: StructuredExecutionError) {
    super(structured.message);
    this.name = 'EngineExecutionError';
    this.structured = structured;
  }
}

/**
 * Normalizes any thrown error into a StructuredExecutionError.
 */
export function toStructuredExecutionError(
  err: unknown,
  fallbackNodeId?: string,
): StructuredExecutionError {
  if (err instanceof EngineExecutionError) {
    return {
      ...err.structured,
      nodeId: err.structured.nodeId ?? fallbackNodeId,
    };
  }
  if (err instanceof Error) {
    return {
      code: 'ERR_RUNTIME_EXCEPTION',
      message: err.message || 'Unexpected runtime execution error.',
      nodeId: fallbackNodeId,
      remediation:
        'Inspect the node configuration and upstream input payload in TraceLab.',
    };
  }
  return {
    code: 'ERR_RUNTIME_EXCEPTION',
    message: String(err),
    nodeId: fallbackNodeId,
    remediation:
      'Inspect the node configuration and upstream input payload in TraceLab.',
  };
}

/**
 * Initializes a fresh, isolated ExecutionContext for a workflow run.
 */
export function createExecutionContext(
  input: Record<string, unknown> = {},
): ExecutionContext {
  return {
    input: structuredClone(input),
    nodeOutputs: {},
    variables: {},
    logs: [],
  };
}

/**
 * Describes the runtime JavaScript type of a value for clear diagnostic messages.
 */
export function describeValueType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  return typeof value;
}

/**
 * Checks whether a runtime value satisfies a declared PrimitiveTypeName in a Trigger inputSchema.
 */
export function matchesPrimitiveType(
  value: unknown,
  expectedType: PrimitiveTypeName,
): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return (
        typeof value === 'object' && value !== null && !Array.isArray(value)
      );
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
}

/**
 * Validates the supplied runtime input object against a Trigger node's configured inputSchema.
 * Returns null when valid, or a StructuredExecutionError when a required field is missing or mistyped.
 */
export function validateTriggerInput(
  input: unknown,
  inputSchema: Record<string, PrimitiveTypeName>,
  triggerNodeId?: string,
): StructuredExecutionError | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      code: 'ERR_INVALID_TRIGGER_INPUT',
      message: `Trigger input payload must be a JSON object, but received ${describeValueType(input)}.`,
      nodeId: triggerNodeId,
      details: { actualType: describeValueType(input) },
      remediation:
        'Provide a valid JSON object matching the Trigger node input schema.',
    };
  }

  const record = input as Record<string, unknown>;
  for (const [fieldKey, expectedType] of Object.entries(inputSchema)) {
    const hasField =
      Object.prototype.hasOwnProperty.call(record, fieldKey) &&
      record[fieldKey] !== undefined;

    if (!hasField) {
      return {
        code: 'ERR_MISSING_TRIGGER_INPUT_FIELD',
        message: `Missing required trigger input field "${fieldKey}" (expected ${expectedType}).`,
        nodeId: triggerNodeId,
        details: { field: fieldKey, expectedType },
        remediation: `Supply a "${fieldKey}" field of type "${expectedType}" in the run input payload.`,
      };
    }

    const actualValue = record[fieldKey];
    if (!matchesPrimitiveType(actualValue, expectedType)) {
      return {
        code: 'ERR_INVALID_TRIGGER_INPUT',
        message: `Trigger input field "${fieldKey}" expected type "${expectedType}", but received ${describeValueType(actualValue)} (${JSON.stringify(actualValue)}).`,
        nodeId: triggerNodeId,
        details: {
          field: fieldKey,
          expectedType,
          actualType: describeValueType(actualValue),
          actualValue,
        },
        remediation: `Change "${fieldKey}" in the run input payload to a valid ${expectedType}.`,
      };
    }
  }

  return null;
}

/**
 * Safely resolves a dot-separated property path (e.g., "user.profile.amount") on a target value.
 * Strictly blocks prototype-chain access (__proto__, constructor, prototype).
 */
export function resolveDotPath(
  target: unknown,
  rawPath: string,
  options?: { nodeId?: string; sourceLabel?: string },
): unknown {
  const trimmed = rawPath.trim();
  if (trimmed === '' || trimmed === '$') {
    return target;
  }

  const segments = trimmed.split('.');
  for (const segment of segments) {
    if (segment === '') {
      throw new EngineExecutionError({
        code: 'ERR_INVALID_FIELD_PATH',
        message: `Invalid field path "${rawPath}"${
          options?.sourceLabel ? ` on source "${options.sourceLabel}"` : ''
        }: empty path segment.`,
        nodeId: options?.nodeId,
        remediation:
          'Use a valid dot-separated path such as "amount" or "user.email".',
      });
    }

    if (FORBIDDEN_PATH_SEGMENTS.has(segment)) {
      throw new EngineExecutionError({
        code: 'ERR_FORBIDDEN_PATH',
        message: `Forbidden property segment "${segment}" in path "${rawPath}". Prototype access is blocked.`,
        nodeId: options?.nodeId,
        remediation:
          'Remove prototype-chain keywords (__proto__, constructor, prototype) from the field path.',
      });
    }
  }

  let current: unknown = target;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Resolves the root payload object for a given source identifier:
 * - "trigger" or <triggerNodeId> -> Trigger output / context.input
 * - "upstream" -> Immediate activating predecessor node's output
 * - "variables" -> context.variables
 * - "<nodeId>" -> context.nodeOutputs[nodeId] (throws ERR_MISSING_SOURCE_NODE if not executed)
 */
export function resolveSourcePayload(
  context: ExecutionContext,
  source: string,
  cursor: SourceResolutionCursor,
): unknown {
  const normalizedSource = source.trim();

  if (
    normalizedSource === 'trigger' ||
    normalizedSource === cursor.triggerNodeId
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        context.nodeOutputs,
        cursor.triggerNodeId,
      )
    ) {
      return context.nodeOutputs[cursor.triggerNodeId];
    }
    return context.input;
  }

  if (normalizedSource === 'variables') {
    return context.variables;
  }

  if (normalizedSource === 'upstream') {
    if (
      cursor.upstreamNodeId &&
      Object.prototype.hasOwnProperty.call(
        context.nodeOutputs,
        cursor.upstreamNodeId,
      )
    ) {
      return context.nodeOutputs[cursor.upstreamNodeId];
    }
    if (
      Object.prototype.hasOwnProperty.call(
        context.nodeOutputs,
        cursor.triggerNodeId,
      )
    ) {
      return context.nodeOutputs[cursor.triggerNodeId];
    }
    return context.input;
  }

  if (
    Object.prototype.hasOwnProperty.call(context.nodeOutputs, normalizedSource)
  ) {
    return context.nodeOutputs[normalizedSource];
  }

  throw new EngineExecutionError({
    code: 'ERR_MISSING_SOURCE_NODE',
    message: `Cannot read output from node "${normalizedSource}" because it has not executed on the active path or does not exist.`,
    nodeId: cursor.currentNodeId,
    details: { requestedSource: normalizedSource },
    remediation: `Reference "trigger", "upstream", or an upstream node ID that is guaranteed to execute before "${cursor.currentNodeId ?? 'this node'}".`,
  });
}

/**
 * Resolves an OperandReference ({ source, path }) against the ExecutionContext.
 */
export function resolveOperandReference(
  context: ExecutionContext,
  ref: OperandReference,
  cursor: SourceResolutionCursor,
): unknown {
  const sourcePayload = resolveSourcePayload(context, ref.source, cursor);
  return resolveDotPath(sourcePayload, ref.path, {
    nodeId: cursor.currentNodeId,
    sourceLabel: ref.source,
  });
}

/**
 * Resolves a ValueMappingEntry (either a literal value or a source/path reference) against the ExecutionContext.
 */
export function resolveValueMappingEntry(
  context: ExecutionContext,
  entry: ValueMappingEntry,
  cursor: SourceResolutionCursor,
): unknown {
  if (entry.kind === 'literal') {
    return entry.value;
  }
  return resolveOperandReference(
    context,
    { source: entry.source, path: entry.path },
    cursor,
  );
}

