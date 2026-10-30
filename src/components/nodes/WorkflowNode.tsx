import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle } from 'lucide-react';
import { getNodeSpecification } from '../../domain/registry/node-registry';
import type {
  NodeStatus,
  WorkflowNode as DomainWorkflowNode,
} from '../../domain/types/workflow';
import { useWorkspaceStore } from '../../store/workspace-store';
import { StatusBadge } from '../ui';
import { NodeCategoryIcon } from '../ui/NodeCategoryIcon';

export interface FlowForgeNodeData extends Record<string, unknown> {
  domainNode: DomainWorkflowNode;
  isSelected: boolean;
  hasValidationError: boolean;
  hasValidationWarning: boolean;
  executionStatus?: NodeStatus;
  executionDurationMs?: number;
  executionError?: string;
  executionSkipReason?: string;
  conditionSelectedBranch?: 'true' | 'false';
  outgoingCount: number;
}

function summarizeNodeConfig(node: DomainWorkflowNode): string {
  switch (node.type) {
    case 'trigger': {
      const keys = Object.keys(node.config.inputSchema ?? {});
      return keys.length > 0
        ? `Inputs: ${keys.join(', ')}`
        : node.config.label;
    }
    case 'condition': {
      const { left, operator, right } = node.config;
      const rightStr =
        right?.kind === 'literal'
          ? JSON.stringify(right.value)
          : right?.kind === 'ref'
            ? `${right.source}.${right.path}`
            : '';
      return `${left.source}.${left.path} ${operator} ${rightStr}`.trim();
    }
    case 'action': {
      return `${node.config.actionType} · ${node.config.label}`;
    }
    case 'transform': {
      return `${node.config.operation} · ${node.config.label}`;
    }
    case 'end': {
      const req = node.config.requiredFields ?? [];
      return req.length > 0
        ? `Requires: ${req.join(', ')}`
        : node.config.label;
    }
    default:
      return getNodeSpecification(node.type).subtitle;
  }
}

export const WorkflowNodeComponent: React.FC<NodeProps> = ({ data }) => {
  const nodeData = data as FlowForgeNodeData;
  const {
    domainNode,
    isSelected,
    hasValidationError,
    hasValidationWarning,
    executionStatus,
    executionDurationMs,
    executionError,
    executionSkipReason,
    conditionSelectedBranch,
    outgoingCount,
  } = nodeData;

  const selectNode = useWorkspaceStore((s) => s.selectNode);
  const spec = getNodeSpecification(domainNode.type);

  const badgeStatus: NodeStatus | 'warning' = executionStatus
    ? executionStatus
    : hasValidationError
      ? 'failed'
      : hasValidationWarning
        ? 'warning'
        : 'pending';

  const badgeLabel = executionStatus
    ? executionStatus.charAt(0).toUpperCase() + executionStatus.slice(1)
    : hasValidationError
      ? 'Invalid'
      : hasValidationWarning
        ? 'Warning'
        : spec.label;

  return (
    <div
      role="listitem"
      tabIndex={0}
      aria-label={`Workflow node: ${domainNode.name} (${spec.label})`}
      aria-selected={isSelected}
      data-node-id={domainNode.id}
      data-node-type={domainNode.type}
      data-execution-status={executionStatus ?? 'idle'}
      className={[
        'ff-node-card',
        'nodrag',
        isSelected ? 'ff-node-card--selected' : '',
        hasValidationError ? 'ff-node-card--invalid' : '',
        executionStatus ? `ff-node-card--${executionStatus}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => {
        e.stopPropagation();
        selectNode(domainNode.id, e.shiftKey || e.metaKey || e.ctrlKey);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          selectNode(domainNode.id, e.shiftKey || e.metaKey || e.ctrlKey);
        }
      }}
    >
      {/* Input Handles */}
      {spec.inputs.map((port) => (
        <Handle
          key={`in_${port.id}`}
          id={port.id}
          type="target"
          position={Position.Left}
          className="ff-handle ff-handle--input"
          aria-label={`Input port ${port.label} (${port.dataType})`}
          title={`Input: ${port.label} (${port.dataType})`}
        />
      ))}

      <div className="ff-node-card__header">
        <div className="ff-node-card__title-group">
          <NodeCategoryIcon type={domainNode.type} size={14} />
          <span className="ff-node-card__title">{domainNode.name}</span>
        </div>
        <StatusBadge status={badgeStatus} label={badgeLabel} />
      </div>

      <div
        className="ff-mono"
        style={{
          fontSize: 'var(--text-compact)',
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {summarizeNodeConfig(domainNode)}
      </div>

      {executionStatus === 'failed' && executionError && (
        <div
          role="alert"
          data-testid={`node-runtime-error-${domainNode.id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '4px',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--danger-subtle)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            fontSize: '10px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={executionError}
        >
          <AlertCircle size={11} aria-hidden="true" />
          <span>{executionError}</span>
        </div>
      )}

      {executionStatus === 'skipped' && executionSkipReason && (
        <div
          data-testid={`node-skip-reason-${domainNode.id}`}
          style={{
            marginTop: '2px',
            fontSize: '10px',
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={executionSkipReason}
        >
          Skipped: {executionSkipReason}
        </div>
      )}

      <div className="ff-node-card__meta ff-mono">
        <span>{domainNode.id}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {conditionSelectedBranch && (
            <span
              style={{
                color:
                  conditionSelectedBranch === 'true'
                    ? 'var(--success)'
                    : 'var(--warning)',
              }}
            >
              → {conditionSelectedBranch}
            </span>
          )}
          {executionDurationMs !== undefined && (
            <span className="ff-tabular">{executionDurationMs}ms</span>
          )}
          <span>{outgoingCount} out</span>
        </span>
      </div>

      {/* Output Handles */}
      {spec.outputs.map((port, idx) => {
        const total = spec.outputs.length;
        const topPercent =
          total === 1 ? 50 : idx === 0 ? 34 : 68;
        return (
          <div
            key={`out_wrap_${port.id}`}
            className="ff-handle-wrapper"
            style={{ top: `${topPercent}%` }}
          >
            {total > 1 && (
              <span
                className={`ff-handle-label ff-handle-label--${port.id}`}
              >
                {port.id}
              </span>
            )}
            <Handle
              id={port.id}
              type="source"
              position={Position.Right}
              style={{ top: `${topPercent}%` }}
              className={`ff-handle ff-handle--output ff-handle--${port.id}`}
              aria-label={`Output port ${port.label} (${port.dataType})`}
              title={`Output: ${port.label} (${port.dataType})`}
            />
          </div>
        );
      })}
    </div>
  );
};
