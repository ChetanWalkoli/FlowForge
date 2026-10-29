import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { getNodeSpecification } from '../../domain/registry/node-registry';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button, EmptyState, Input, PayloadViewer, StatusBadge } from '../ui';
import { NodeCategoryIcon } from '../ui/NodeCategoryIcon';
import { NodeConfigForm } from './NodeConfigForm';

export const ContextualInspector: React.FC = () => {
  const collapsed = useWorkspaceStore((s) => s.rightInspectorCollapsed);
  const inspectorMode = useWorkspaceStore((s) => s.inspectorMode);
  const workflow = useWorkspaceStore((s) => s.workflow);
  const selectedNodeId = useWorkspaceStore((s) => s.selectedNodeId);
  const selectedNodeIds = useWorkspaceStore((s) => s.selectedNodeIds);
  const selectedEdgeId = useWorkspaceStore((s) => s.selectedEdgeId);
  const validationReport = useWorkspaceStore((s) => s.validationReport);
  const activeRun = useWorkspaceStore((s) => s.activeRun);

  const toggleRightInspector = useWorkspaceStore((s) => s.toggleRightInspector);
  const setInspectorMode = useWorkspaceStore((s) => s.setInspectorMode);
  const renameWorkflow = useWorkspaceStore((s) => s.renameWorkflow);
  const updateWorkflowDescription = useWorkspaceStore(
    (s) => s.updateWorkflowDescription,
  );
  const selectNode = useWorkspaceStore((s) => s.selectNode);
  const removeNode = useWorkspaceStore((s) => s.removeNode);
  const removeEdge = useWorkspaceStore((s) => s.removeEdge);
  const duplicateNodes = useWorkspaceStore((s) => s.duplicateNodes);
  const connectNodes = useWorkspaceStore((s) => s.connectNodes);
  const runStaticValidation = useWorkspaceStore((s) => s.runStaticValidation);
  const addToast = useWorkspaceStore((s) => s.addToast);

  const selectedNode =
    workflow.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const selectedEdge =
    workflow.edges.find((e) => e.id === selectedEdgeId) ?? null;

  const nodeIssues = selectedNode
    ? validationReport.issues.filter((i) => i.nodeId === selectedNode.id)
    : [];

  if (collapsed) {
    return (
      <aside
        className="ff-inspector ff-inspector--collapsed"
        aria-label="Contextual inspector (collapsed)"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 'var(--space-2)',
          }}
        >
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label="Expand inspector"
            title="Expand inspector"
            onClick={toggleRightInspector}
          >
            <ChevronLeft size={16} />
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="ff-inspector" aria-label="Contextual inspector">
      <div className="ff-inspector__header">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          <h2 className="ff-inspector__title">Inspector</h2>
        </div>
        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          aria-label="Collapse inspector"
          title="Collapse inspector"
          onClick={toggleRightInspector}
        >
          <ChevronRight size={16} />
        </Button>
      </div>

      <div
        className="ff-inspector__mode-tabs"
        role="tablist"
        aria-label="Inspector context modes"
      >
        <button
          type="button"
          role="tab"
          aria-selected={inspectorMode === 'overview'}
          className={`ff-sidebar__tab ${
            inspectorMode === 'overview' ? 'ff-sidebar__tab--active' : ''
          }`.trim()}
          onClick={() => setInspectorMode('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={inspectorMode === 'node'}
          className={`ff-sidebar__tab ${
            inspectorMode === 'node' ? 'ff-sidebar__tab--active' : ''
          }`.trim()}
          onClick={() => setInspectorMode('node')}
        >
          Node
          {selectedNodeIds.length > 1 && (
            <span className="ff-tabular">({selectedNodeIds.length})</span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={inspectorMode === 'run'}
          className={`ff-sidebar__tab ${
            inspectorMode === 'run' ? 'ff-sidebar__tab--active' : ''
          }`.trim()}
          onClick={() => setInspectorMode('run')}
        >
          Run
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={inspectorMode === 'error'}
          className={`ff-sidebar__tab ${
            inspectorMode === 'error' ? 'ff-sidebar__tab--active' : ''
          }`.trim()}
          onClick={() => setInspectorMode('error')}
        >
          Errors
          {validationReport.errorsCount > 0 && (
            <span className="ff-tabular" style={{ color: 'var(--danger)' }}>
              ({validationReport.errorsCount})
            </span>
          )}
        </button>
      </div>

      <div className="ff-inspector__body">
        {inspectorMode === 'overview' && (
          <>
            <section
              className="ff-inspector__section"
              aria-label="Workflow summary"
            >
              <h3 className="ff-inspector__section-title">Workflow Overview</h3>
              <Input
                label="Name"
                value={workflow.name}
                onChange={(e) => renameWorkflow(e.target.value)}
              />
              <Input
                label="Description"
                optional
                value={workflow.description ?? ''}
                placeholder="Describe what this workflow automates..."
                onChange={(e) => updateWorkflowDescription(e.target.value)}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 'var(--text-secondary-size)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>
                  Nodes:{' '}
                  <strong className="ff-tabular">{workflow.nodes.length}</strong>
                </span>
                <span>
                  Connections:{' '}
                  <strong className="ff-tabular">{workflow.edges.length}</strong>
                </span>
                <StatusBadge
                  status={validationReport.canExecute ? 'success' : 'failed'}
                  label={
                    validationReport.canExecute
                      ? 'Ready to run'
                      : `${validationReport.errorsCount} error(s)`
                  }
                />
              </div>
            </section>

            {selectedEdge && (
              <section
                className="ff-inspector__section"
                aria-label="Selected connection details"
              >
                <h3 className="ff-inspector__section-title">
                  Selected Connection
                </h3>
                <div className="ff-mono" style={{ color: 'var(--text-secondary)' }}>
                  {selectedEdge.source}:{selectedEdge.sourceHandle ?? 'out'} →{' '}
                  {selectedEdge.target}:{selectedEdge.targetHandle ?? 'in'}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  leftIcon={<Trash2 size={13} />}
                  onClick={() => {
                    removeEdge(selectedEdge.id);
                    addToast('Removed connection.', 'neutral');
                  }}
                >
                  Disconnect Edge
                </Button>
              </section>
            )}

            <section
              className="ff-inspector__section"
              aria-label="Helpful next action"
            >
              <h3 className="ff-inspector__section-title">Next Action</h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--text-secondary-size)',
                  color: 'var(--text-secondary)',
                }}
              >
                {workflow.nodes.length === 0
                  ? 'Add a Trigger node from the left library to define the workflow input schema.'
                  : !validationReport.canExecute
                    ? 'Inspect validation issues in the Errors tab or bottom drawer to unblock execution.'
                    : 'Select any node on the canvas to configure its parameters, ports, and schema.'}
              </p>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<CheckCircle2 size={13} />}
                onClick={() => runStaticValidation()}
              >
                Inspect Validation Report
              </Button>
            </section>
          </>
        )}

        {inspectorMode === 'node' && (
          <>
            {!selectedNode ? (
              <EmptyState
                title="No node selected"
                description="Select a node on the canvas or in the Outline tab to configure its settings, ports, and validation."
              />
            ) : (
              <>
                <section
                  className="ff-inspector__section"
                  aria-label="Selected node identity"
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <NodeCategoryIcon type={selectedNode.type} size={16} />
                      <strong>{selectedNode.name}</strong>
                    </div>
                    <StatusBadge
                      status={
                        nodeIssues.some((i) => i.severity === 'error')
                          ? 'failed'
                          : nodeIssues.length > 0
                            ? 'warning'
                            : 'success'
                      }
                      label={
                        nodeIssues.some((i) => i.severity === 'error')
                          ? 'Invalid'
                          : nodeIssues.length > 0
                            ? 'Warning'
                            : 'Valid'
                      }
                    />
                  </div>
                  <div
                    className="ff-mono"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    ID: {selectedNode.id} · Type: {selectedNode.type} · v
                    {selectedNode.version}
                  </div>
                  {selectedNodeIds.length > 1 && (
                    <div
                      style={{
                        fontSize: 'var(--text-compact)',
                        color: 'var(--accent)',
                      }}
                    >
                      {selectedNodeIds.length} nodes selected
                    </div>
                  )}
                  <p
                    style={{
                      margin: 0,
                      fontSize: 'var(--text-secondary-size)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {getNodeSpecification(selectedNode.type).description}
                  </p>
                </section>

                {/* Dynamic Contextual Configuration Form */}
                <section
                  className="ff-inspector__section"
                  aria-label="Node configuration"
                >
                  <h3 className="ff-inspector__section-title">
                    Configuration Settings
                  </h3>
                  <NodeConfigForm node={selectedNode} />
                </section>

                {/* Port & Connection Management */}
                <section
                  className="ff-inspector__section"
                  aria-label="Node ports and connections"
                >
                  <h3 className="ff-inspector__section-title">
                    Ports & Connections
                  </h3>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-2)',
                      fontSize: 'var(--text-secondary-size)',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Inputs: </span>
                      <span className="ff-mono">
                        {getNodeSpecification(selectedNode.type)
                          .inputs.map((p) => `${p.id} (${p.dataType})`)
                          .join(', ') || 'none'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Outputs: </span>
                      <span className="ff-mono">
                        {getNodeSpecification(selectedNode.type)
                          .outputs.map((p) => `${p.id} (${p.dataType})`)
                          .join(', ') || 'none'}
                      </span>
                    </div>

                    {/* Active outgoing connections with disconnect buttons */}
                    {workflow.edges
                      .filter((e) => e.source === selectedNode.id)
                      .map((edge) => {
                        const tgt = workflow.nodes.find(
                          (n) => n.id === edge.target,
                        );
                        return (
                          <div
                            key={edge.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '4px 8px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'var(--bg-elevated)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <span className="ff-mono">
                              [{edge.sourceHandle ?? 'out'}] →{' '}
                              {tgt?.name ?? edge.target}
                            </span>
                            <Button
                              variant="tertiary"
                              size="sm"
                              aria-label={`Disconnect ${edge.sourceHandle ?? 'out'} to ${tgt?.name ?? edge.target}`}
                              onClick={() => {
                                removeEdge(edge.id);
                                addToast('Connection removed.', 'neutral');
                              }}
                            >
                              Disconnect
                            </Button>
                          </div>
                        );
                      })}

                    {/* Accessible quick-connect control for keyboard users */}
                    {getNodeSpecification(selectedNode.type).outputs.length >
                      0 && (
                      <QuickConnectControl
                        sourceNode={selectedNode}
                        allNodes={workflow.nodes}
                        onConnect={(sourceHandle, targetId) => {
                          const targetNode = workflow.nodes.find(
                            (n) => n.id === targetId,
                          );
                          const targetSpec = targetNode
                            ? getNodeSpecification(targetNode.type)
                            : null;
                          const targetHandle =
                            targetSpec?.inputs[0]?.id ?? 'in';
                          const res = connectNodes({
                            source: selectedNode.id,
                            sourceHandle,
                            target: targetId,
                            targetHandle,
                          });
                          if (res.valid) {
                            addToast(
                              `Connected ${selectedNode.name} → ${targetNode?.name ?? targetId}`,
                              'neutral',
                            );
                          }
                        }}
                      />
                    )}
                  </div>
                </section>

                <section
                  className="ff-inspector__section"
                  aria-label="Node configuration payload"
                >
                  <PayloadViewer
                    title="Configuration JSON"
                    payload={selectedNode.config}
                  />
                </section>

                {nodeIssues.length > 0 && (
                  <section
                    className="ff-inspector__section"
                    aria-label="Node validation issues"
                  >
                    <h3 className="ff-inspector__section-title">
                      Node Validation Issues
                    </h3>
                    {nodeIssues.map((issue) => (
                      <div
                        key={issue.id}
                        style={{
                          padding: 'var(--space-2)',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor:
                            issue.severity === 'error'
                              ? 'var(--danger-subtle)'
                              : 'var(--warning-subtle)',
                          border: `1px solid ${
                            issue.severity === 'error'
                              ? 'var(--danger)'
                              : 'var(--warning)'
                          }`,
                          fontSize: 'var(--text-secondary-size)',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{issue.message}</div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          {issue.remediation}
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                <section
                  className="ff-inspector__section"
                  aria-label="Node actions"
                >
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Copy size={13} />}
                      onClick={() => {
                        const created = duplicateNodes();
                        if (created.length > 0) {
                          addToast(
                            `Duplicated ${created.length} node(s)`,
                            'neutral',
                          );
                        }
                      }}
                    >
                      Duplicate Node
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      leftIcon={<Trash2 size={13} />}
                      onClick={() => {
                        const name = selectedNode.name;
                        removeNode(selectedNode.id);
                        addToast(`Removed node "${name}"`, 'neutral');
                      }}
                    >
                      Delete Node
                    </Button>
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {inspectorMode === 'run' && (
          <>
            {!activeRun ? (
              <EmptyState
                title="No active run selected"
                description="Execute the workflow using the Run button in the top bar to inspect live timing, status, and node payloads."
              />
            ) : (
              <section
                className="ff-inspector__section"
                aria-label="Active run summary"
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span className="ff-mono">{activeRun.runId}</span>
                  <StatusBadge status={activeRun.status} />
                </div>
                <PayloadViewer title="Run Input" payload={activeRun.input} />
                {activeRun.finalOutput !== undefined && (
                  <PayloadViewer
                    title="Final Output"
                    payload={activeRun.finalOutput}
                  />
                )}
              </section>
            )}
          </>
        )}

        {inspectorMode === 'error' && (
          <>
            {validationReport.issues.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={18} />}
                title="No validation or runtime errors"
                description="All nodes, ports, and configurations satisfy workflow rules."
              />
            ) : (
              <div className="ff-issue-list" role="list">
                {validationReport.issues.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    role="listitem"
                    className="ff-issue-list__item"
                    onClick={() => {
                      if (issue.nodeId) {
                        selectNode(issue.nodeId);
                      }
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 600,
                          color:
                            issue.severity === 'error'
                              ? 'var(--danger)'
                              : 'var(--warning)',
                        }}
                      >
                        <AlertCircle size={13} aria-hidden="true" />
                        <span>{issue.message}</span>
                      </div>
                      <span
                        style={{
                          fontSize: 'var(--text-compact)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {issue.remediation}
                      </span>
                    </div>
                    {issue.nodeId && (
                      <span
                        className="ff-mono"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {issue.nodeId}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};

const QuickConnectControl: React.FC<{
  sourceNode: { id: string; type: Parameters<typeof getNodeSpecification>[0] };
  allNodes: Array<{ id: string; name: string }>;
  onConnect: (sourceHandle: string, targetId: string) => void;
}> = ({ sourceNode, allNodes, onConnect }) => {
  const spec = getNodeSpecification(sourceNode.type);
  const [selectedHandle, setSelectedHandle] = React.useState(
    spec.outputs[0]?.id ?? 'next',
  );
  const [targetId, setTargetId] = React.useState('');

  React.useEffect(() => {
    setSelectedHandle(spec.outputs[0]?.id ?? 'next');
  }, [sourceNode.id, spec.outputs]);

  const candidateTargets = allNodes.filter((n) => n.id !== sourceNode.id);
  if (candidateTargets.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        marginTop: 'var(--space-2)',
        paddingTop: 'var(--space-2)',
        borderTop: '1px dashed var(--border-subtle)',
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-compact)',
          color: 'var(--text-muted)',
        }}
      >
        Connect output port to node
      </span>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {spec.outputs.length > 1 && (
          <select
            aria-label="Select output handle"
            className="ff-field__select"
            style={{ width: '90px', minHeight: '30px', padding: '2px 6px' }}
            value={selectedHandle}
            onChange={(e) => setSelectedHandle(e.target.value)}
          >
            {spec.outputs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Connect to target node"
          className="ff-field__select"
          style={{ flex: 1, minHeight: '30px', padding: '2px 6px' }}
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          <option value="">Select target node...</option>
          {candidateTargets.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name} ({n.id})
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          size="sm"
          disabled={!targetId}
          onClick={() => {
            if (!targetId) return;
            onConnect(selectedHandle, targetId);
          }}
        >
          Connect
        </Button>
      </div>
    </div>
  );
};
