/**
 * FlowForge — Pure Node Execution Handlers
 * Implements Trigger, Condition, Action, Transform, and End node handlers.
 * Pure TypeScript module with zero React, Zustand, DOM, or IndexedDB dependencies.
 * Never uses eval() or new Function().
 */

import type {
  ConditionEvaluationReason,
  ExecutionContext,
  NodeType,
  WorkflowDocument,
  WorkflowNode,
  WorkflowNodeBase,
  WorkflowRunRecord,
} from '../../domain/types/workflow';
import {
  ActionNodeConfigSchema,
  ConditionNodeConfigSchema,
  DelayNodeConfigSchema,
  EndNodeConfigSchema,
  LoopNodeConfigSchema,
  MergeNodeConfigSchema,
  RetryNodeConfigSchema,
  SubflowNodeConfigSchema,
  TransformNodeConfigSchema,
  TriggerNodeConfigSchema,
} from '../../schemas/workflow-schema';
import {
  describeValueType,
  EngineExecutionError,
  resolveDotPath,
  resolveOperandReference,
  resolveSourcePayload,
  resolveValueMappingEntry,
  validateTriggerInput,
  type SourceResolutionCursor,
} from '../context';

export type SubflowExecutor = (
  childWorkflow: WorkflowDocument,
  input: Record<string, unknown>,
  subflowCallStack: string[],
) => Promise<WorkflowRunRecord>;

export type WorkflowLookupFn = (
  id: string,
) => Promise<WorkflowDocument | null> | WorkflowDocument | null;

export interface NodeHandlerInput<T extends NodeType = NodeType> {
  node: WorkflowNodeBase<T>;
  context: ExecutionContext;
  triggerNodeId: string;
  upstreamNodeId?: string | null;
  now?: () => number;
  workflowLookup?: WorkflowLookupFn;
  subflowExecutor?: SubflowExecutor;
  subflowCallStack?: string[];
}

export interface NodeHandlerResult {
  output: unknown;
  nextHandleIds: string[];
  conditionReason?: ConditionEvaluationReason;
  isTerminal?: boolean;
}

/**
 * Deep structural equality helper for deterministic `equals`, `notEquals`, and `contains` evaluations.
 */
function isDeepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!isDeepEqual(aObj[key], bObj[key])) return false;
  }

  return true;
}

/**
 * Checks whether a value is considered empty under FlowForge `isEmpty` / `isNotEmpty` semantics.
 * Note: Falsy numeric `0` and boolean `false` are NOT empty.
 */
function isValueEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/**
 * Formats a runtime value concisely for ConditionEvaluationReason explanations.
 */
function formatOperandForExplanation(value: unknown): string {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Safely interpolates `{{path}}` or `{{source.path}}` placeholders in log messages without eval.
 */
function interpolateLogTemplate(
  template: string,
  context: ExecutionContext,
  cursor: SourceResolutionCursor,
): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawExpr: string) => {
    const trimmed = rawExpr.trim();
    if (!trimmed) return '';

    const dotIndex = trimmed.indexOf('.');
    if (dotIndex > 0) {
      const firstSegment = trimmed.slice(0, dotIndex);
      const restPath = trimmed.slice(dotIndex + 1);
      if (
        firstSegment === 'trigger' ||
        firstSegment === 'upstream' ||
        firstSegment === 'variables' ||
        firstSegment === cursor.triggerNodeId ||
        Object.prototype.hasOwnProperty.call(context.nodeOutputs, firstSegment)
      ) {
        const srcObj = resolveSourcePayload(context, firstSegment, cursor);
        const val = resolveDotPath(srcObj, restPath, {
          nodeId: cursor.currentNodeId,
          sourceLabel: firstSegment,
        });
        return val === undefined ? 'undefined' : String(val);
      }
    }

    const upstreamObj = resolveSourcePayload(context, 'upstream', cursor);
    const val = resolveDotPath(upstreamObj, trimmed, {
      nodeId: cursor.currentNodeId,
      sourceLabel: 'upstream',
    });
    return val === undefined ? 'undefined' : String(val);
  });
}

/**
 * 1. Trigger Node Handler
 * Validates `context.input` against `node.config.inputSchema` and outputs a deep clone of the input.
 */
export function executeTriggerNode(
  params: NodeHandlerInput<'trigger'>,
): NodeHandlerResult {
  const { node, context } = params;

  const configCheck = TriggerNodeConfigSchema.safeParse(node.config);
  if (!configCheck.success) {
    throw new EngineExecutionError({
      code: 'ERR_INVALID_NODE_CONFIG',
      message: `Invalid Trigger configuration on "${node.name}": ${configCheck.error.issues[0]?.message ?? 'schema error'}.`,
      nodeId: node.id,
      remediation: 'Fix the Trigger node configuration in the Inspector.',
    });
  }

  const inputError = validateTriggerInput(
    context.input,
    node.config.inputSchema ?? {},
    node.id,
  );
  if (inputError) {
    throw new EngineExecutionError(inputError);
  }

  return {
    output: structuredClone(context.input),
    nextHandleIds: ['next'],
  };
}

/**
 * 2. Condition Node Handler
 * Evaluates all 9 operators deterministically and produces a ConditionEvaluationReason.
 */
