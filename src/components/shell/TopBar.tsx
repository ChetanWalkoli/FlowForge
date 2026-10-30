import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  CheckCircle2,
  Command,
  Download,
  FilePlus2,
  FileUp,
  MoreHorizontal,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Pencil,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Square,
  Undo2,
} from 'lucide-react';
import { EXPENSE_APPROVAL_WORKFLOW } from '../../domain/fixtures/expense-approval';
import { downloadWorkflowJson } from '../../persistence/import-export';
import { useWorkspaceStore } from '../../store/workspace-store';
import { Button, ConfirmDialog, StatusBadge } from '../ui';

export const TopBar: React.FC = () => {
  const workflow = useWorkspaceStore((s) => s.workflow);
  const saveStatus = useWorkspaceStore((s) => s.saveStatus);
  const validationReport = useWorkspaceStore((s) => s.validationReport);
  const undoStackCount = useWorkspaceStore((s) => s.undoStack.length);
  const redoStackCount = useWorkspaceStore((s) => s.redoStack.length);
  const leftSidebarCollapsed = useWorkspaceStore((s) => s.leftSidebarCollapsed);
  const rightInspectorCollapsed = useWorkspaceStore(
    (s) => s.rightInspectorCollapsed,
  );
  const bottomDrawerOpen = useWorkspaceStore((s) => s.bottomDrawerOpen);
  const isExecuting = useWorkspaceStore((s) => s.isExecuting);

  const renameWorkflow = useWorkspaceStore((s) => s.renameWorkflow);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);
  const toggleLeftSidebar = useWorkspaceStore((s) => s.toggleLeftSidebar);
  const toggleRightInspector = useWorkspaceStore((s) => s.toggleRightInspector);
  const toggleBottomDrawer = useWorkspaceStore((s) => s.toggleBottomDrawer);
  const setCommandPaletteOpen = useWorkspaceStore(
    (s) => s.setCommandPaletteOpen,
  );
  const runStaticValidation = useWorkspaceStore((s) => s.runStaticValidation);
  const createBlankWorkflow = useWorkspaceStore((s) => s.createBlankWorkflow);
  const loadWorkflow = useWorkspaceStore((s) => s.loadWorkflow);
  const saveCurrentWorkflow = useWorkspaceStore((s) => s.saveCurrentWorkflow);
  const saveAsCustomTemplate = useWorkspaceStore((s) => s.saveAsCustomTemplate);
  const setImportModalOpen = useWorkspaceStore((s) => s.setImportModalOpen);
  const setRunInputModalOpen = useWorkspaceStore((s) => s.setRunInputModalOpen);
  const cancelActiveRun = useWorkspaceStore((s) => s.cancelActiveRun);
  const addToast = useWorkspaceStore((s) => s.addToast);

  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(workflow.name);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [confirmBlankOpen, setConfirmBlankOpen] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftName(workflow.name);
  }, [workflow.name]);

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (!overflowOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [overflowOpen]);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== workflow.name) {
      renameWorkflow(trimmed);
      addToast(`Renamed workflow to "${trimmed}"`, 'neutral');
    } else {
      setDraftName(workflow.name);
    }
    setIsEditingName(false);
  };

  const handleValidateClick = () => {
    const report = runStaticValidation();
    if (report.errorsCount === 0 && report.warningsCount === 0) {
      addToast('Validation passed: 0 issues detected.', 'neutral');
    } else if (report.errorsCount > 0) {
      addToast(
        `Validation found ${report.errorsCount} blocking error(s).`,
        'error',
      );
    } else {
      addToast(
        `Validation passed with ${report.warningsCount} warning(s).`,
        'warning',
      );
    }
  };

  const handleRunClick = () => {
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
  };

  const handleSaveClick = async () => {
    const ok = await saveCurrentWorkflow();
    if (ok) {
      addToast('Workflow saved to IndexedDB.', 'neutral');
    } else {
      addToast('Failed to save workflow to IndexedDB.', 'error');
    }
  };

  const handleExportClick = () => {
    downloadWorkflowJson(workflow);
    addToast(`Exported "${workflow.name}" as JSON.`, 'neutral');
  };

  return (
    <header className="ff-topbar" aria-label="Workspace top bar">
      <div className="ff-topbar__left">
        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          aria-label={
            leftSidebarCollapsed
              ? 'Expand left sidebar'
              : 'Collapse left sidebar'
          }
          title={
            leftSidebarCollapsed
              ? 'Expand left sidebar'
              : 'Collapse left sidebar'
          }
          onClick={toggleLeftSidebar}
        >
          <PanelLeft size={16} />
        </Button>

        <div className="ff-topbar__brand">
          <span className="ff-topbar__brand-mark" aria-hidden="true" />
          <span>FlowForge</span>
        </div>

        <span className="ff-topbar__divider" aria-hidden="true">
          /
        </span>

        {isEditingName ? (
          <input
            ref={nameInputRef}
            type="text"
            aria-label="Workflow name"
            className="ff-topbar__title-input"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitRename();
              } else if (e.key === 'Escape') {
                setDraftName(workflow.name);
                setIsEditingName(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="ff-topbar__title-btn"
            aria-label={`Rename workflow: ${workflow.name}`}
            title="Click to rename workflow"
            onClick={() => setIsEditingName(true)}
          >
            <span>{workflow.name}</span>
            <Pencil size={12} aria-hidden="true" />
          </button>
        )}

        <span className="ff-topbar__revision" title="Workflow revision">
          rev {workflow.revision}
        </span>

        <StatusBadge status={saveStatus} />
      </div>

      <div className="ff-topbar__center">
        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          disabled={undoStackCount === 0}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          onClick={() => undo()}
        >
          <Undo2 size={15} />
        </Button>

        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          disabled={redoStackCount === 0}
          aria-label="Redo"
          title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
          onClick={() => redo()}
        >
          <Redo2 size={15} />
        </Button>

        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Command size={13} />}
          aria-label="Open command palette"
          title="Open command palette (Ctrl+K)"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <span>Command Palette</span>
          <span className="ff-mono" style={{ color: 'var(--text-muted)' }}>
            Ctrl+K
          </span>
        </Button>
      </div>

      <div className="ff-topbar__right">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Save size={14} />}
          aria-label="Save workflow"
          title="Save workflow (Ctrl+S)"
          onClick={() => {
            void handleSaveClick();
          }}
        >
          Save
        </Button>

        <Button
          variant="secondary"
          size="sm"
          leftIcon={<CheckCircle2 size={14} />}
          onClick={handleValidateClick}
        >
          Validate
          {validationReport.errorsCount > 0 && (
            <span
              className="ff-tabular"
              style={{ color: 'var(--danger)', fontWeight: 600 }}
            >
              ({validationReport.errorsCount})
            </span>
          )}
        </Button>

        {isExecuting && (
          <Button
            variant="destructive"
            size="sm"
            leftIcon={<Square size={13} />}
            aria-label="Cancel active run"
            onClick={cancelActiveRun}
          >
            Cancel Run
          </Button>
        )}

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Play size={14} />}
          disabled={isExecuting}
          onClick={handleRunClick}
        >
          Run
        </Button>

        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          aria-label={
            bottomDrawerOpen ? 'Collapse bottom drawer' : 'Expand bottom drawer'
          }
          title={
            bottomDrawerOpen ? 'Collapse bottom drawer' : 'Expand bottom drawer'
          }
          onClick={toggleBottomDrawer}
        >
          <PanelBottom size={16} />
        </Button>

        <Button
          variant="tertiary"
          size="sm"
          iconOnly
          aria-label={
            rightInspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'
          }
          title={
            rightInspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'
          }
          onClick={toggleRightInspector}
        >
          <PanelRight size={16} />
        </Button>

        <div className="ff-topbar__menu-wrapper" ref={menuRef}>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label="More workflow actions"
            title="More workflow actions"
            aria-expanded={overflowOpen}
            onClick={() => setOverflowOpen((prev) => !prev)}
          >
            <MoreHorizontal size={16} />
          </Button>

          {overflowOpen && (
            <div
              className="ff-topbar__dropdown"
              role="menu"
              aria-label="Secondary workflow actions"
            >
              <button
                type="button"
                role="menuitem"
                className="ff-topbar__dropdown-item"
                onClick={() => {
                  setOverflowOpen(false);
                  void handleSaveClick();
                }}
              >
                <span>Save workflow</span>
                <span className="ff-mono">Ctrl+S</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="ff-topbar__dropdown-item"
                onClick={() => {
                  setOverflowOpen(false);
                  setImportModalOpen(true);
                }}
              >
                <span>Import JSON...</span>
                <FileUp size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                role="menuitem"
                className="ff-topbar__dropdown-item"
                onClick={() => {
                  setOverflowOpen(false);
                  handleExportClick();
                }}
              >
                <span>Export JSON</span>
                <Download size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                role="menuitem"
                className="ff-topbar__dropdown-item"
                onClick={async () => {
                  setOverflowOpen(false);
                  const saved = await saveAsCustomTemplate();
                  if (saved) {
                    addToast(
                      `Saved "${saved.name}" to custom templates.`,
                      'neutral',
                    );
                  }
                }}
              >
                <span>Save as Template</span>
                <BookmarkPlus size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                role="menuitem"
                className="ff-topbar__dropdown-item"
                onClick={() => {
                  loadWorkflow(EXPENSE_APPROVAL_WORKFLOW);
                  setOverflowOpen(false);
                  addToast('Loaded Expense approval fixture.', 'neutral');
                }}
              >
                <span>Reset to Expense Approval</span>
                <RotateCcw size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                role="menuitem"
                className="ff-topbar__dropdown-item ff-topbar__dropdown-item--danger"
                onClick={() => {
                  setOverflowOpen(false);
                  setConfirmBlankOpen(true);
                }}
              >
                <span>New blank workflow</span>
                <FilePlus2 size={13} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmBlankOpen}
        title="Create blank workflow?"
        description="This will replace the current canvas with a clean, empty workflow."
        confirmLabel="Create Blank"
        destructive
        onConfirm={() => {
          createBlankWorkflow();
          setConfirmBlankOpen(false);
          addToast('Created blank workflow.', 'neutral');
        }}
        onCancel={() => setConfirmBlankOpen(false)}
      />
    </header>
  );
};
