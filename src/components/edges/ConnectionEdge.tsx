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
  isFailed?: boolean;
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
  const isFailed = Boolean(edgeData.isFailed);

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
      : 'var(--border-strong)';

  const strokeWidth = isSelected || isTraversed ? 2.2 : 1.6;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
        }}
      />
      {edgeData.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              backgroundColor: 'var(--bg-elevated)',
              border: `1px solid ${
                isSelected ? 'var(--accent)' : 'var(--border-subtle)'
              }`,
              color:
                edgeData.label === 'true'
                  ? 'var(--success)'
                  : edgeData.label === 'false'
                    ? 'var(--warning)'
                    : 'var(--text-secondary)',
              padding: '1px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
            }}
            className="nodrag nopan"
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