export function executeConditionNode(
  params: NodeHandlerInput<'condition'>,
): NodeHandlerResult {
  const { node, context, triggerNodeId, upstreamNodeId } = params;

  const configCheck = ConditionNodeConfigSchema.safeParse(node.config);
  if (!configCheck.success) {
    throw new EngineExecutionError({
      code: 'ERR_INVALID_NODE_CONFIG',
      message: `Invalid Condition configuration on "${node.name}": ${configCheck.error.issues[0]?.message ?? 'schema error'}.`,
      nodeId: node.id,
      remediation:
        'Ensure left operand, operator, and right operand (when required) are configured.',
    });
  }

  const cursor: SourceResolutionCursor = {
    triggerNodeId,
    currentNodeId: node.id,
    upstreamNodeId,
  };

  const { left, operator, right } = node.config;
  const leftValue = resolveOperandReference(context, left, cursor);

  let rightValue: unknown = undefined;
  let result = false;

  if (operator === 'isEmpty' || operator === 'isNotEmpty') {
    const empty = isValueEmpty(leftValue);
    result = operator === 'isEmpty' ? empty : !empty;
  } else {
    if (!right) {
      throw new EngineExecutionError({
        code: 'ERR_INVALID_NODE_CONFIG',
        message: `Condition "${node.name}" operator "${operator}" requires a right-hand operand.`,
        nodeId: node.id,
        remediation:
          'Configure a right-hand literal or reference operand in the Node Inspector.',
      });
    }

    rightValue = resolveValueMappingEntry(context, right, cursor);

    if (leftValue === undefined) {
      throw new EngineExecutionError({
        code: 'ERR_OPERAND_TYPE_MISMATCH',
        message: `Left operand "${left.source}.${left.path}" on Condition "${node.name}" resolved to undefined.`,
        nodeId: node.id,
        details: { leftSource: left.source, leftPath: left.path, operator },
        remediation: `Verify that field "${left.path}" exists on "${left.source}" before comparing with "${operator}".`,
      });
    }

    if (rightValue === undefined) {
      const rightLabel =
        right.kind === 'ref' ? `${right.source}.${right.path}` : 'literal';
      throw new EngineExecutionError({
        code: 'ERR_OPERAND_TYPE_MISMATCH',
        message: `Right operand "${rightLabel}" on Condition "${node.name}" resolved to undefined.`,
        nodeId: node.id,
        details: { rightOperand: right, operator },
        remediation: `Verify that the right-hand operand on "${node.name}" resolves to a defined value.`,
      });
    }

    switch (operator) {
      case 'equals':
        result = isDeepEqual(leftValue, rightValue);
        break;

      case 'notEquals':
        result = !isDeepEqual(leftValue, rightValue);
        break;

      case 'greaterThan':
      case 'greaterThanOrEqual':
      case 'lessThan':
      case 'lessThanOrEqual': {
        const bothNumbers =
          typeof leftValue === 'number' &&
          Number.isFinite(leftValue) &&
          typeof rightValue === 'number' &&
          Number.isFinite(rightValue);
        const bothStrings =
          typeof leftValue === 'string' && typeof rightValue === 'string';

        if (!bothNumbers && !bothStrings) {
          throw new EngineExecutionError({
            code: 'ERR_OPERAND_TYPE_MISMATCH',
            message: `Operator "${operator}" on Condition "${node.name}" requires comparable numbers or strings, but received ${describeValueType(leftValue)} (${formatOperandForExplanation(leftValue)}) and ${describeValueType(rightValue)} (${formatOperandForExplanation(rightValue)}).`,
            nodeId: node.id,
            details: {
              leftValue,
              rightValue,
              operator,
            },
            remediation:
              'Ensure both left and right operands resolve to finite numbers or strings.',
          });
        }

        if (bothNumbers) {
          const lNum = leftValue as number;
          const rNum = rightValue as number;
          if (operator === 'greaterThan') result = lNum > rNum;
          else if (operator === 'greaterThanOrEqual') result = lNum >= rNum;
          else if (operator === 'lessThan') result = lNum < rNum;
          else result = lNum <= rNum;
        } else {
          const lStr = leftValue as string;
          const rStr = rightValue as string;
          if (operator === 'greaterThan') result = lStr > rStr;
          else if (operator === 'greaterThanOrEqual') result = lStr >= rStr;
          else if (operator === 'lessThan') result = lStr < rStr;
          else result = lStr <= rStr;
        }
        break;
      }

      case 'contains': {
        if (typeof leftValue === 'string' && typeof rightValue === 'string') {
          result = leftValue.includes(rightValue);
        } else if (Array.isArray(leftValue)) {
          result = leftValue.some((item) => isDeepEqual(item, rightValue));
        } else {
          throw new EngineExecutionError({
            code: 'ERR_OPERAND_TYPE_MISMATCH',
            message: `Operator "contains" on Condition "${node.name}" requires a string (with string search value) or an array on the left-hand side, but received ${describeValueType(leftValue)} and ${describeValueType(rightValue)}.`,
            nodeId: node.id,
            details: { leftValue, rightValue, operator },
            remediation:
              'Use "contains" only when the left operand is a string or an array.',
          });
        }
        break;
      }
    }
  }

  const explanation =
    operator === 'isEmpty' || operator === 'isNotEmpty'
      ? `${left.source}.${left.path} (${formatOperandForExplanation(leftValue)}) ${operator} → ${String(result)}`
      : `${left.source}.${left.path} (${formatOperandForExplanation(leftValue)}) ${operator} ${formatOperandForExplanation(rightValue)} → ${String(result)}`;

  const conditionReason: ConditionEvaluationReason = {
    leftSource: left.source,
    leftPath: left.path,
    leftValue: structuredClone(leftValue),
    operator,
    rightValue: structuredClone(rightValue),
    result,
    explanation,
  };

  const passThroughPayload = resolveSourcePayload(context, 'upstream', cursor);

  return {
    output: structuredClone(passThroughPayload),
    nextHandleIds: [result ? 'true' : 'false'],
    conditionReason,
  };
}

