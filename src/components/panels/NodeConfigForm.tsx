import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  ActionNodeConfig,
  ActionOperationType,
  ConditionNodeConfig,
  ConditionOperator,
  EndNodeConfig,
  PrimitiveTypeName,
  TransformNodeConfig,
  TransformOperationType,
  TriggerNodeConfig,
  ValueMappingEntry,
  WorkflowNode,
} from '../../domain/types/workflow';
import {
  ActionNodeConfigSchema,
  ConditionNodeConfigSchema,
  EndNodeConfigSchema,
  TransformNodeConfigSchema,
  TriggerNodeConfigSchema,
} from '../../schemas/workflow-schema';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button, Input, Select } from '../ui';

const PRIMITIVE_OPTIONS = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'object', label: 'object' },
  { value: 'array', label: 'array' },
];

const CONDITION_OPERATOR_OPTIONS = [
  { value: 'equals', label: 'Equals (==)' },
  { value: 'notEquals', label: 'Not equals (!=)' },
  { value: 'greaterThan', label: 'Greater than (>)' },
  { value: 'greaterThanOrEqual', label: 'Greater than or equal (>=)' },
  { value: 'lessThan', label: 'Less than (<)' },
  { value: 'lessThanOrEqual', label: 'Less than or equal (<=)' },
  { value: 'isEmpty', label: 'Is empty' },
  { value: 'isNotEmpty', label: 'Is not empty' },
  { value: 'contains', label: 'Contains' },
];

const ACTION_TYPE_OPTIONS = [
  { value: 'buildObject', label: 'Build output object' },
  { value: 'setValue', label: 'Set result / value' },
  { value: 'appendLog', label: 'Append log message' },
  { value: 'returnResult', label: 'Return final result' },
];

const TRANSFORM_OP_OPTIONS = [
  { value: 'selectField', label: 'Select field by path' },
  { value: 'renameFields', label: 'Rename / map fields' },
  { value: 'constructObject', label: 'Construct object' },
  { value: 'convertType', label: 'Convert primitive type' },
];

function parseSmartLiteral(raw: string): string | number | boolean | null {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  return raw;
}

export interface NodeConfigFormProps {
  node: WorkflowNode;
}

export const NodeConfigForm: React.FC<NodeConfigFormProps> = ({ node }) => {
  const updateNodeName = useWorkspaceStore((s) => s.updateNodeName);
  const updateNodeConfig = useWorkspaceStore((s) => s.updateNodeConfig);

  const [newSchemaKey, setNewSchemaKey] = useState('');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newRequiredField, setNewRequiredField] = useState('');

  // Common display name input
  const nameError =
    node.name.trim() === '' ? 'Node display name is required' : undefined;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
      aria-label={`Configuration form for ${node.type} node`}
    >
      <Input
        label="Node Display Name"
        required
        value={node.name}
        error={nameError}
        onChange={(e) => updateNodeName(node.id, e.target.value)}
      />

      {/* 1. TRIGGER NODE CONFIG */}
      {node.type === 'trigger' && (
        <TriggerFormSection
          nodeId={node.id}
          config={node.config}
          newSchemaKey={newSchemaKey}
          setNewSchemaKey={setNewSchemaKey}
          onUpdate={(cfg) => updateNodeConfig<'trigger'>(node.id, cfg)}
        />
      )}

      {/* 2. CONDITION NODE CONFIG */}
      {node.type === 'condition' && (
        <ConditionFormSection
          config={node.config}
          onUpdate={(cfg) => updateNodeConfig<'condition'>(node.id, cfg)}
        />
      )}

      {/* 3. ACTION NODE CONFIG */}
      {node.type === 'action' && (
        <ActionFormSection
          config={node.config}
          newFieldKey={newFieldKey}
          setNewFieldKey={setNewFieldKey}
          onUpdate={(cfg) => updateNodeConfig<'action'>(node.id, cfg)}
        />
      )}

      {/* 4. TRANSFORM NODE CONFIG */}
      {node.type === 'transform' && (
        <TransformFormSection
          config={node.config}
          newFieldKey={newFieldKey}
          setNewFieldKey={setNewFieldKey}
          onUpdate={(cfg) => updateNodeConfig<'transform'>(node.id, cfg)}
        />
      )}

      {/* 5. END NODE CONFIG */}
      {node.type === 'end' && (
        <EndFormSection
          config={node.config}
          newRequiredField={newRequiredField}
          setNewRequiredField={setNewRequiredField}
          onUpdate={(cfg) => updateNodeConfig<'end'>(node.id, cfg)}
        />
      )}
    </div>
  );
};

