import React, { useEffect } from 'react';
import { useWorkspaceStore } from '../../store/workspace-store';
import { WorkflowCanvas } from '../canvas/WorkflowCanvas';
import { ContextualInspector } from '../panels/ContextualInspector';
import { Button, ToastRegion } from '../ui';
import { BottomDrawer } from './BottomDrawer';
import { CommandPalette } from './CommandPalette';
import { ImportWorkflowModal } from './ImportWorkflowModal';
import { NavigationSidebar } from './NavigationSidebar';
import { OnboardingBanner } from './OnboardingBanner';
import { TopBar } from './TopBar';

export const AppShell: React.FC = () => {
  const workflow = useWorkspaceStore((s) => s.workflow);
  const saveStatus = useWorkspaceStore((s) => s.saveStatus);
  const isHydrated = useWorkspaceStore((s) => s.isHydrated);
  const mobileActiveTab = useWorkspaceStore((s) => s.mobileActiveTab);
  const toasts = useWorkspaceStore((s) => s.toasts);

  const hydrateFromStorage = useWorkspaceStore((s) => s.hydrateFromStorage);
  const saveCurrentWorkflow = useWorkspaceStore((s) => s.saveCurrentWorkflow);
  const toggleCommandPalette = useWorkspaceStore((s) => s.toggleCommandPalette);
  const toggleLeftSidebar = useWorkspaceStore((s) => s.toggleLeftSidebar);
  const toggleRightInspector = useWorkspaceStore((s) => s.toggleRightInspector);
  const toggleBottomDrawer = useWorkspaceStore((s) => s.toggleBottomDrawer);
  const setMobileActiveTab = useWorkspaceStore((s) => s.setMobileActiveTab);
  const dismissToast = useWorkspaceStore((s) => s.dismissToast);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);
  const duplicateNodes = useWorkspaceStore((s) => s.duplicateNodes);
  const copySelection = useWorkspaceStore((s) => s.copySelection);
  const pasteClipboard = useWorkspaceStore((s) => s.pasteClipboard);
  const removeSelectedElements = useWorkspaceStore(
    (s) => s.removeSelectedElements,
  );
  const addToast = useWorkspaceStore((s) => s.addToast);

  // Hydrate saved workflows, custom templates, and onboarding state from IndexedDB on initial mount
  useEffect(() => {
    if (!isHydrated) {
      void hydrateFromStorage();
    }
  }, [hydrateFromStorage, isHydrated]);

  // Debounced autosave when workflow changes and isHydrated is true (PRD.md Phase 2 Task 7 / FR-052)
  useEffect(() => {
    if (!isHydrated || saveStatus !== 'unsaved') return;
    const timer = window.setTimeout(() => {
      void saveCurrentWorkflow();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [isHydrated, saveCurrentWorkflow, saveStatus, workflow]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveCurrentWorkflow().then((ok) => {
          if (ok) {
            addToast('Workflow saved to IndexedDB.', 'neutral');
          }
        });
        return;
      }

      if (isTextInput) {
        return;
      }

      const key = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') {
        e.preventDefault();
        if (undo()) {
          addToast('Undid last change.', 'neutral');
        }
      } else if (
        ((e.ctrlKey || e.metaKey) && key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'z')
      ) {
        e.preventDefault();
        if (redo()) {
          addToast('Redid change.', 'neutral');
        }
      } else if ((e.ctrlKey || e.metaKey) && key === 'd') {
        e.preventDefault();
        const duped = duplicateNodes();
        if (duped.length > 0) {
          addToast(`Duplicated ${duped.length} node(s).`, 'neutral');
        }
      } else if ((e.ctrlKey || e.metaKey) && key === 'c') {
        e.preventDefault();
        const count = copySelection();
        if (count > 0) {
          addToast(`Copied ${count} node(s).`, 'neutral');
        }
      } else if ((e.ctrlKey || e.metaKey) && key === 'v') {
        e.preventDefault();
        const pasted = pasteClipboard();
        if (pasted.length > 0) {
          addToast(`Pasted ${pasted.length} node(s).`, 'neutral');
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSelectedElements();
      } else if ((e.ctrlKey || e.metaKey) && key === 'b') {
        e.preventDefault();
        toggleLeftSidebar();
      } else if ((e.ctrlKey || e.metaKey) && key === 'i') {
        e.preventDefault();
        toggleRightInspector();
      } else if ((e.ctrlKey || e.metaKey) && key === 'j') {
        e.preventDefault();
        toggleBottomDrawer();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    addToast,
    copySelection,
    duplicateNodes,
    pasteClipboard,
    redo,
    removeSelectedElements,
    saveCurrentWorkflow,
    toggleBottomDrawer,
    toggleCommandPalette,
    toggleLeftSidebar,
    toggleRightInspector,
    undo,
  ]);

  return (
    <div className="ff-app-shell">
      <TopBar />
      <OnboardingBanner />

      <div className="ff-workspace-body" data-mobile-tab={mobileActiveTab}>
        <NavigationSidebar />

        <div className="ff-center-column">
          <WorkflowCanvas />
          <BottomDrawer />
        </div>

        <ContextualInspector />
      </div>

      <nav className="ff-mobile-nav" aria-label="Mobile workspace view switcher">
        <Button
          variant={mobileActiveTab === 'canvas' ? 'secondary' : 'tertiary'}
          size="sm"
          onClick={() => setMobileActiveTab('canvas')}
        >
          Canvas
        </Button>
        <Button
          variant={mobileActiveTab === 'inspector' ? 'secondary' : 'tertiary'}
          size="sm"
          onClick={() => setMobileActiveTab('inspector')}
        >
          Inspector
        </Button>
        <Button
          variant={mobileActiveTab === 'trace' ? 'secondary' : 'tertiary'}
          size="sm"
          onClick={() => setMobileActiveTab('trace')}
        >
          Trace & Logs
        </Button>
      </nav>

      <CommandPalette />
      <ImportWorkflowModal />
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