/**
 * 3. Action Node Handler
 * Supports `setValue`, `buildObject`, `appendLog`, and `returnResult`.
 */
export function executeActionNode(
  params: NodeHandlerInput<'action'>,
): NodeHandlerResult {
  const { node, context, triggerNodeId, upstreamNodeId, now } = params;

  const configCheck = ActionNodeConfigSchema.safeParse(node.config);
  if (!configCheck.success) {
    throw new EngineExecutionError({
      code: 'ERR_INVALID_NODE_CONFIG',
      message: `Invalid Action configuration on "${node.name}": ${configCheck.error.issues[0]?.message ?? 'schema error'}.`,
      nodeId: node.id,
      remediation: 'Complete all required Action fields in the Node Inspector.',
    });
  }

  const cursor: SourceResolutionCursor = {
    triggerNodeId,
    currentNodeId: node.id,
    upstreamNodeId,
  };

  const { actionType, key, value, fields, logMessage } = node.config;

  switch (actionType) {
    case 'setValue': {
      const targetKey = key!.trim();
      const resolvedValue = resolveValueMappingEntry(context, value!, cursor);
      if (resolvedValue === undefined) {
        const refDesc =
          value!.kind === 'ref'
            ? `${value!.source}.${value!.path}`
            : 'literal';
        throw new EngineExecutionError({
          code: 'ERR_MISSING_OPERAND_VALUE',
          message: `Action "${node.name}" (setValue) could not resolve value for key "${targetKey}" from ${refDesc} (resolved to undefined).`,
          nodeId: node.id,
          remediation: `Ensure the source path for "${targetKey}" exists on the upstream payload.`,
        });
      }

      const clonedVal = structuredClone(resolvedValue);
      context.variables[targetKey] = clonedVal;

      const upstreamPayload = resolveSourcePayload(context, 'upstream', cursor);
      const baseObject =
        typeof upstreamPayload === 'object' &&
        upstreamPayload !== null &&
        !Array.isArray(upstreamPayload)
          ? structuredClone(upstreamPayload as Record<string, unknown>)
          : {};

      return {
        output: {
          ...baseObject,
          [targetKey]: structuredClone(clonedVal),
        },
        nextHandleIds: ['next'],
      };
    }

    case 'buildObject':
    case 'returnResult': {
      const outputObject: Record<string, unknown> = {};
      for (const [fieldKey, mapping] of Object.entries(fields ?? {})) {
        const resolved = resolveValueMappingEntry(context, mapping, cursor);
        if (resolved === undefined) {
          const refDesc =
            mapping.kind === 'ref'
              ? `${mapping.source}.${mapping.path}`
              : 'literal';
          throw new EngineExecutionError({
            code: 'ERR_MISSING_OPERAND_VALUE',
            message: `Action "${node.name}" (${actionType}) field "${fieldKey}" referencing "${refDesc}" resolved to undefined.`,
            nodeId: node.id,
            details: { fieldKey, mapping },
            remediation: `Verify that "${refDesc}" exists before "${node.name}" executes.`,
          });
        }
        outputObject[fieldKey] = structuredClone(resolved);
      }

      return {
        output: outputObject,
        nextHandleIds: ['next'],
      };
    }

    case 'appendLog': {
      const ts = (now ?? (() => Date.now()))();
      const formattedMessage = interpolateLogTemplate(
        logMessage!,
        context,
        cursor,
      );

      context.logs.push({
        nodeId: node.id,
        message: formattedMessage,
        timestamp: ts,
      });

      const upstreamPayload = resolveSourcePayload(context, 'upstream', cursor);
      const baseObject =
        typeof upstreamPayload === 'object' &&
        upstreamPayload !== null &&
        !Array.isArray(upstreamPayload)
          ? structuredClone(upstreamPayload as Record<string, unknown>)
          : { value: structuredClone(upstreamPayload) };

      return {
        output: {
          ...baseObject,
          lastLogMessage: formattedMessage,
        },
        nextHandleIds: ['next'],
      };
    }
  }
}

/**
 * 4. Transform Node Handler
 * Supports `selectField`, `renameFields`, `constructObject`, and `convertType`.
 */
