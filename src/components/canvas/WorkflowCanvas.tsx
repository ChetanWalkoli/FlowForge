import React, { useCallback, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, Plus } from 'lucide-react';
import { getNodeSpecification } from '../../domain/registry/node-registry';
import type { NodeType } from '../../domain/types/workflow';
import { replayRunAtEventIndex } from '../../features/trace-lab/trace-replay';
import { useWorkspaceStore } from '../../store/workspace-store';
import { ConnectionEdge, type FlowForgeEdgeData } from '../edges/ConnectionEdge';
import {
  WorkflowNodeComponent,
  type FlowForgeNodeData,
} from '../nodes/WorkflowNode';
import { Button, EmptyState } from '../ui';
import { CanvasControls } from './CanvasControls';

const NODE_TYPES = {
  flowforgeNode: WorkflowNodeComponent,
};

const EDGE_TYPES = {
  flowforgeEdge: ConnectionEdge,
};

const InnerWorkflowCanvas: React.FC = () => {
  const workflow = useWorkspaceStore((s) => s.workflow);
  const selectedNodeIds = useWorkspaceStore((s) => s.selectedNodeIds);
  const selectedEdgeId = useWorkspaceStore((s) => s.selectedEdgeId);
  const validationReport = useWorkspaceStore((s) => s.validationReport);
  const activeRun = useWorkspaceStore((s) => s.activeRun);
  const selectedTraceEventIndex = useWorkspaceStore(
    (s) => s.selectedTraceEventIndex,
  );

  const selectNode = useWorkspaceStore((s) => s.selectNode);
  const selectEdge = useWorkspaceStore((s) => s.selectEdge);
  const addNodeByType = useWorkspaceStore((s) => s.addNodeByType);
  const updateNodePosition = useWorkspaceStore((s) => s.updateNodePosition);
  const connectNodes = useWorkspaceStore((s) => s.connectNodes);
  const autoArrangeNodes = useWorkspaceStore((s) => s.autoArrangeNodes);
  const addToast = useWorkspaceStore((s) => s.addToast);

  const reactFlow = useReactFlow();
  const [zoomPercent, setZoomPercent] = useState(100);
  const [showMinimap, setShowMinimap] = useState(true);

  const displayedRun = useMemo(() => {
    if (!activeRun) return null;
    return replayRunAtEventIndex(
      activeRun,
      selectedTraceEventIndex,
      workflow.edges,
    );
  }, [activeRun, selectedTraceEventIndex, workflow.edges]);

  const selectedSet = useMemo(
    () => new Set(selectedNodeIds),
    [selectedNodeIds],
  );

  const rfNodes: Node<FlowForgeNodeData>[] = useMemo(() => {
    return workflow.nodes.map((node) => {
      const nodeIssues = validationReport.issues.filter(
        (i) => i.nodeId === node.id,
      );
      const hasValidationError = nodeIssues.some((i) => i.severity === 'error');
      const hasValidationWarning = nodeIssues.some(
        (i) => i.severity === 'warning',
      );
      const outgoingCount = workflow.edges.filter(
        (e) => e.source === node.id,
      ).length;
      const nodeTrace = displayedRun?.nodeTraces[node.id];
      const executionStatus = nodeTrace?.status;
      const conditionSelectedBranch: 'true' | 'false' | undefined =
        nodeTrace?.selectedHandleId === 'true' ||
        nodeTrace?.selectedHandleId === 'false'
          ? nodeTrace.selectedHandleId
          : nodeTrace?.conditionReason
            ? nodeTrace.conditionReason.result
              ? 'true'
              : 'false'
            : undefined;

      return {
        id: node.id,
        type: 'flowforgeNode',
        position: node.position,
        width: 230,
        height: 92,
        initialWidth: 230,
        initialHeight: 92,
        dragHandle: '.ff-node-card__header',
        selected: selectedSet.has(node.id),
        data: {
          domainNode: node,
          isSelected: selectedSet.has(node.id),
          hasValidationError,
          hasValidationWarning,
          executionStatus,
          executionDurationMs: nodeTrace?.durationMs,
          executionError: nodeTrace?.error?.message,
          executionSkipReason: nodeTrace?.skipReason,
          conditionSelectedBranch,
          outgoingCount,
        },
      };
    });
  }, [
    displayedRun,
    selectedSet,
    validationReport.issues,
    workflow.edges,
    workflow.nodes,
  ]);

  const rfEdges: Edge<FlowForgeEdgeData>[] = useMemo(() => {
    const traversedSet = new Set(displayedRun?.traversedEdgeIds ?? []);
    return workflow.edges.map((edge) => {
      const isTraversed = Boolean(displayedRun && traversedSet.has(edge.id));
      const sourceTrace = displayedRun?.nodeTraces[edge.source];
      const targetTrace = displayedRun?.nodeTraces[edge.target];

      const isFailed = Boolean(
        displayedRun &&
          ((isTraversed && targetTrace?.status === 'failed') ||
            sourceTrace?.status === 'failed'),
      );

      const selectedBranch =
        sourceTrace?.selectedHandleId ??
        (sourceTrace?.conditionReason
          ? sourceTrace.conditionReason.result
            ? 'true'
            : 'false'
          : undefined);

      const isNonSelectedConditionBranch = Boolean(
        selectedBranch &&
          edge.sourceHandle &&
          edge.sourceHandle !== selectedBranch,
      );

      const isSkipped = Boolean(
        displayedRun &&
          !isTraversed &&
          !isFailed &&
          (sourceTrace?.status === 'skipped' ||
            targetTrace?.status === 'skipped' ||
            isNonSelectedConditionBranch),
      );

      return {
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        targetHandle: edge.targetHandle,
        type: 'flowforgeEdge',
        selected: edge.id === selectedEdgeId,
        data: {
          isSelected: edge.id === selectedEdgeId,
          isTraversed,
          isSkipped,
          isFailed,
          hasActiveRun: Boolean(displayedRun),
          label: edge.label,
        },
      };
    });
  }, [displayedRun, selectedEdgeId, workflow.edges]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      connectNodes({
        source: connection.source,
        sourceHandle: connection.sourceHandle ?? null,
        target: connection.target,
        targetHandle: connection.targetHandle ?? null,
      });
    },
    [connectNodes],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rawType = e.dataTransfer.getData(
        'application/flowforge-node-type',
      ) as NodeType;
      if (!rawType) return;
      const spec = getNodeSpecification(rawType);
      if (!spec) return;

      let dropPos: { x: number; y: number } | undefined;
      if (typeof reactFlow.screenToFlowPosition === 'function') {
        dropPos = reactFlow.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
      }

      const created = addNodeByType(rawType, dropPos);
      addToast(`Dropped ${spec.label} (${created.id}) onto canvas`, 'neutral');
    },
    [addNodeByType, addToast, reactFlow],
  );

  return (
    <main
      className="ff-canvas-viewport"
      aria-label="Workflow canvas workspace"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={handleDrop}
    >
      {workflow.nodes.length === 0 ? (
        <div
          style={{
            margin: 'auto',
            width: '100%',
            maxWidth: '420px',
            zIndex: 5,
          }}
        >
          <EmptyState
            icon={<Play size={20} />}
            title="Start with a trigger"
            description="Add a Trigger node to define your workflow's entry point and input schema."
            shortcutHint="Press Ctrl+K to open the Command Palette"
            action={
              <Button
                variant="primary"
                leftIcon={<Plus size={14} />}
                onClick={() => {
                  const node = addNodeByType('trigger');
                  addToast(`Added Trigger (${node.id})`, 'neutral');
                }}
              >
                Add Trigger Node
              </Button>
            }
          />
        </div>
      ) : (
        <div
          className="ff-reactflow-wrapper"
          role="list"
          aria-label="Workflow nodes on canvas"
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onConnect={handleConnect}
            onNodeDragStop={(_event, node) => {
              updateNodePosition(
                node.id,
                {
                  x: Math.round(node.position.x),
                  y: Math.round(node.position.y),
                },
                true,
              );
            }}
            onEdgeClick={(e, edge) => {
              e.stopPropagation();
              selectEdge(edge.id);
            }}
            onPaneClick={() => {
              selectNode(null);
            }}
            onMove={(_event, viewport) => {
              setZoomPercent(Math.round(viewport.zoom * 100));
            }}
            fitView={false}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={null}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--node-grid)"
            />
            {showMinimap && (
              <MiniMap
                ariaLabel="Workflow minimap"
                nodeColor={(n) =>
                  n.selected ? 'var(--accent)' : 'var(--bg-active)'
                }
                maskColor="rgba(11, 13, 15, 0.72)"
                style={{
                  backgroundColor: 'var(--bg-panel)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              />
            )}
          </ReactFlow>

          <ul
            aria-label="Workflow connections on canvas"
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: 0,
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {rfEdges.map((edge) => {
              const state = edge.data?.isFailed
                ? 'failed'
                : edge.data?.isTraversed
                  ? 'traversed'
                  : edge.data?.isSkipped
                    ? 'skipped'
                    : 'idle';
              return (
                <li
                  key={edge.id}
                  data-edge-id={edge.id}
                  data-edge-state={state}
                >
                  <button
                    type="button"
                    onClick={() => selectEdge(edge.id)}
                  >
                    Connection {edge.id}: {edge.source} → {edge.target} ({state})
                  </button>
                </li>
              );
            })}
          </ul>

          <CanvasControls
            zoomPercent={zoomPercent}
            showMinimap={showMinimap}
            onZoomIn={() => {
              const nextZoom = Math.min(2, Number((zoomPercent / 100 + 0.2).toFixed(2)));
              reactFlow.zoomTo?.(nextZoom);
              setZoomPercent(Math.round(nextZoom * 100));
            }}
            onZoomOut={() => {
              const nextZoom = Math.max(0.25, Number((zoomPercent / 100 - 0.2).toFixed(2)));
              reactFlow.zoomTo?.(nextZoom);
              setZoomPercent(Math.round(nextZoom * 100));
            }}
            onFitView={() => {
              reactFlow.fitView?.({ padding: 0.2 });
              setZoomPercent(100);
            }}
            onResetView={() => {
              reactFlow.setViewport?.({ x: 0, y: 0, zoom: 1 });
              setZoomPercent(100);
            }}
            onToggleMinimap={() => setShowMinimap((prev) => !prev)}
            onAutoArrange={() => autoArrangeNodes()}
          />
        </div>
      )}
    </main>
  );
};

export const WorkflowCanvas: React.FC = () => {
  return (
    <ReactFlowProvider>
      <InnerWorkflowCanvas />
    </ReactFlowProvider>
  );
};
