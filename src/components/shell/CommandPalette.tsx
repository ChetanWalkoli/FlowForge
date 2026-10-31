import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  FilePlus2,
  FileUp,
  FlaskConical,
  FolderKanban,
  LayoutGrid,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Redo2,
  Save,
  Search,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import { STARTER_TEMPLATES } from '../../domain/fixtures/starter-templates';
import { NODE_REGISTRY } from '../../domain/registry/node-registry';
import type { NodeType } from '../../domain/types/workflow';
import { downloadWorkflowJson } from '../../persistence/import-export';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button } from '../ui';

export interface CommandItem {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  icon: React.ReactNode;
  disabled?: boolean;
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const open = useWorkspaceStore((s) => s.commandPaletteOpen);
  const setOpen = useWorkspaceStore((s) => s.setCommandPaletteOpen);

  const addNodeByType = useWorkspaceStore((s) => s.addNodeByType);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);
  const duplicateNodes = useWorkspaceStore((s) => s.duplicateNodes);
  const copySelection = useWorkspaceStore((s) => s.copySelection);
  const pasteClipboard = useWorkspaceStore((s) => s.pasteClipboard);
  const runStaticValidation = useWorkspaceStore((s) => s.runStaticValidation);
  const toggleLeftSidebar = useWorkspaceStore((s) => s.toggleLeftSidebar);
  const toggleRightInspector = useWorkspaceStore((s) => s.toggleRightInspector);
  const toggleBottomDrawer = useWorkspaceStore((s) => s.toggleBottomDrawer);
  const loadWorkflow = useWorkspaceStore((s) => s.loadWorkflow);
  const createBlankWorkflow = useWorkspaceStore((s) => s.createBlankWorkflow);
  const saveCurrentWorkflow = useWorkspaceStore((s) => s.saveCurrentWorkflow);
  const setImportModalOpen = useWorkspaceStore((s) => s.setImportModalOpen);
  const setRunInputModalOpen = useWorkspaceStore((s) => s.setRunInputModalOpen);
  const setGenerateWorkflowModalOpen = useWorkspaceStore(
    (s) => s.setGenerateWorkflowModalOpen,
  );
  const autoArrangeNodes = useWorkspaceStore((s) => s.autoArrangeNodes);
  const runTestSuite = useWorkspaceStore((s) => s.runTestSuite);
  const saveRevisionCheckpoint = useWorkspaceStore(
    (s) => s.saveRevisionCheckpoint,
  );
  const isExecuting = useWorkspaceStore((s) => s.isExecuting);
  const workflow = useWorkspaceStore((s) => s.workflow);
  const addToast = useWorkspaceStore((s) => s.addToast);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = useMemo(() => {
    const mvpNodeCommands: CommandItem[] = (
      [
        'trigger',
        'condition',
        'action',
        'transform',
        'end',
        'delay',
        'retry',
        'loop',
        'merge',
      ] as NodeType[]
    ).map((type) => {
      const spec = NODE_REGISTRY[type];
      return {
        id: `cmd_add_${type}`,
        label: `Add ${spec.label} node`,
        category: 'Add Node',
        icon: <Plus size={14} aria-hidden="true" />,
        action: () => {
          const node = addNodeByType(type);
          addToast(`Added ${spec.label} (${node.id})`, 'neutral');
        },
      };
    });

    const templateCommands: CommandItem[] = STARTER_TEMPLATES.map((tpl) => ({
      id: `cmd_tpl_${tpl.id}`,
      label: `Load template: ${tpl.name}`,
      category: 'Templates',
      icon: <FolderKanban size={14} aria-hidden="true" />,
      action: () => {
        loadWorkflow(tpl);
        addToast(`Loaded template "${tpl.name}"`, 'neutral');
      },
    }));

    const workspaceCommands: CommandItem[] = [
      {
        id: 'cmd_undo',
        label: 'Undo last edit',
        category: 'Edit',
        shortcut: 'Ctrl+Z',
        icon: <Undo2 size={14} aria-hidden="true" />,
        action: () => {
          undo();
        },
      },
      {
        id: 'cmd_redo',
        label: 'Redo edit',
        category: 'Edit',
        shortcut: 'Ctrl+Y',
        icon: <Redo2 size={14} aria-hidden="true" />,
        action: () => {
          redo();
        },
      },
      {
        id: 'cmd_duplicate',
        label: 'Duplicate selected node(s)',
        category: 'Edit',
        shortcut: 'Ctrl+D',
        icon: <Copy size={14} aria-hidden="true" />,
        action: () => {
          duplicateNodes();
        },
      },
      {
        id: 'cmd_copy',
        label: 'Copy selected node(s)',
        category: 'Edit',
        shortcut: 'Ctrl+C',
        icon: <Copy size={14} aria-hidden="true" />,
        action: () => {
          copySelection();
        },
      },
      {
        id: 'cmd_paste',
        label: 'Paste node(s) from clipboard',
        category: 'Edit',
        shortcut: 'Ctrl+V',
        icon: <ClipboardPaste size={14} aria-hidden="true" />,
        action: () => {
          pasteClipboard();
        },
      },
      {
        id: 'cmd_auto_arrange',
        label: 'Auto-arrange workflow graph',
        category: 'Edit',
        icon: <LayoutGrid size={14} aria-hidden="true" />,
        action: () => {
          autoArrangeNodes();
        },
      },
      {
        id: 'cmd_save',
        label: 'Save workflow to IndexedDB',
        category: 'Persistence',
        shortcut: 'Ctrl+S',
        icon: <Save size={14} aria-hidden="true" />,
        action: () => {
          void saveCurrentWorkflow();
          addToast('Workflow saved to IndexedDB.', 'neutral');
        },
      },
      {
        id: 'cmd_save_revision',
        label: 'Save immutable revision checkpoint',
        category: 'Persistence',
        icon: <BookmarkPlus size={14} aria-hidden="true" />,
        action: () => {
          saveRevisionCheckpoint();
        },
      },
      {
        id: 'cmd_import_json',
        label: 'Import workflow JSON...',
        category: 'Persistence',
        icon: <FileUp size={14} aria-hidden="true" />,
        action: () => {
          setImportModalOpen(true);
        },
      },
      {
        id: 'cmd_export_json',
        label: 'Export workflow JSON',
        category: 'Persistence',
        icon: <Download size={14} aria-hidden="true" />,
        action: () => {
          downloadWorkflowJson(workflow);
          addToast(`Exported "${workflow.name}" as JSON.`, 'neutral');
        },
      },
      {
        id: 'cmd_draft_workflow',
        label: 'Draft workflow with plain English...',
        category: 'Workflow',
        icon: <Sparkles size={14} aria-hidden="true" />,
        action: () => {
          setGenerateWorkflowModalOpen(true);
        },
      },
      {
        id: 'cmd_run_workflow',
        label: isExecuting
          ? 'Run workflow (Currently running...)'
          : 'Run workflow...',
        category: 'Workflow',
        shortcut: 'Ctrl+Enter',
        icon: <Play size={14} aria-hidden="true" />,
        disabled: isExecuting,
        action: () => {
          if (isExecuting) {
            addToast('Workflow is already running.', 'warning');
            return;
          }
          const report = runStaticValidation();
          if (!report.canExecute) {
            addToast(
              `Cannot execute: resolve ${report.errorsCount} validation error(s) first.`,
              'error',
            );
            return;
          }
          setRunInputModalOpen(true);
        },
      },
      {
        id: 'cmd_run_test_suite',
        label: 'Run Testing Lab suite & branch coverage',
        category: 'Workflow',
        icon: <FlaskConical size={14} aria-hidden="true" />,
        action: () => {
          void runTestSuite();
        },
      },
      {
        id: 'cmd_validate',
        label: 'Validate workflow',
        category: 'Workflow',
        shortcut: 'Shift+V',
        icon: <CheckCircle2 size={14} aria-hidden="true" />,
        action: () => {
          runStaticValidation();
        },
      },
      {
        id: 'cmd_new_blank',
        label: 'Create blank workflow',
        category: 'Workflow',
        icon: <FilePlus2 size={14} aria-hidden="true" />,
        action: () => {
          createBlankWorkflow();
          addToast('Created blank workflow.', 'neutral');
        },
      },
      {
        id: 'cmd_toggle_sidebar',
        label: 'Toggle left sidebar',
        category: 'View',
        shortcut: 'Ctrl+B',
        icon: <PanelLeft size={14} aria-hidden="true" />,
        action: () => {
          toggleLeftSidebar();
        },
      },
      {
        id: 'cmd_toggle_inspector',
        label: 'Toggle right inspector',
        category: 'View',
        shortcut: 'Ctrl+I',
        icon: <PanelRight size={14} aria-hidden="true" />,
        action: () => {
          toggleRightInspector();
        },
      },
      {
        id: 'cmd_toggle_drawer',
        label: 'Toggle bottom drawer',
        category: 'View',
        shortcut: 'Ctrl+J',
        icon: <PanelBottom size={14} aria-hidden="true" />,
        action: () => {
          toggleBottomDrawer();
        },
      },
    ];

    return [...mvpNodeCommands, ...workspaceCommands, ...templateCommands];
  }, [
    addNodeByType,
    addToast,
    autoArrangeNodes,
    copySelection,
    createBlankWorkflow,
    duplicateNodes,
    isExecuting,
    loadWorkflow,
    pasteClipboard,
    redo,
    runStaticValidation,
    runTestSuite,
    saveCurrentWorkflow,
    saveRevisionCheckpoint,
    setGenerateWorkflowModalOpen,
    setImportModalOpen,
    setRunInputModalOpen,
    toggleBottomDrawer,
    toggleLeftSidebar,
    toggleRightInspector,
    undo,
    workflow,
  ]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const executeCommand = (cmd: CommandItem) => {
    cmd.action();
    setOpen(false);
  };

  return (
    <div
      className="ff-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setOpen(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="ff-command-palette"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (filteredCommands.length > 0) {
              setActiveIndex((prev) => (prev + 1) % filteredCommands.length);
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (filteredCommands.length > 0) {
              setActiveIndex(
                (prev) =>
                  (prev - 1 + filteredCommands.length) %
                  filteredCommands.length,
              );
            }
          } else if (e.key === 'Enter' && filteredCommands[activeIndex]) {
            e.preventDefault();
            executeCommand(filteredCommands[activeIndex]);
          }
        }}
      >
        <div className="ff-command-palette__search-row">
          <Search
            size={16}
            aria-hidden="true"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            ref={inputRef}
            type="text"
            aria-label="Search commands"
            placeholder="Type a command or search nodes..."
            className="ff-command-palette__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label="Close command palette"
            title="Close (Esc)"
            onClick={() => setOpen(false)}
          >
            <X size={15} />
          </Button>
        </div>

        <div
          className="ff-command-palette__list"
          role="listbox"
          aria-label="Available commands"
        >
          {filteredCommands.length === 0 ? (
            <div
              style={{
                padding: 'var(--space-4)',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-secondary-size)',
              }}
            >
              No matching commands found for "{query}".
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                aria-disabled={Boolean(cmd.disabled)}
                disabled={Boolean(cmd.disabled)}
                className={`ff-command-palette__item ${
                  idx === activeIndex ? 'ff-command-palette__item--active' : ''
                }`.trim()}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => executeCommand(cmd)}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {cmd.icon}
                  </span>
                  <span>{cmd.label}</span>
                  <span
                    style={{
                      fontSize: 'var(--text-compact)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    · {cmd.category}
                  </span>
                </div>
                {cmd.shortcut && (
                  <span className="ff-command-palette__shortcut">
                    {cmd.shortcut}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