export function executeTransformNode(
  params: NodeHandlerInput<'transform'>,
): NodeHandlerResult {
  const { node, context, triggerNodeId, upstreamNodeId } = params;

  const configCheck = TransformNodeConfigSchema.safeParse(node.config);
  if (!configCheck.success) {
    throw new EngineExecutionError({
      code: 'ERR_INVALID_NODE_CONFIG',
      message: `Invalid Transform configuration on "${node.name}": ${configCheck.error.issues[0]?.message ?? 'schema error'}.`,
      nodeId: node.id,
      remediation:
        'Complete all required Transform fields in the Node Inspector.',
    });
  }

  const cursor: SourceResolutionCursor = {
    triggerNodeId,
    currentNodeId: node.id,
    upstreamNodeId,
  };

  const {
    operation,
    source = 'upstream',
    fieldPath,
    targetType,
    fieldMappings,
    constructedFields,
  } = node.config;

  switch (operation) {
    case 'selectField': {
      const sourcePayload = resolveSourcePayload(context, source, cursor);
      const selected = resolveDotPath(sourcePayload, fieldPath!, {
        nodeId: node.id,
        sourceLabel: source,
      });

      if (selected === undefined) {
        throw new EngineExecutionError({
          code: 'ERR_MISSING_FIELD',
          message: `Transform "${node.name}" (selectField) could not find field "${fieldPath}" on source "${source}".`,
          nodeId: node.id,
          details: { source, fieldPath },
          remediation: `Ensure field "${fieldPath}" is present on "${source}".`,
        });
      }

      return {
        output: structuredClone(selected),
        nextHandleIds: ['next'],
      };
    }

    case 'renameFields': {
      const sourcePayload = resolveSourcePayload(context, source, cursor);
      if (
        typeof sourcePayload !== 'object' ||
        sourcePayload === null ||
        Array.isArray(sourcePayload)
      ) {
        throw new EngineExecutionError({
          code: 'ERR_INVALID_TRANSFORM_SOURCE',
          message: `Transform "${node.name}" (renameFields) requires an object payload from "${source}", but received ${describeValueType(sourcePayload)}.`,
          nodeId: node.id,
          remediation:
            'Connect renameFields to an upstream node that outputs a JSON object.',
        });
      }

      const clonedRecord = structuredClone(
        sourcePayload as Record<string, unknown>,
      );

      for (const [oldKey, newKey] of Object.entries(fieldMappings ?? {})) {
        const val = resolveDotPath(sourcePayload, oldKey, {
          nodeId: node.id,
          sourceLabel: source,
        });
        if (val === undefined) {
          throw new EngineExecutionError({
            code: 'ERR_MISSING_FIELD',
            message: `Transform "${node.name}" (renameFields) could not find source field "${oldKey}" on "${source}".`,
            nodeId: node.id,
            details: { oldKey, newKey, source },
            remediation: `Verify that field "${oldKey}" exists on "${source}".`,
          });
        }

        clonedRecord[newKey] = structuredClone(val);
        if (
          oldKey !== newKey &&
          Object.prototype.hasOwnProperty.call(clonedRecord, oldKey)
        ) {
          delete clonedRecord[oldKey];
        }
      }

      return {
        output: clonedRecord,
        nextHandleIds: ['next'],
      };
    }

    case 'constructObject': {
      const constructed: Record<string, unknown> = {};
      for (const [fieldKey, mapping] of Object.entries(
        constructedFields ?? {},
      )) {
        const resolved = resolveValueMappingEntry(context, mapping, cursor);
        if (resolved === undefined) {
          const refDesc =
            mapping.kind === 'ref'
              ? `${mapping.source}.${mapping.path}`
              : 'literal';
          throw new EngineExecutionError({
            code: 'ERR_MISSING_OPERAND_VALUE',
            message: `Transform "${node.name}" (constructObject) field "${fieldKey}" referencing "${refDesc}" resolved to undefined.`,
            nodeId: node.id,
            details: { fieldKey, mapping },
            remediation: `Verify that "${refDesc}" is defined on the active execution path.`,
          });
        }
        constructed[fieldKey] = structuredClone(resolved);
      }

      return {
        output: constructed,
        nextHandleIds: ['next'],
      };
    }

    case 'convertType': {
      const sourcePayload = resolveSourcePayload(context, source, cursor);
      const rawValue = resolveDotPath(sourcePayload, fieldPath!, {
        nodeId: node.id,
        sourceLabel: source,
      });

      if (rawValue === undefined) {
        throw new EngineExecutionError({
          code: 'ERR_MISSING_FIELD',
          message: `Transform "${node.name}" (convertType) could not find field "${fieldPath}" on "${source}".`,
          nodeId: node.id,
          details: { source, fieldPath, targetType },
          remediation: `Verify that field "${fieldPath}" exists on "${source}".`,
        });
      }

      let converted: string | number | boolean;

      if (targetType === 'string') {
        if (
          typeof rawValue === 'string' ||
          typeof rawValue === 'number' ||
          typeof rawValue === 'boolean'
        ) {
          converted = String(rawValue);
        } else {
          throw new EngineExecutionError({
            code: 'ERR_TYPE_CONVERSION_FAILED',
            message: `Transform "${node.name}" cannot convert ${describeValueType(rawValue)} at "${fieldPath}" to string.`,
            nodeId: node.id,
            details: { fieldPath, rawValue, targetType },
            remediation:
              'Only primitive string, number, or boolean values can be converted to string.',
          });
        }
      } else if (targetType === 'number') {
        if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
          converted = rawValue;
        } else if (typeof rawValue === 'string' && rawValue.trim() !== '') {
          const parsed = Number(rawValue);
          if (!Number.isFinite(parsed)) {
            throw new EngineExecutionError({
              code: 'ERR_TYPE_CONVERSION_FAILED',
              message: `Transform "${node.name}" failed to convert "${rawValue}" at "${fieldPath}" to a finite number.`,
              nodeId: node.id,
              details: { fieldPath, rawValue, targetType },
              remediation: `Ensure "${fieldPath}" contains a valid numeric value.`,
            });
          }
          converted = parsed;
        } else if (typeof rawValue === 'boolean') {
          converted = rawValue ? 1 : 0;
        } else {
          throw new EngineExecutionError({
            code: 'ERR_TYPE_CONVERSION_FAILED',
            message: `Transform "${node.name}" cannot convert ${describeValueType(rawValue)} (${formatOperandForExplanation(rawValue)}) at "${fieldPath}" to number.`,
            nodeId: node.id,
            details: { fieldPath, rawValue, targetType },
            remediation: `Ensure "${fieldPath}" contains a numeric string, number, or boolean.`,
          });
        }
      } else {
        // targetType === 'boolean'
        if (typeof rawValue === 'boolean') {
          converted = rawValue;
        } else if (typeof rawValue === 'string') {
          const norm = rawValue.trim().toLowerCase();
          if (norm === 'true' || norm === '1') converted = true;
          else if (norm === 'false' || norm === '0') converted = false;
          else {
            throw new EngineExecutionError({
              code: 'ERR_TYPE_CONVERSION_FAILED',
              message: `Transform "${node.name}" failed to convert string "${rawValue}" at "${fieldPath}" to boolean.`,
              nodeId: node.id,
              details: { fieldPath, rawValue, targetType },
              remediation:
                'Only "true", "false", "1", or "0" strings can be converted to boolean.',
            });
          }
        } else if (typeof rawValue === 'number') {
          if (rawValue === 1) converted = true;
          else if (rawValue === 0) converted = false;
          else {
            throw new EngineExecutionError({
              code: 'ERR_TYPE_CONVERSION_FAILED',
              message: `Transform "${node.name}" failed to convert number ${rawValue} at "${fieldPath}" to boolean.`,
              nodeId: node.id,
              details: { fieldPath, rawValue, targetType },
              remediation: 'Only numeric 1 or 0 can be converted to boolean.',
            });
          }
        } else {
          throw new EngineExecutionError({
            code: 'ERR_TYPE_CONVERSION_FAILED',
            message: `Transform "${node.name}" cannot convert ${describeValueType(rawValue)} at "${fieldPath}" to boolean.`,
            nodeId: node.id,
            details: { fieldPath, rawValue, targetType },
            remediation: `Provide a boolean-compatible value at "${fieldPath}".`,
          });
        }
      }

      if (
        typeof sourcePayload === 'object' &&
        sourcePayload !== null &&
        !Array.isArray(sourcePayload)
      ) {
        const clonedObj = structuredClone(
          sourcePayload as Record<string, unknown>,
        );
        const segments = fieldPath!.trim().split('.');
        let curr: Record<string, unknown> = clonedObj;
        for (let i = 0; i < segments.length - 1; i++) {
          const seg = segments[i];
          if (
            typeof curr[seg] !== 'object' ||
            curr[seg] === null ||
            Array.isArray(curr[seg])
          ) {
            curr[seg] = {};
          }
          curr = curr[seg] as Record<string, unknown>;
        }
        curr[segments[segments.length - 1]] = converted;
        return {
          output: clonedObj,
          nextHandleIds: ['next'],
        };
      }

      return {
        output: converted,
        nextHandleIds: ['next'],
      };
    }
  }
}

