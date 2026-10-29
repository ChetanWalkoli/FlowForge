import React from 'react';
import {
  Blocks,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Database,
  FolderKanban,
  ListTree,
  Trash2,
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
  const savedWorkflows = useWorkspaceStore((s) => s.savedWorkflows);
  const customTemplates = useWorkspaceStore((s) => s.customTemplates);

  const toggleLeftSidebar = useWorkspaceStore((s) => s.toggleLeftSidebar);
  const setLeftSidebarTab = useWorkspaceStore((s) => s.setLeftSidebarTab);
  const loadWorkflow = useWorkspaceStore((s) => s.loadWorkflow);
  const selectNode = useWorkspaceStore((s) => s.selectNode);
  const saveAsCustomTemplate = useWorkspaceStore((s) => s.saveAsCustomTemplate);
  const deleteCustomTemplate = useWorkspaceStore((s) => s.deleteCustomTemplate);
  const deleteSavedWorkflow = useWorkspaceStore((s) => s.deleteSavedWorkflow);
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
            aria-label="Open Saved Workflows"
            title="Saved Workflows"
            onClick={() => setLeftSidebarTab('workflows')}
          >
            <Database size={16} />
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
        <div
          className="ff-sidebar__tabs"
          role="tablist"
          aria-label="Sidebar sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'nodes'}
            className={`ff-sidebar__tab ${
              activeTab === 'nodes' ? 'ff-sidebar__tab--active' : ''
            }`.trim()}
            onClick={() => setLeftSidebarTab('nodes')}
          >
            <Blocks size={12} aria-hidden="true" />
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
            <FolderKanban size={12} aria-hidden="true" />
            <span>Templates</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'workflows'}
            className={`ff-sidebar__tab ${
              activeTab === 'workflows' ? 'ff-sidebar__tab--active' : ''
            }`.trim()}
            onClick={() => setLeftSidebarTab('workflows')}
          >
            <Database size={12} aria-hidden="true" />
            <span>Saved</span>
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
            <ListTree size={12} aria-hidden="true" />
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
            className="ff-node-library"
            role="region"
            aria-label="Starter workflow templates"
          >
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<BookmarkPlus size={13} />}
              onClick={async () => {
                const saved = await saveAsCustomTemplate();
                if (saved) {
                  addToast(
                    `Saved "${saved.name}" to custom templates.`,
                    'neutral',
                  );
                }
              }}
            >
              Save Current as Template
            </Button>

            {customTemplates.length > 0 && (
              <div className="ff-node-library__category">
                <h3 className="ff-node-library__category-title">
                  Custom Templates
                </h3>
                <div className="ff-node-library__list">
                  {customTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="ff-node-library__item"
                      style={{ cursor: 'default' }}
                    >
                      <button
                        type="button"
                        aria-label={`Load custom template: ${tpl.name}`}
                        style={{
                          flex: 1,
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          color: 'inherit',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          loadWorkflow(tpl);
                          addToast(
                            `Loaded custom template "${tpl.name}"`,
                            'neutral',
                          );
                        }}
                      >
                        <span className="ff-node-library__item-title">
                          {tpl.name}
                        </span>
                        <span className="ff-node-library__item-subtitle">
                          {tpl.nodes.length} nodes · {tpl.edges.length} edges
                        </span>
                      </button>
                      <Button
                        variant="tertiary"
                        size="sm"
                        iconOnly
                        aria-label={`Delete custom template ${tpl.name}`}
                        title="Delete custom template"
                        onClick={() => {
                          void deleteCustomTemplate(tpl.id);
                          addToast(
                            `Deleted custom template "${tpl.name}"`,
                            'neutral',
                          );
                        }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="ff-node-library__category">
              <h3 className="ff-node-library__category-title">
                Starter Templates
              </h3>
              <div className="ff-node-library__list">
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
            </div>
          </div>
        )}

        {activeTab === 'workflows' && (
          <div
            className="ff-node-library"
            role="region"
            aria-label="Saved local workflows"
          >
            {savedWorkflows.length === 0 ? (
              <EmptyState
                title="No saved workflows"
                description="Save your current workflow to persist it in local IndexedDB storage."
              />
            ) : (
              <div className="ff-node-library__list">
                {savedWorkflows.map((item) => {
                  const isCurrent = item.id === workflow.id;
                  return (
                    <div
                      key={item.id}
                      className="ff-node-library__item"
                      style={{
                        cursor: 'default',
                        borderColor: isCurrent
                          ? 'var(--accent)'
                          : 'var(--border-subtle)',
                      }}
                    >
                      <button
                        type="button"
                        aria-label={`Open saved workflow: ${item.name}`}
                        style={{
                          flex: 1,
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          color: 'inherit',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          loadWorkflow(item);
                          addToast(`Opened workflow "${item.name}"`, 'neutral');
                        }}
                      >
                        <span className="ff-node-library__item-title">
                          {item.name}
                        </span>
                        <span className="ff-node-library__item-subtitle ff-mono">
                          rev {item.revision} · {item.nodes.length} nodes
                        </span>
                      </button>
                      <Button
                        variant="tertiary"
                        size="sm"
                        iconOnly
                        aria-label={`Delete saved workflow ${item.name}`}
                        title="Delete workflow"
                        onClick={() => {
                          void deleteSavedWorkflow(item.id);
                          addToast(`Deleted workflow "${item.name}"`, 'neutral');
                        }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
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
