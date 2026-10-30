import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';

export interface FlowForgeEdgeData extends Record<string, unknown> {
  isSelected?: boolean;
  isTraversed?: boolean;
  isSkipped?: boolean;
  isFailed?: boolean;
  hasActiveRun?: boolean;
  label?: string;
}

export const ConnectionEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}) => {
  const edgeData = (data ?? {}) as FlowForgeEdgeData;
  const isSelected = Boolean(selected || edgeData.isSelected);
  const isTraversed = Boolean(edgeData.isTraversed);
  const isSkipped = Boolean(edgeData.isSkipped);
  const isFailed = Boolean(edgeData.isFailed);

  const edgeRuntimeState = isFailed
    ? 'failed'
    : isTraversed
      ? 'traversed'
      : isSkipped
        ? 'skipped'
        : 'idle';

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const strokeColor = isFailed
    ? 'var(--danger)'
    : isSelected || isTraversed
      ? 'var(--accent)'
      : isSkipped
        ? 'var(--border-subtle)'
        : 'var(--border-strong)';

  const strokeWidth = isSelected || isTraversed || isFailed ? 2.3 : 1.6;

  return (
    <g
      data-edge-id={id}
      data-edge-state={edgeRuntimeState}
      className={`ff-edge ff-edge--${edgeRuntimeState}`}
    >
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: isSkipped ? '4 4' : undefined,
          opacity: isSkipped ? 0.55 : 1,
        }}
      />
      {(edgeData.label || isTraversed || isSkipped || isFailed) && (
        <EdgeLabelRenderer>
          <div
            data-edge-badge={id}
            data-edge-state={edgeRuntimeState}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              backgroundColor: 'var(--bg-elevated)',
              border: `1px solid ${
                isFailed
                  ? 'var(--danger)'
                  : isSelected || isTraversed
                    ? 'var(--accent)'
                    : 'var(--border-subtle)'
              }`,
              color: isFailed
                ? 'var(--danger)'
                : isSkipped
                  ? 'var(--text-muted)'
                  : edgeData.label === 'true' || isTraversed
                    ? 'var(--success)'
                    : edgeData.label === 'false'
                      ? 'var(--warning)'
                      : 'var(--text-secondary)',
              padding: '1px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              opacity: isSkipped ? 0.7 : 1,
            }}
            className="nodrag nopan"
          >
            {edgeData.label
              ? isTraversed
                ? `${edgeData.label} ✓`
                : isSkipped
                  ? `${edgeData.label} (skipped)`
                  : edgeData.label
              : isFailed
                ? 'failed'
                : isTraversed
                  ? 'traversed'
                  : 'skipped'}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
};