/**
 * 5. End Node Handler
 * Resolves the terminal workflow output and validates any configured `requiredFields`.
 */
export function executeEndNode(
  params: NodeHandlerInput<'end'>,
): NodeHandlerResult {
  const { node, context, triggerNodeId, upstreamNodeId } = params;

  const configCheck = EndNodeConfigSchema.safeParse(node.config);
  if (!configCheck.success) {
    throw new EngineExecutionError({
      code: 'ERR_INVALID_NODE_CONFIG',
      message: `Invalid End node configuration on "${node.name}": ${configCheck.error.issues[0]?.message ?? 'schema error'}.`,
      nodeId: node.id,
      remediation: 'Fix the End node configuration in the Node Inspector.',
    });
  }

  const cursor: SourceResolutionCursor = {
    triggerNodeId,
    currentNodeId: node.id,
    upstreamNodeId,
  };

  const outputSource = node.config.outputSource?.trim() || 'upstream';
  const finalPayload = resolveSourcePayload(context, outputSource, cursor);

  const requiredFields = node.config.requiredFields ?? [];
  if (requiredFields.length > 0) {
    if (
      typeof finalPayload !== 'object' ||
      finalPayload === null ||
      Array.isArray(finalPayload)
    ) {
      throw new EngineExecutionError({
        code: 'ERR_INVALID_END_OUTPUT',
        message: `End node "${node.name}" requires output fields [${requiredFields.join(', ')}], but the resolved output from "${outputSource}" is ${describeValueType(finalPayload)}.`,
        nodeId: node.id,
        details: {
          outputSource,
          requiredFields,
          actualType: describeValueType(finalPayload),
        },
        remediation:
          'Ensure the upstream node connected to End produces a JSON object containing the required fields.',
      });
    }

    for (const reqField of requiredFields) {
      const val = resolveDotPath(finalPayload, reqField, {
        nodeId: node.id,
        sourceLabel: outputSource,
      });
      if (val === undefined) {
        throw new EngineExecutionError({
          code: 'ERR_MISSING_REQUIRED_OUTPUT_FIELD',
          message: `End node "${node.name}" is missing required output field "${reqField}" from source "${outputSource}".`,
          nodeId: node.id,
          details: {
            missingField: reqField,
            requiredFields,
            outputSource,
          },
          remediation: `Ensure upstream Action or Transform nodes populate "${reqField}" before reaching "${node.name}".`,
        });
      }
    }
  }

  return {
    output: structuredClone(finalPayload),
    nextHandleIds: [],
    isTerminal: true,
  };
}

/**
 * 6. Delay Node Handler (FR-016)
 * Validates bounded wait duration and passes through upstream data with timing metadata.
 */
