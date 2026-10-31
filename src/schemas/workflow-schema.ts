/**
 * FlowForge — Zod Validation Schemas
 * Enforces runtime schema correctness for workflow documents, node configs, and untrusted imports.
 */

import { z } from 'zod';
import type { WorkflowDocument } from '../domain/types/workflow';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_WORKFLOW_NODES = 500;
export const MAX_WORKFLOW_EDGES = 1000;

export const PrimitiveTypeNameSchema = z.enum([
  'string',
  'number',
  'boolean',
  'object',
  'array',
]);

export const OperandReferenceSchema = z.object({
  source: z.string().min(1, 'Operand source is required'),
  path: z.string().min(1, 'Operand field path is required'),
});

export const ValueMappingEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('literal'),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
  z.object({
    kind: z.literal('ref'),
    source: z.string().min(1, 'Reference source is required'),
    path: z.string().min(1, 'Reference path is required'),
  }),
]);

export const TriggerNodeConfigSchema = z.object({
  label: z.string().min(1, 'Trigger label is required').max(120),
  inputSchema: z.record(z.string().min(1), PrimitiveTypeNameSchema),
  sampleInput: z.record(z.string(), z.unknown()).optional(),
});

export const ConditionOperatorSchema = z.enum([
  'equals',
  'notEquals',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'isEmpty',
  'isNotEmpty',
  'contains',
]);

export const ConditionNodeConfigSchema = z
  .object({
    description: z.string().max(240).optional(),
    left: OperandReferenceSchema,
    operator: ConditionOperatorSchema,
    right: ValueMappingEntrySchema.optional(),
  })
  .superRefine((config, ctx) => {
    const isUnary =
      config.operator === 'isEmpty' || config.operator === 'isNotEmpty';
    if (!isUnary && !config.right) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Operator "${config.operator}" requires a right-hand operand`,
        path: ['right'],
      });
    }
  });

export const ActionNodeConfigSchema = z
  .object({
    label: z.string().min(1, 'Action label is required').max(120),
    actionType: z.enum(['setValue', 'buildObject', 'appendLog', 'returnResult']),
    key: z.string().optional(),
    value: ValueMappingEntrySchema.optional(),
    fields: z.record(z.string().min(1), ValueMappingEntrySchema).optional(),
    logMessage: z.string().optional(),
  })
  .superRefine((config, ctx) => {
    if (config.actionType === 'setValue') {
      if (!config.key || config.key.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'setValue action requires a target key',
          path: ['key'],
        });
      }
      if (!config.value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'setValue action requires a value configuration',
          path: ['value'],
        });
      }
    }
    if (
      (config.actionType === 'buildObject' ||
        config.actionType === 'returnResult') &&
      (!config.fields || Object.keys(config.fields).length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${config.actionType} requires at least one output field`,
        path: ['fields'],
      });
    }
    if (
      config.actionType === 'appendLog' &&
      (!config.logMessage || config.logMessage.trim() === '')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'appendLog action requires a non-empty logMessage',
        path: ['logMessage'],
      });
    }
  });

