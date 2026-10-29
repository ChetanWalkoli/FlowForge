import React from 'react';
import { Plus, Search } from 'lucide-react';
import { NODE_REGISTRY } from '../../domain/registry/node-registry';
import type { NodeCategory, NodeType } from '../../domain/types/workflow';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button, EmptyState, Input } from '../ui';
import { NodeCategoryIcon } from '../ui/NodeCategoryIcon';

const CATEGORY_ORDER: Array<{ id: NodeCategory; label: string }> = [
  { id: 'triggers', label: 'Triggers' },
  { id: 'logic', label: 'Logic' },
  { id: 'data', label: 'Data' },
  { id: 'actions', label: 'Actions' },
  { id: 'flow', label: 'Flow Control' },
];

export const NodeLibrary: React.FC = () => {
  const searchQuery = useWorkspaceStore((s) => s.nodeSearchQuery);
  const setSearchQuery = useWorkspaceStore((s) => s.setNodeSearchQuery);
  const addNodeByType = useWorkspaceStore((s) => s.addNodeByType);
  const addToast = useWorkspaceStore((s) => s.addToast);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const allSpecs = Object.values(NODE_REGISTRY).filter((spec) => {
    if (!normalizedQuery) return true;
    return (
      spec.label.toLowerCase().includes(normalizedQuery) ||
      spec.subtitle.toLowerCase().includes(normalizedQuery) ||
      spec.type.toLowerCase().includes(normalizedQuery) ||
      spec.category.toLowerCase().includes(normalizedQuery)
    );
  });

  const handleAddNode = (type: NodeType, label: string) => {
    const created = addNodeByType(type);
    addToast(`Added ${label} node (${created.id})`, 'neutral');
  };

  return (
    <div className="ff-node-library" aria-label="Node library">
      <Input
        label="Search nodes"
        placeholder="Filter by name or category..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {allSpecs.length === 0 ? (
        <EmptyState
          icon={<Search size={18} />}
          title="No matching nodes"
          description={`No node types match "${searchQuery}".`}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSearchQuery('')}
            >
              Clear filter
            </Button>
          }
        />
      ) : (
        CATEGORY_ORDER.map((cat) => {
          const items = allSpecs.filter((spec) => spec.category === cat.id);
          if (items.length === 0) return null;

          return (
            <section
              key={cat.id}
              className="ff-node-library__category"
              aria-label={cat.label}
            >
              <h3 className="ff-node-library__category-title">{cat.label}</h3>
              <div className="ff-node-library__list">
                {items.map((spec) => (
                  <button
                    key={spec.type}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/flowforge-node-type',
                        spec.type,
                      );
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    className="ff-node-library__item"
                    aria-label={`Add ${spec.label} node`}
                    title={`Click or drag to add ${spec.label}`}
                    onClick={() => handleAddNode(spec.type, spec.label)}
                  >
                    <div className="ff-node-library__item-info">
                      <NodeCategoryIcon
                        type={spec.type}
                        size={15}
                        className="ff-node-library__item-icon"
                      />
                      <div>
                        <span className="ff-node-library__item-title">
                          {spec.label}
                        </span>
                        <span className="ff-node-library__item-subtitle">
                          {spec.subtitle}
                        </span>
                      </div>
                    </div>
                    <Plus
                      size={14}
                      aria-hidden="true"
                      style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                    />
                  </button>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
};