export function executeDelayNode(
  params: NodeHandlerInput<'delay'>,
): NodeHandlerResult {
  const { node, context, triggerNodeId, upstreamNodeId } = params;

  const configCheck = DelayNodeConfigSchema.safeParse(node.config);
  if (!configCheck.success) {
    throw new EngineExecutionError({
      code: 'ERR_INVALID_NODE_CONFIG',
      message: `Invalid Delay node configuration on "${node.name}": ${configCheck.error.issues[0]?.message ?? 'schema error'}.`,
      nodeId: node.id,
      remediation: 'Configure a valid bounded durationMs (0..60000) in the Node Inspector.',
    });
  }

  const cursor: SourceResolutionCursor = {
    triggerNodeId,
    currentNodeId: node.id,
    upstreamNodeId,
  };

  const upstreamPayload = resolveSourcePayload(context, 'upstream', cursor);
  const baseObject =
    typeof upstreamPayload === 'object' &&
    upstreamPayload !== null &&
    !Array.isArray(upstreamPayload)
      ? structuredClone(upstreamPayload as Record<string, unknown>)
      : { value: structuredClone(upstreamPayload) };

  return {
    output: {
      ...baseObject,
      delayedMs: node.config.durationMs,
    },
    nextHandleIds: ['next'],
  };
}

/**
 * 7. Retry Policy Node Handler (FR-016, FR-033)
 * Executes bounded retry policy with attempt tracking and backoff metadata.
 */
export function executeRetryNode(
  params: NodeHandlerInput<'retry'>,
): NodeHandlerResult {
  const { node, context, triggerNodeId, upstreamNodeId } = params;

  const configCheck = RetryNodeConfigSchema.safeParse(node.config);
  if (!configCheck.success) {
    throw new EngineExecutionError({
      code: 'ERR_INVALID_NODE_CONFIG',
      message: `Invalid Retry node configuration on "${node.name}": ${configCheck.error.issues[0]?.message ?? 'schema error'}.`,
      nodeId: node.id,
      remediation: 'Configure maxAttempts (1..10) and backoffMs in the Node Inspector.',
    });
  }

  const { maxAttempts, backoffMs, simulateFailuresBeforeSuccess = 0 } =
    node.config;

  if (simulateFailuresBeforeSuccess >= maxAttempts) {
    throw new EngineExecutionError({
      code: 'ERR_RETRY_EXHAUSTED',
      message: `Retry node "${node.name}" exhausted all ${maxAttempts} attempt(s) after ${simulateFailuresBeforeSuccess} simulated failure(s).`,
      nodeId: node.id,
      details: { maxAttempts, backoffMs, simulateFailuresBeforeSuccess },
      remediation: 'Increase maxAttempts or resolve the underlying transient failure.',
    });
  }

  const cursor: SourceResolutionCursor = {
    triggerNodeId,
    currentNodeId: node.id,
    upstreamNodeId,
  };

  const upstreamPayload = resolveSourcePayload(context, 'upstream', cursor);
  const baseObject =
    typeof upstreamPayload === 'object' &&
    upstreamPayload !== null &&
    !Array.isArray(upstreamPayload)
      ? structuredClone(upstreamPayload as Record<string, unknown>)
      : { value: structuredClone(upstreamPayload) };

  return {
    output: {
      ...baseObject,
      retryAttemptsUsed: simulateFailuresBeforeSuccess + 1,
      maxAttempts,
      backoffMs,
    },
    nextHandleIds: ['next'],
  };
}

/**
 * 8. Bounded Loop Node Handler (FR-016, FR-023, FR-034)
 * Iterates over a resolved array with a strict `maxIterations` safety cap.
 */
export function executeLoopNode(
  params: NodeHandlerInput<'loop'>,
): NodeHandlerResult {
  const { node, context, triggerNodeId, upstreamNodeId } = params;

  const configCheck = LoopNodeConfigSchema.safeParse(node.config);
  if (!configCheck.success) {
    throw new EngineExecutionError({
      code: 'ERR_INVALID_NODE_CONFIG',
      message: `Invalid Loop node configuration on "${node.name}": ${configCheck.error.issues[0]?.message ?? 'schema error'}.`,
      nodeId: node.id,
      remediation: 'Configure arraySource, maxIterations, and itemVariable in the Node Inspector.',
    });
  }

  const cursor: SourceResolutionCursor = {
    triggerNodeId,
    currentNodeId: node.id,
    upstreamNodeId,
  };

  const { arraySource, maxIterations, itemVariable } = node.config;
  const resolvedArray = resolveOperandReference(context, arraySource, cursor);

  if (!Array.isArray(resolvedArray)) {
    throw new EngineExecutionError({
      code: 'ERR_INVALID_LOOP_SOURCE',
      message: `Loop node "${node.name}" expected an array at "${arraySource.source}.${arraySource.path}", but received ${describeValueType(resolvedArray)}.`,
      nodeId: node.id,
      details: { arraySource, actualType: describeValueType(resolvedArray) },
      remediation: 'Point arraySource to a valid array field on the trigger or upstream payload.',
    });
  }

  if (resolvedArray.length > maxIterations) {
    throw new EngineExecutionError({
      code: 'ERR_LOOP_LIMIT_EXCEEDED',
      message: `Loop node "${node.name}" input array length (${resolvedArray.length}) exceeds configured maxIterations (${maxIterations}).`,
      nodeId: node.id,
      details: { arrayLength: resolvedArray.length, maxIterations },
      remediation: `Reduce input array size or increase maxIterations above ${resolvedArray.length}.`,
    });
  }

  const processedItems: unknown[] = [];
  for (let i = 0; i < resolvedArray.length; i++) {
    const clonedItem = structuredClone(resolvedArray[i]);
    context.variables[itemVariable] = clonedItem;
    processedItems.push(clonedItem);
  }

  return {
    output: {
      items: processedItems,
      iterations: processedItems.length,
      maxIterations,
      itemVariable,
    },
    nextHandleIds: ['next'],
  };
}