export const TransformNodeConfigSchema = z
  .object({
    label: z.string().min(1, 'Transform label is required').max(120),
    operation: z.enum([
      'selectField',
      'renameFields',
      'constructObject',
      'convertType',
    ]),
    source: z.string().optional(),
    fieldPath: z.string().optional(),
    targetType: z.enum(['string', 'number', 'boolean']).optional(),
    fieldMappings: z.record(z.string().min(1), z.string().min(1)).optional(),
    constructedFields: z
      .record(z.string().min(1), ValueMappingEntrySchema)
      .optional(),
  })
  .superRefine((config, ctx) => {
    if (config.operation === 'selectField' || config.operation === 'convertType') {
      if (!config.fieldPath || config.fieldPath.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${config.operation} requires a fieldPath`,
          path: ['fieldPath'],
        });
      }
    }
    if (config.operation === 'convertType' && !config.targetType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'convertType requires a targetType (string, number, or boolean)',
        path: ['targetType'],
      });
    }
    if (
      config.operation === 'renameFields' &&
      (!config.fieldMappings || Object.keys(config.fieldMappings).length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'renameFields requires at least one field mapping',
        path: ['fieldMappings'],
      });
    }
    if (
      config.operation === 'constructObject' &&
      (!config.constructedFields ||
        Object.keys(config.constructedFields).length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'constructObject requires at least one constructed field',
        path: ['constructedFields'],
      });
    }
  });

export const EndNodeConfigSchema = z.object({
  label: z.string().min(1, 'End label is required').max(120),
  outputSource: z.string().optional(),
  requiredFields: z.array(z.string().min(1)).optional(),
});

export const DelayNodeConfigSchema = z.object({
  label: z.string().min(1).max(120),
  durationMs: z.number().int().min(0).max(60000),
});

export const RetryNodeConfigSchema = z.object({
  label: z.string().min(1).max(120),
  maxAttempts: z.number().int().min(1).max(10),
  backoffMs: z.number().int().min(0).max(10000),
  simulateFailuresBeforeSuccess: z.number().int().min(0).max(10).optional(),
});

export const LoopNodeConfigSchema = z.object({
  label: z.string().min(1).max(120),
  arraySource: OperandReferenceSchema,
  maxIterations: z.number().int().min(1).max(1000),
  itemVariable: z.string().min(1).max(64),
});

export const MergeNodeConfigSchema = z.object({
  label: z.string().min(1).max(120),
  strategy: z.enum(['combineObjects', 'collectArray', 'firstCompleted']),
  expectedBranches: z.number().int().min(1).max(20),
});

export const SubflowInputMappingSchema = z.object({
  targetField: z.string().min(1, 'Target field is required').max(120),
  source: OperandReferenceSchema,
});

export const SubflowOutputMappingSchema = z.object({
  targetField: z.string().min(1, 'Target field is required').max(120),
  sourcePath: z.string().min(1, 'Source path is required').max(120),
});

export const SubflowNodeConfigSchema = z.object({
  label: z.string().min(1, 'Subflow label is required').max(120),
  targetWorkflowId: z.string().min(1, 'Target workflow ID is required').max(120),
  targetWorkflowName: z.string().max(120).optional(),
  inputMapping: z.array(SubflowInputMappingSchema).default([]),
  outputMapping: z.array(SubflowOutputMappingSchema).optional(),
});

const NodeBaseFields = {
  id: z.string().min(1, 'Node ID is required').max(128),
  name: z.string().min(1, 'Node name is required').max(120),
  version: z.number().int().positive(),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
};

export const WorkflowNodeSchema = z.discriminatedUnion('type', [
  z.object({
    ...NodeBaseFields,
    type: z.literal('trigger'),
    config: TriggerNodeConfigSchema,
  }),
  z.object({
    ...NodeBaseFields,
    type: z.literal('condition'),
    config: ConditionNodeConfigSchema,
  }),
  z.object({
    ...NodeBaseFields,
    type: z.literal('action'),
    config: ActionNodeConfigSchema,
  }),
  z.object({
    ...NodeBaseFields,
    type: z.literal('transform'),
    config: TransformNodeConfigSchema,
  }),
  z.object({
    ...NodeBaseFields,
    type: z.literal('end'),
    config: EndNodeConfigSchema,
  }),
  z.object({
    ...NodeBaseFields,
    type: z.literal('delay'),
    config: DelayNodeConfigSchema,
  }),
  z.object({
    ...NodeBaseFields,
    type: z.literal('retry'),
    config: RetryNodeConfigSchema,
  }),
  z.object({
    ...NodeBaseFields,
    type: z.literal('loop'),
    config: LoopNodeConfigSchema,
  }),
  z.object({
    ...NodeBaseFields,
    type: z.literal('merge'),
    config: MergeNodeConfigSchema,
  }),
  z.object({
    ...NodeBaseFields,
    type: z.literal('subflow'),
    config: SubflowNodeConfigSchema,
  }),
]);

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1, 'Edge ID is required').max(128),
  source: z.string().min(1, 'Edge source node ID is required'),
  sourceHandle: z.string().nullable(),
  target: z.string().min(1, 'Edge target node ID is required'),
  targetHandle: z.string().nullable(),
  label: z.string().max(120).optional(),
});

export const WorkflowDocumentSchema = z.object({
  format: z.literal('flowforge.workflow'),
  formatVersion: z.literal(1),
  id: z.string().min(1).max(128),
  name: z.string().min(1, 'Workflow name is required').max(120),
  description: z.string().max(1000).optional(),
  revision: z.number().int().positive(),
  status: z.enum(['draft', 'validated', 'tested', 'published']).optional(),
  nodes: z.array(WorkflowNodeSchema).max(MAX_WORKFLOW_NODES),
  edges: z.array(WorkflowEdgeSchema).max(MAX_WORKFLOW_EDGES),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(10)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(10)),
});

export interface ParseWorkflowResult {
  success: boolean;
  document?: WorkflowDocument;
  errors: string[];
}

/**
 * Safely parses and validates an untrusted JSON string or object into a WorkflowDocument.
 */
export function parseWorkflowDocument(
  rawInput: string | unknown,
): ParseWorkflowResult {
  try {
    let parsed: unknown = rawInput;
    if (typeof rawInput === 'string') {
      if (rawInput.length > MAX_IMPORT_BYTES) {
        return {
          success: false,
          errors: [
            `Import exceeds maximum allowed size (${MAX_IMPORT_BYTES} bytes).`,
          ],
        };
      }
      parsed = JSON.parse(rawInput);
    }

    const result = WorkflowDocumentSchema.safeParse(parsed);
    if (!result.success) {
      const errors = result.error.issues.map(
        (issue) => `${issue.path.join('.') || 'document'}: ${issue.message}`,
      );
      return { success: false, errors };
    }

    return {
      success: true,
      document: result.data as WorkflowDocument,
      errors: [],
    };
  } catch (err) {
    return {
      success: false,
      errors: [
        err instanceof Error
          ? `Malformed JSON: ${err.message}`
          : 'Malformed JSON input',
      ],
    };
  }
}

