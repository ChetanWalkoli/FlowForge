import React from 'react';
import {
  Blocks,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  ListTree,
} from 'lucide-react';
import { STARTER_TEMPLATES } from '../../domain/fixtures/starter-templates';
import { useWorkspaceStore } from '../../store/workspace-store';
import { NodeLibrary } from '../panels/NodeLibrary';
import { Button, EmptyState } from '../ui';
import { NodeCategoryIcon } from '../ui/NodeCategoryIcon';

export const NavigationSidebar: React.FC = () => {
  const collapsed = useWorkspaceStore((s) => s.leftSidebarCollapsed);
  const activeTab = useWorkspaceStore((s) => s.leftSidebarTab);
  const workflow = useWorkspaceStore((s) => s.workflow);
  const selectedNodeId = useWorkspaceStore((s) => s.selectedNodeId);

  const toggleLeftSidebar = useWorkspaceStore((s) => s.toggleLeftSidebar);
  const setLeftSidebarTab = useWorkspaceStore((s) => s.setLeftSidebarTab);
  const loadWorkflow = useWorkspaceStore((s) => s.loadWorkflow);
  const selectNode = useWorkspaceStore((s) => s.selectNode);
  const addToast = useWorkspaceStore((s) => s.addToast);

  if (collapsed) {
    return (
      <aside
        className="ff-sidebar ff-sidebar--collapsed"
        aria-label="Workspace navigation sidebar (collapsed)"
      >
        <div className="ff-sidebar__rail">
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label="Expand sidebar"
            title="Expand sidebar"
            onClick={toggleLeftSidebar}
          >
            <ChevronRight size={16} />
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label="Open Node Library"
            title="Node Library"
            onClick={() => setLeftSidebarTab('nodes')}
          >
            <Blocks size={16} />
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label="Open Starter Templates"
            title="Starter Templates"
            onClick={() => setLeftSidebarTab('templates')}
          >
            <FolderKanban size={16} />
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label="Open Graph Outline"
            title="Graph Outline"
            onClick={() => setLeftSidebarTab('outline')}
          >
            <ListTree size={16} />
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="ff-sidebar" aria-label="Workspace navigation sidebar">
      <div className="ff-sidebar__header">
        <div className="ff-sidebar__tabs" role="tablist" aria-label="Sidebar sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'nodes'}
            className={`ff-sidebar__tab ${
              activeTab === 'nodes' ? 'ff-sidebar__tab--active' : ''
            }`.trim()}
            onClick={() => setLeftSidebarTab('nodes')}
          >
            <Blocks size={13} aria-hidden="true" />
            <span>Nodes</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'templates'}
            className={`ff-sidebar__tab ${
              activeTab === 'templates' ? 'ff-sidebar__tab--active' : ''
            }`.trim()}
            onClick={() => setLeftSidebarTab('templates')}
          >
            <FolderKanban size={13} aria-hidden="true" />
            <span>Templates</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'outline'}
            className={`ff-sidebar__tab ${
              activeTab === 'outline' ? 'ff-sidebar__tab--active' : ''
            }`.trim()}
            onClick={() => setLeftSidebarTab('outline')}
          >
            <ListTree size={13} aria-hidden="true" />
            <span>Outline</span>
          </button>
        </div>
        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          onClick={toggleLeftSidebar}
        >
          <ChevronLeft size={16} />
        </Button>
      </div>

      <div className="ff-sidebar__content">
        {activeTab === 'nodes' && <NodeLibrary />}

        {activeTab === 'templates' && (
          <div
            className="ff-node-library__list"
            role="region"
            aria-label="Starter workflow templates"
          >
            {STARTER_TEMPLATES.map((tpl) => {
              const isCurrent = tpl.id === workflow.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  className="ff-node-library__item"
                  style={{
                    cursor: 'pointer',
                    borderColor: isCurrent
                      ? 'var(--accent)'
                      : 'var(--border-subtle)',
                  }}
                  aria-label={`Load template: ${tpl.name}`}
                  onClick={() => {
                    loadWorkflow(tpl);
                    addToast(`Loaded template "${tpl.name}"`, 'neutral');
                  }}
                >
                  <div className="ff-node-library__item-info">
                    <FolderKanban
                      size={15}
                      className="ff-node-library__item-icon"
                      aria-hidden="true"
                    />
                    <div>
                      <span className="ff-node-library__item-title">
                        {tpl.name}
                      </span>
                      <span className="ff-node-library__item-subtitle">
                        {tpl.description}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === 'outline' && (
          <div role="region" aria-label="Workflow graph outline">
            {workflow.nodes.length === 0 ? (
              <EmptyState
                title="Empty workflow"
                description="Add a node from the Nodes tab to populate the outline."
              />
            ) : (
              <div className="ff-node-library__list">
                {workflow.nodes.map((node) => {
                  const isSelected = node.id === selectedNodeId;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className="ff-node-library__item"
                      style={{
                        cursor: 'pointer',
                        borderColor: isSelected
                          ? 'var(--accent)'
                          : 'var(--border-subtle)',
                      }}
                      aria-label={`Select node ${node.name}`}
                      onClick={() => selectNode(node.id)}
                    >
                      <div className="ff-node-library__item-info">
                        <NodeCategoryIcon
                          type={node.type}
                          size={14}
                          className="ff-node-library__item-icon"
                        />
                        <div>
                          <span className="ff-node-library__item-title">
                            {node.name}
                          </span>
                          <span className="ff-node-library__item-subtitle ff-mono">
                            {node.id} · {node.type}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