/**
 * 9. Merge / Synchronize Node Handler (FR-016, FR-023, FR-035)
 * Deterministically merges executed upstream branch outputs according to configured strategy.
 */
export function executeMergeNode(
  params: NodeHandlerInput<'merge'>,
): NodeHandlerResult {
  const { node, context, triggerNodeId, upstreamNodeId } = params;

  const configCheck = MergeNodeConfigSchema.safeParse(node.config);
  if (!configCheck.success) {
    throw new EngineExecutionError({
      code: 'ERR_INVALID_NODE_CONFIG',
      message: `Invalid Merge node configuration on "${node.name}": ${configCheck.error.issues[0]?.message ?? 'schema error'}.`,
      nodeId: node.id,
      remediation: 'Configure a valid merge strategy and expectedBranches count.',
    });
  }

  const cursor: SourceResolutionCursor = {
    triggerNodeId,
    currentNodeId: node.id,
    upstreamNodeId,
  };

  const upstreamPayload = resolveSourcePayload(context, 'upstream', cursor);
  const { strategy, expectedBranches } = node.config;

  const branchOutputs = Object.entries(context.nodeOutputs)
    .filter(([id]) => id !== triggerNodeId && id !== node.id)
    .map(([, val]) => structuredClone(val));

  if (strategy === 'collectArray') {
    return {
      output: {
        strategy,
        expectedBranches,
        mergedItems:
          branchOutputs.length > 0
            ? branchOutputs
            : [structuredClone(upstreamPayload)],
      },
      nextHandleIds: ['next'],
    };
  }

  if (strategy === 'firstCompleted') {
    return {
      output: structuredClone(upstreamPayload),
      nextHandleIds: ['next'],
    };
  }

  // combineObjects (default)
  const combined: Record<string, unknown> = {};
  for (const out of branchOutputs) {
    if (typeof out === 'object' && out !== null && !Array.isArray(out)) {
      Object.assign(combined, structuredClone(out));
    }
  }
  if (
    typeof upstreamPayload === 'object' &&
    upstreamPayload !== null &&
    !Array.isArray(upstreamPayload)
  ) {
    Object.assign(combined, structuredClone(upstreamPayload));
  }

  return {
    output: combined,
    nextHandleIds: ['next'],
  };
}

/**
 * Executes a Subflow node by invoking a child workflow by ID with mapped inputs and outputs (FR-016).
 * Detects recursive loops and returns a complete nested execution trace.
 */