// --- Trigger Subform ---
const TriggerFormSection: React.FC<{
  nodeId: string;
  config: TriggerNodeConfig;
  newSchemaKey: string;
  setNewSchemaKey: (v: string) => void;
  onUpdate: (cfg: TriggerNodeConfig) => void;
}> = ({ config, newSchemaKey, setNewSchemaKey, onUpdate }) => {
  const parsed = TriggerNodeConfigSchema.safeParse(config);
  const labelIssue = !parsed.success
    ? parsed.error.issues.find((i) => i.path.includes('label'))?.message
    : undefined;

  const schemaEntries = Object.entries(config.inputSchema ?? {});

  return (
    <>
      <Input
        label="Trigger Event Label"
        required
        value={config.label}
        error={labelIssue}
        onChange={(e) => onUpdate({ ...config, label: e.target.value })}
      />

      <div className="ff-field">
        <span className="ff-field__label">Input Schema Fields</span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          {schemaEntries.map(([key, typeName]) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}
            >
              <span
                className="ff-mono"
                style={{ flex: 1, color: 'var(--text-primary)' }}
              >
                {key}
              </span>
              <select
                aria-label={`Schema type for ${key}`}
                className="ff-field__select"
                style={{ width: '110px', minHeight: '30px', padding: '2px 8px' }}
                value={typeName}
                onChange={(e) => {
                  onUpdate({
                    ...config,
                    inputSchema: {
                      ...config.inputSchema,
                      [key]: e.target.value as PrimitiveTypeName,
                    },
                  });
                }}
              >
                {PRIMITIVE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Button
                variant="tertiary"
                size="sm"
                iconOnly
                aria-label={`Remove input field ${key}`}
                title={`Remove ${key}`}
                onClick={() => {
                  const nextSchema = { ...config.inputSchema };
                  delete nextSchema[key];
                  onUpdate({ ...config, inputSchema: nextSchema });
                }}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              type="text"
              aria-label="New input schema field name"
              placeholder="e.g. priority"
              className="ff-field__input"
              style={{ minHeight: '32px' }}
              value={newSchemaKey}
              onChange={(e) => setNewSchemaKey(e.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus size={13} />}
              onClick={() => {
                const k = newSchemaKey.trim();
                if (!k) return;
                onUpdate({
                  ...config,
                  inputSchema: {
                    ...config.inputSchema,
                    [k]: 'string',
                  },
                });
                setNewSchemaKey('');
              }}
            >
              Add Field
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

// --- Condition Subform ---
const ConditionFormSection: React.FC<{
  config: ConditionNodeConfig;
  onUpdate: (cfg: ConditionNodeConfig) => void;
}> = ({ config, onUpdate }) => {
  const parsed = ConditionNodeConfigSchema.safeParse(config);
  const issues = !parsed.success ? parsed.error.issues : [];

  const leftSourceError = issues.find(
    (i) => i.path[0] === 'left' && i.path[1] === 'source',
  )?.message;
  const leftPathError = issues.find(
    (i) => i.path[0] === 'left' && i.path[1] === 'path',
  )?.message;
  const rightError = issues.find((i) => i.path[0] === 'right')?.message;

  const isUnary =
    config.operator === 'isEmpty' || config.operator === 'isNotEmpty';

  const rightValueStr =
    config.right?.kind === 'literal'
      ? String(config.right.value ?? '')
      : config.right?.kind === 'ref'
        ? `${config.right.source}.${config.right.path}`
        : '';

  return (
    <>
      <Input
        label="Condition Description"
        optional
        value={config.description ?? ''}
        onChange={(e) => onUpdate({ ...config, description: e.target.value })}
      />

      <Input
        label="Left Operand Source"
        required
        mono
        value={config.left.source}
        error={leftSourceError}
        helperText="Node ID (e.g. trigger_1) or 'trigger'"
        onChange={(e) =>
          onUpdate({
            ...config,
            left: { ...config.left, source: e.target.value },
          })
        }
      />

      <Input
        label="Left Operand Field Path"
        required
        mono
        value={config.left.path}
        error={leftPathError}
        helperText="Dot path on source payload (e.g. amount)"
        onChange={(e) =>
          onUpdate({
            ...config,
            left: { ...config.left, path: e.target.value },
          })
        }
      />

      <Select
        label="Comparison Operator"
        value={config.operator}
        options={CONDITION_OPERATOR_OPTIONS}
        onChange={(e) => {
          const nextOp = e.target.value as ConditionOperator;
          const nextUnary = nextOp === 'isEmpty' || nextOp === 'isNotEmpty';
          onUpdate({
            ...config,
            operator: nextOp,
            right: nextUnary
              ? undefined
              : config.right ?? { kind: 'literal', value: '' },
          });
        }}
      />

      {!isUnary && (
        <Input
          label="Right Comparison Value"
          required
          mono
          value={rightValueStr}
          error={rightError}
          helperText="Numbers, booleans, or string literals are parsed automatically"
          onChange={(e) => {
            onUpdate({
              ...config,
              right: {
                kind: 'literal',
                value: parseSmartLiteral(e.target.value),
              },
            });
          }}
        />
      )}
    </>
  );
};

// --- Action Subform ---
const ActionFormSection: React.FC<{
  config: ActionNodeConfig;
  newFieldKey: string;
  setNewFieldKey: (v: string) => void;
  onUpdate: (cfg: ActionNodeConfig) => void;
}> = ({ config, newFieldKey, setNewFieldKey, onUpdate }) => {
  const parsed = ActionNodeConfigSchema.safeParse(config);
  const issues = !parsed.success ? parsed.error.issues : [];

  const labelError = issues.find((i) => i.path.includes('label'))?.message;
  const keyError = issues.find((i) => i.path.includes('key'))?.message;
  const logError = issues.find((i) => i.path.includes('logMessage'))?.message;
  const fieldsError = issues.find((i) => i.path.includes('fields'))?.message;

  const fieldEntries = Object.entries(config.fields ?? {});

  return (
    <>
      <Input
        label="Action Label"
        required
        value={config.label}
        error={labelError}
        onChange={(e) => onUpdate({ ...config, label: e.target.value })}
      />

      <Select
        label="Action Operation"
        value={config.actionType}
        options={ACTION_TYPE_OPTIONS}
        onChange={(e) => {
          const nextType = e.target.value as ActionOperationType;
          onUpdate({
            ...config,
            actionType: nextType,
            key: nextType === 'setValue' ? config.key ?? 'result' : config.key,
            value:
              nextType === 'setValue'
                ? config.value ?? { kind: 'literal', value: 'ok' }
                : config.value,
            logMessage:
              nextType === 'appendLog'
                ? config.logMessage ?? 'Action executed'
                : config.logMessage,
            fields:
              nextType === 'buildObject' || nextType === 'returnResult'
                ? config.fields ?? {
                    status: { kind: 'literal', value: 'completed' },
                  }
                : config.fields,
          });
        }}
      />

      {config.actionType === 'setValue' && (
        <>
          <Input
            label="Target Key"
            required
            mono
            value={config.key ?? ''}
            error={keyError}
            onChange={(e) => onUpdate({ ...config, key: e.target.value })}
          />
          <Input
            label="Assigned Value"
            required
            mono
            value={
              config.value?.kind === 'literal'
                ? String(config.value.value ?? '')
                : ''
            }
            onChange={(e) =>
              onUpdate({
                ...config,
                value: {
                  kind: 'literal',
                  value: parseSmartLiteral(e.target.value),
                },
              })
            }
          />
        </>
      )}

      {config.actionType === 'appendLog' && (
        <Input
          label="Log Message"
          required
          value={config.logMessage ?? ''}
          error={logError}
          onChange={(e) => onUpdate({ ...config, logMessage: e.target.value })}
        />
      )}

      {(config.actionType === 'buildObject' ||
        config.actionType === 'returnResult') && (
        <div className="ff-field">
          <span className="ff-field__label">Output Object Fields</span>
          {fieldsError && (
            <div role="alert" className="ff-field__error">
              <span>{fieldsError}</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {fieldEntries.map(([fieldKey, mapping]) => {
              const displayVal =
                mapping.kind === 'literal'
                  ? String(mapping.value ?? '')
                  : `@${mapping.source}.${mapping.path}`;
              return (
                <div
                  key={fieldKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                  }}
                >
                  <span className="ff-mono" style={{ width: '90px' }}>
                    {fieldKey}
                  </span>
                  <input
                    type="text"
                    aria-label={`Field value for ${fieldKey}`}
                    className="ff-field__input ff-field__input--mono"
                    style={{ minHeight: '30px', flex: 1 }}
                    value={displayVal}
                    onChange={(e) => {
                      const raw = e.target.value;
                      let nextEntry: ValueMappingEntry;
                      if (raw.startsWith('@') && raw.includes('.')) {
                        const [src, ...rest] = raw.slice(1).split('.');
                        nextEntry = {
                          kind: 'ref',
                          source: src || 'trigger',
                          path: rest.join('.') || 'value',
                        };
                      } else {
                        nextEntry = {
                          kind: 'literal',
                          value: parseSmartLiteral(raw),
                        };
                      }
                      onUpdate({
                        ...config,
                        fields: {
                          ...config.fields,
                          [fieldKey]: nextEntry,
                        },
                      });
                    }}
                  />
                  <Button
                    variant="tertiary"
                    size="sm"
                    iconOnly
                    aria-label={`Remove output field ${fieldKey}`}
                    onClick={() => {
                      const next = { ...config.fields };
                      delete next[fieldKey];
                      onUpdate({ ...config, fields: next });
                    }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input
                type="text"
                aria-label="New action output field key"
                placeholder="Field key..."
                className="ff-field__input"
                style={{ minHeight: '32px' }}
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
              />
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus size={13} />}
                onClick={() => {
                  const k = newFieldKey.trim();
                  if (!k) return;
                  onUpdate({
                    ...config,
                    fields: {
                      ...config.fields,
                      [k]: { kind: 'literal', value: '' },
                    },
                  });
                  setNewFieldKey('');
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// --- Transform Subform ---
const TransformFormSection: React.FC<{
  config: TransformNodeConfig;
  newFieldKey: string;
  setNewFieldKey: (v: string) => void;
  onUpdate: (cfg: TransformNodeConfig) => void;
}> = ({ config, newFieldKey, setNewFieldKey, onUpdate }) => {
  const parsed = TransformNodeConfigSchema.safeParse(config);
  const issues = !parsed.success ? parsed.error.issues : [];

  const labelError = issues.find((i) => i.path.includes('label'))?.message;
  const pathError = issues.find((i) => i.path.includes('fieldPath'))?.message;

  return (
    <>
      <Input
        label="Transform Label"
        required
        value={config.label}
        error={labelError}
        onChange={(e) => onUpdate({ ...config, label: e.target.value })}
      />

      <Select
        label="Transform Operation"
        value={config.operation}
        options={TRANSFORM_OP_OPTIONS}
        onChange={(e) => {
          const nextOp = e.target.value as TransformOperationType;
          onUpdate({
            ...config,
            operation: nextOp,
            fieldPath:
              nextOp === 'selectField' || nextOp === 'convertType'
                ? config.fieldPath ?? 'amount'
                : config.fieldPath,
            targetType:
              nextOp === 'convertType'
                ? config.targetType ?? 'number'
                : config.targetType,
            fieldMappings:
              nextOp === 'renameFields'
                ? config.fieldMappings ?? { oldKey: 'newKey' }
                : config.fieldMappings,
            constructedFields:
              nextOp === 'constructObject'
                ? config.constructedFields ?? {
                    outputKey: { kind: 'literal', value: 'transformed' },
                  }
                : config.constructedFields,
          });
        }}
      />

      {(config.operation === 'selectField' ||
        config.operation === 'convertType') && (
        <>
          <Input
            label="Source Node / Scope"
            mono
            value={config.source ?? 'trigger'}
            onChange={(e) => onUpdate({ ...config, source: e.target.value })}
          />
          <Input
            label="Field Path"
            required
            mono
            value={config.fieldPath ?? ''}
            error={pathError}
            onChange={(e) => onUpdate({ ...config, fieldPath: e.target.value })}
          />
        </>
      )}

      {config.operation === 'convertType' && (
        <Select
          label="Target Primitive Type"
          value={config.targetType ?? 'number'}
          options={[
            { value: 'string', label: 'string' },
            { value: 'number', label: 'number' },
            { value: 'boolean', label: 'boolean' },
          ]}
          onChange={(e) =>
            onUpdate({
              ...config,
              targetType: e.target.value as 'string' | 'number' | 'boolean',
            })
          }
        />
      )}

      {config.operation === 'renameFields' && (
        <div className="ff-field">
          <span className="ff-field__label">Field Mappings (From → To)</span>
          {Object.entries(config.fieldMappings ?? {}).map(([fromKey, toKey]) => (
            <div
              key={fromKey}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}
            >
              <span className="ff-mono">{fromKey} →</span>
              <input
                type="text"
                aria-label={`Target field name for ${fromKey}`}
                className="ff-field__input ff-field__input--mono"
                style={{ minHeight: '30px', flex: 1 }}
                value={toKey}
                onChange={(e) =>
                  onUpdate({
                    ...config,
                    fieldMappings: {
                      ...config.fieldMappings,
                      [fromKey]: e.target.value,
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      )}

      {config.operation === 'constructObject' && (
        <div className="ff-field">
          <span className="ff-field__label">Constructed Fields</span>
          {Object.entries(config.constructedFields ?? {}).map(([k, entry]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}
            >
              <span className="ff-mono" style={{ width: '90px' }}>
                {k}
              </span>
              <input
                type="text"
                aria-label={`Constructed value for ${k}`}
                className="ff-field__input ff-field__input--mono"
                style={{ minHeight: '30px', flex: 1 }}
                value={
                  entry.kind === 'literal'
                    ? String(entry.value ?? '')
                    : `@${entry.source}.${entry.path}`
                }
                onChange={(e) =>
                  onUpdate({
                    ...config,
                    constructedFields: {
                      ...config.constructedFields,
                      [k]: {
                        kind: 'literal',
                        value: parseSmartLiteral(e.target.value),
                      },
                    },
                  })
                }
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              type="text"
              aria-label="New constructed field key"
              placeholder="Field key..."
              className="ff-field__input"
              style={{ minHeight: '32px' }}
              value={newFieldKey}
              onChange={(e) => setNewFieldKey(e.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const k = newFieldKey.trim();
                if (!k) return;
                onUpdate({
                  ...config,
                  constructedFields: {
                    ...config.constructedFields,
                    [k]: { kind: 'literal', value: '' },
                  },
                });
                setNewFieldKey('');
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

// --- End Subform ---
const EndFormSection: React.FC<{
  config: EndNodeConfig;
  newRequiredField: string;
  setNewRequiredField: (v: string) => void;
  onUpdate: (cfg: EndNodeConfig) => void;
}> = ({ config, newRequiredField, setNewRequiredField, onUpdate }) => {
  const parsed = EndNodeConfigSchema.safeParse(config);
  const labelError = !parsed.success
    ? parsed.error.issues.find((i) => i.path.includes('label'))?.message
    : undefined;

  const requiredFields = config.requiredFields ?? [];

  return (
    <>
      <Input
        label="Terminal Output Label"
        required
        value={config.label}
        error={labelError}
        onChange={(e) => onUpdate({ ...config, label: e.target.value })}
      />

      <Input
        label="Output Source"
        mono
        value={config.outputSource ?? 'upstream'}
        helperText="'upstream' or a specific upstream node ID"
        onChange={(e) => onUpdate({ ...config, outputSource: e.target.value })}
      />

      <div className="ff-field">
        <span className="ff-field__label">Required Output Fields</span>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-1)',
          }}
        >
          {requiredFields.map((field) => (
            <span key={field} className="ff-badge ff-badge--neutral ff-mono">
              {field}
              <button
                type="button"
                aria-label={`Remove required field ${field}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  marginLeft: '4px',
                }}
                onClick={() =>
                  onUpdate({
                    ...config,
                    requiredFields: requiredFields.filter((f) => f !== field),
                  })
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: '4px' }}>
          <input
            type="text"
            aria-label="New required output field"
            placeholder="e.g. decision"
            className="ff-field__input"
            style={{ minHeight: '32px' }}
            value={newRequiredField}
            onChange={(e) => setNewRequiredField(e.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const f = newRequiredField.trim();
              if (!f || requiredFields.includes(f)) return;
              onUpdate({
                ...config,
                requiredFields: [...requiredFields, f],
              });
              setNewRequiredField('');
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </>
  );
};