export async function executeSubflowNode(
  params: NodeHandlerInput<'subflow'>,
): Promise<NodeHandlerResult> {
  const { node, context, triggerNodeId, upstreamNodeId } = params;

  const parsedConfig = SubflowNodeConfigSchema.safeParse(node.config);
  if (!parsedConfig.success) {
    throw new EngineExecutionError({
      code: 'ERR_INVALID_NODE_CONFIG',
      message: `Subflow "${node.name}" (${node.id}) has invalid configuration: ${parsedConfig.error.issues[0]?.message ?? 'Schema error'}`,
      nodeId: node.id,
      remediation: 'Verify subflow node configuration in the inspector.',
    });
  }

  const config = parsedConfig.data;
  if (!config.targetWorkflowId || config.targetWorkflowId.trim() === '') {
    throw new EngineExecutionError({
      code: 'ERR_SUBFLOW_NOT_CONFIGURED',
      message: `Subflow node "${node.name}" (${node.id}) has no target workflow configured.`,
      nodeId: node.id,
      remediation: 'Select a target workflow in the Node Inspector.',
    });
  }

  const currentStack = params.subflowCallStack ?? [];
  if (currentStack.includes(config.targetWorkflowId)) {
    throw new EngineExecutionError({
      code: 'ERR_SUBFLOW_RECURSION_DETECTED',
      message: `Recursion cycle detected: subflow "${config.targetWorkflowId}" is already active in invocation chain [${[...currentStack, config.targetWorkflowId].join(' -> ')}].`,
      nodeId: node.id,
      details: {
        callStack: currentStack,
        targetWorkflowId: config.targetWorkflowId,
      },
      remediation:
        'Break the recursive invocation cycle by removing the circular subflow reference.',
    });
  }

  if (!params.workflowLookup) {
    throw new EngineExecutionError({
      code: 'ERR_SUBFLOW_NO_LOOKUP',
      message: `Cannot execute Subflow node "${node.name}": no workflow lookup provider was configured.`,
      nodeId: node.id,
      remediation:
        'Ensure workflow lookup is provided to the execution options.',
    });
  }

  const childDoc = await params.workflowLookup(config.targetWorkflowId);
  if (!childDoc) {
    throw new EngineExecutionError({
      code: 'ERR_SUBFLOW_NOT_FOUND',
      message: `Subflow workflow with ID "${config.targetWorkflowId}" was not found in storage.`,
      nodeId: node.id,
      details: { targetWorkflowId: config.targetWorkflowId },
      remediation:
        'Verify that the referenced subflow workflow exists and is saved.',
    });
  }

  // Map inputs from parent execution context to child workflow trigger input
  const childInput: Record<string, unknown> = {};
  const cursor: SourceResolutionCursor = {
    triggerNodeId,
    currentNodeId: node.id,
    upstreamNodeId,
  };

  if (config.inputMapping && config.inputMapping.length > 0) {
    for (const mapping of config.inputMapping) {
      const resolved = resolveOperandReference(
        context,
        mapping.source,
        cursor,
      );
      childInput[mapping.targetField] = structuredClone(resolved);
    }
  } else {
    const upstream = resolveSourcePayload(context, 'upstream', cursor);
    if (
      typeof upstream === 'object' &&
      upstream !== null &&
      !Array.isArray(upstream)
    ) {
      Object.assign(childInput, structuredClone(upstream));
    }
  }

  if (!params.subflowExecutor) {
    throw new EngineExecutionError({
      code: 'ERR_SUBFLOW_NO_RUNNER',
      message: 'Subflow executor is not configured.',
      nodeId: node.id,
      remediation: 'Provide a subflow executor to the runtime scheduler.',
    });
  }

  const subflowRunRecord = await params.subflowExecutor(
    childDoc,
    childInput,
    [...currentStack, childDoc.id],
  );

  if (subflowRunRecord.status === 'failed') {
    throw new EngineExecutionError({
      code: subflowRunRecord.error?.code ?? 'ERR_SUBFLOW_FAILED',
      message: `Subflow "${childDoc.name}" (${childDoc.id}) failed: ${subflowRunRecord.error?.message ?? 'Execution error'}`,
      nodeId: node.id,
      details: {
        subflowRunId: subflowRunRecord.runId,
        subflowError: subflowRunRecord.error,
      },
      remediation:
        subflowRunRecord.error?.remediation ??
        'Inspect the subflow execution trace or fix the child workflow logic.',
    });
  }

  if (subflowRunRecord.status === 'cancelled') {
    throw new EngineExecutionError({
      code: 'ERR_SUBFLOW_CANCELLED',
      message: `Subflow "${childDoc.name}" (${childDoc.id}) was cancelled.`,
      nodeId: node.id,
      remediation: 'Re-run the workflow without cancelling.',
    });
  }

  // Map outputs
  let finalOutput: unknown = subflowRunRecord.finalOutput;
  if (config.outputMapping && config.outputMapping.length > 0) {
    const mapped: Record<string, unknown> = {};
    for (const outMap of config.outputMapping) {
      mapped[outMap.targetField] = resolveDotPath(
        subflowRunRecord.finalOutput,
        outMap.sourcePath,
        { nodeId: node.id, sourceLabel: 'subflow.finalOutput' },
      );
    }
    finalOutput = mapped;
  }

  return {
    output: structuredClone(finalOutput),
    nextHandleIds: ['next'],
  };
}

/**
 * Dispatches execution to the registered pure handler for `node.type`.
 */
export function executeNodeHandler(
  params: NodeHandlerInput<NodeType>,
): NodeHandlerResult | Promise<NodeHandlerResult> {
  const { node } = params;

  switch (node.type) {
    case 'trigger':
      return executeTriggerNode({
        ...params,
        node: node as WorkflowNodeBase<'trigger'>,
      });
    case 'condition':
      return executeConditionNode({
        ...params,
        node: node as WorkflowNodeBase<'condition'>,
      });
    case 'action':
      return executeActionNode({
        ...params,
        node: node as WorkflowNodeBase<'action'>,
      });
    case 'transform':
      return executeTransformNode({
        ...params,
        node: node as WorkflowNodeBase<'transform'>,
      });
    case 'end':
      return executeEndNode({
        ...params,
        node: node as WorkflowNodeBase<'end'>,
      });
    case 'delay':
    case 'retry':
    case 'loop':
    case 'merge': {
      const cfg = node.config as unknown as Record<string, unknown> | undefined;
      if (!cfg || Object.keys(cfg).length === 0) {
        throw new EngineExecutionError({
          code: 'ERR_UNSUPPORTED_NODE_HANDLER',
          message: `Node "${node.name}" uses control-flow type "${node.type}" without a configured handler payload.`,
          nodeId: node.id,
          remediation:
            'Configure the control-flow node parameters in the Node Inspector before executing.',
        });
      }
      if (node.type === 'delay') {
        return executeDelayNode({
          ...params,
          node: node as WorkflowNodeBase<'delay'>,
        });
      }
      if (node.type === 'retry') {
        return executeRetryNode({
          ...params,
          node: node as WorkflowNodeBase<'retry'>,
        });
      }
      if (node.type === 'loop') {
        return executeLoopNode({
          ...params,
          node: node as WorkflowNodeBase<'loop'>,
        });
      }
      return executeMergeNode({
        ...params,
        node: node as WorkflowNodeBase<'merge'>,
      });
    }
    case 'subflow':
      return executeSubflowNode({
        ...params,
        node: node as WorkflowNodeBase<'subflow'>,
      });
    default: {
      const unsupportedNode = node as WorkflowNode;
      throw new EngineExecutionError({
        code: 'ERR_UNSUPPORTED_NODE_HANDLER',
        message: `Node "${unsupportedNode.name}" uses unsupported type "${String(unsupportedNode.type)}".`,
        nodeId: unsupportedNode.id,
        remediation: 'Use a registered FlowForge node type.',
      });
    }
  }
}

