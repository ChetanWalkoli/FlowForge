/**
 * FlowForge — Workspace & Editor Zustand Store
 * Manages the active workflow document, bounded undo/redo history, multi-selection,
 * clipboard copy/paste, port-validated connections, IndexedDB persistence, custom templates,
 * onboarding hints, UI layout state, and toast notifications.
 */

import { create } from 'zustand';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import { getNodeSpecification } from '../domain/registry/node-registry';
import type {
  NodeConfigMap,
  NodeType,
  SaveStatus,
  ValidationReport,
  WorkflowDocument,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRunRecord,
} from '../domain/types/workflow';
import {
  ConnectionValidationResult,
  validateConnection,
  validateWorkflow,
} from '../domain/validation/graph-validator';
import { defaultPersistenceAdapter } from '../persistence/indexeddb/indexeddb-adapter';
import { serializeWorkflowForExport } from '../persistence/import-export';
import type { ToastMessage } from '../components/ui/ToastRegion';

export type SidebarTab = 'nodes' | 'templates' | 'outline' | 'workflows';
export type InspectorMode = 'overview' | 'node' | 'run' | 'error';
export type BottomDrawerTab = 'validation' | 'output' | 'timeline' | 'tests';
export type MobileWorkspaceTab = 'canvas' | 'inspector' | 'trace';

export const MAX_UNDO_HISTORY = 50;

export interface ClipboardSlice {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkspaceState {
  // Active workflow & validation
  workflow: WorkflowDocument;
  validationReport: ValidationReport;
  saveStatus: SaveStatus;
  storageError: string | null;

  // Persisted libraries (FR-052, FR-053, FR-062)
  savedWorkflows: WorkflowDocument[];
  customTemplates: WorkflowDocument[];
  isHydrated: boolean;

  // Onboarding & modals (FR-055, FR-061)
  onboardingDismissed: boolean;
  importModalOpen: boolean;

  // Bounded Undo / Redo stacks (FR-007)
  undoStack: WorkflowDocument[];
  redoStack: WorkflowDocument[];

  // Selection & clipboard state (FR-004, FR-006)
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  clipboard: ClipboardSlice | null;

  // Run & debugger context
  activeRun: WorkflowRunRecord | null;
  selectedTraceEventIndex: number | null;

  // Layout & panel visibility (DESIGN.md §3 & §8)
  leftSidebarCollapsed: boolean;
  leftSidebarTab: SidebarTab;
  nodeSearchQuery: string;

  rightInspectorCollapsed: boolean;
  inspectorMode: InspectorMode;

  bottomDrawerOpen: boolean;
  bottomDrawerTab: BottomDrawerTab;

  commandPaletteOpen: boolean;
  mobileActiveTab: MobileWorkspaceTab;

  // Notifications
  toasts: ToastMessage[];

  // Actions — Workflow & Nodes
  loadWorkflow: (doc: WorkflowDocument) => void;
  createBlankWorkflow: () => void;
  renameWorkflow: (newName: string) => void;
  updateWorkflowDescription: (description: string) => void;
  addNodeByType: (
    type: NodeType,
    position?: { x: number; y: number },
  ) => WorkflowNode;
  updateNodeName: (nodeId: string, name: string) => void;
  updateNodeConfig: <T extends NodeType>(
    nodeId: string,
    config: NodeConfigMap[T],
  ) => void;
  updateNodePosition: (
    nodeId: string,
    position: { x: number; y: number },
    recordHistory?: boolean,
  ) => void;
  removeNode: (nodeId: string) => void;
  removeSelectedElements: () => void;

  // Actions — Edges & Connections
  connectNodes: (connection: {
    source: string;
    sourceHandle: string | null;
    target: string;
    targetHandle: string | null;
  }) => ConnectionValidationResult;
  removeEdge: (edgeId: string) => void;

  // Actions — Duplication, Copy/Paste & Undo/Redo (FR-004, FR-006, FR-007)
  duplicateNodes: (nodeIds?: string[]) => WorkflowNode[];
  copySelection: () => number;
  pasteClipboard: (offset?: { x: number; y: number }) => WorkflowNode[];
  undo: () => boolean;
  redo: () => boolean;

  // Actions — Validation & Persistence (FR-052, FR-053, FR-054, FR-055, FR-061, FR-062)
  runStaticValidation: () => ValidationReport;
  markSaved: () => void;
  hydrateFromStorage: () => Promise<void>;
  saveCurrentWorkflow: () => Promise<boolean>;
  deleteSavedWorkflow: (id: string) => Promise<void>;
  saveAsCustomTemplate: (customName?: string) => Promise<WorkflowDocument | null>;
  deleteCustomTemplate: (id: string) => Promise<void>;
  commitImportedWorkflow: (doc: WorkflowDocument) => Promise<WorkflowDocument>;
  exportCurrentWorkflowJson: () => string;
  dismissOnboarding: () => Promise<void>;
  restoreOnboarding: () => Promise<void>;
  setImportModalOpen: (open: boolean) => void;

  // Actions — Selection & Focus
  selectNode: (nodeId: string | null, multi?: boolean) => void;
  setSelectedNodes: (nodeIds: string[]) => void;
  selectEdge: (edgeId: string | null) => void;
  focusValidationIssue: (issueId: string) => void;

  // Actions — Layout & Navigation
  toggleLeftSidebar: () => void;
  setLeftSidebarCollapsed: (collapsed: boolean) => void;
  setLeftSidebarTab: (tab: SidebarTab) => void;
  setNodeSearchQuery: (query: string) => void;

  toggleRightInspector: () => void;
  setRightInspectorCollapsed: (collapsed: boolean) => void;
  setInspectorMode: (mode: InspectorMode) => void;

  toggleBottomDrawer: () => void;
  setBottomDrawerOpen: (open: boolean) => void;
  setBottomDrawerTab: (tab: BottomDrawerTab) => void;

  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;

  setMobileActiveTab: (tab: MobileWorkspaceTab) => void;

  // Actions — Run state
  setActiveRun: (run: WorkflowRunRecord | null) => void;

  // Actions — Toasts
  addToast: (message: string, tone?: ToastMessage['tone']) => void;
  dismissToast: (id: string) => void;
}

let nodeCounter = 100;
let edgeCounter = 100;
let toastCounter = 1;
let workflowCounter = 1;

function createInitialWorkflow(): WorkflowDocument {
  return structuredClone(EXPENSE_APPROVAL_WORKFLOW);
}

function pushUndoSnapshot(
  currentUndoStack: WorkflowDocument[],
  currentWorkflow: WorkflowDocument,
): WorkflowDocument[] {
  const next = [...currentUndoStack, structuredClone(currentWorkflow)];
  if (next.length > MAX_UNDO_HISTORY) {
    return next.slice(next.length - MAX_UNDO_HISTORY);
  }
  return next;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const initialDoc = createInitialWorkflow();
  const initialValidation = validateWorkflow(initialDoc);

  return {
    workflow: initialDoc,
    validationReport: initialValidation,
    saveStatus: 'saved',
    storageError: null,

    savedWorkflows: [initialDoc],
    customTemplates: [],
    isHydrated: false,

    onboardingDismissed: false,
    importModalOpen: false,

    undoStack: [],
    redoStack: [],

    selectedNodeId: null,
    selectedNodeIds: [],
    selectedEdgeId: null,
    clipboard: null,

    activeRun: null,
    selectedTraceEventIndex: null,

    leftSidebarCollapsed: false,
    leftSidebarTab: 'nodes',
    nodeSearchQuery: '',

    rightInspectorCollapsed: false,
    inspectorMode: 'overview',

    bottomDrawerOpen: false,
    bottomDrawerTab: 'validation',

    commandPaletteOpen: false,
    mobileActiveTab: 'canvas',

    toasts: [],

    loadWorkflow: (doc) => {
      const cloned = structuredClone(doc);
      const report = validateWorkflow(cloned);
      set({
        workflow: cloned,
        validationReport: report,
        undoStack: [],
        redoStack: [],
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null,
        activeRun: null,
        inspectorMode: 'overview',
        saveStatus: 'saved',
        storageError: null,
      });
      void defaultPersistenceAdapter
        .saveWorkspaceMeta({ activeWorkflowId: cloned.id })
        .catch(() => {
          // Non-fatal metadata update
        });
    },

    createBlankWorkflow: () => {
      const now = new Date().toISOString();
      const blankDoc: WorkflowDocument = {
        format: 'flowforge.workflow',
        formatVersion: 1,
        id: `wf_${Date.now()}_${++workflowCounter}`,
        name: 'Untitled workflow',
        description: '',
        revision: 1,
        status: 'draft',
        nodes: [],
        edges: [],
        createdAt: now,
        updatedAt: now,
      };
      const report = validateWorkflow(blankDoc);
      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: blankDoc,
        validationReport: report,
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null,
        activeRun: null,
        inspectorMode: 'overview',
        saveStatus: 'unsaved',
      }));
    },

    renameWorkflow: (newName) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === get().workflow.name) return;
      const updated: WorkflowDocument = {
        ...structuredClone(get().workflow),
        name: trimmed,
        updatedAt: new Date().toISOString(),
      };
      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: updated,
        validationReport: validateWorkflow(updated),
        saveStatus: 'unsaved',
      }));
    },

    updateWorkflowDescription: (description) => {
      const updated: WorkflowDocument = {
        ...structuredClone(get().workflow),
        description,
        updatedAt: new Date().toISOString(),
      };
      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: updated,
        saveStatus: 'unsaved',
      }));
    },

    addNodeByType: (type, position) => {
      const spec = getNodeSpecification(type);
      const current = get().workflow;
      const currentNodes = current.nodes;
      const idx = ++nodeCounter;
      const newId = `${type}_${idx}`;
      const resolvedPos = position ?? {
        x: 120 + (currentNodes.length % 4) * 260,
        y: 160 + Math.floor(currentNodes.length / 4) * 160,
      };

      const newNode = {
        id: newId,
        type,
        name: `${spec.label} ${
          currentNodes.filter((n) => n.type === type).length + 1
        }`,
        version: 1,
        position: resolvedPos,
        config: structuredClone(spec.createDefaultConfig()),
      } as WorkflowNode;

      const updated: WorkflowDocument = {
        ...structuredClone(current),
        nodes: [...structuredClone(currentNodes), newNode],
        updatedAt: new Date().toISOString(),
      };

      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: updated,
        validationReport: validateWorkflow(updated),
        selectedNodeId: newNode.id,
        selectedNodeIds: [newNode.id],
        selectedEdgeId: null,
        rightInspectorCollapsed: false,
        inspectorMode: 'node',
        saveStatus: 'unsaved',
      }));

      return newNode;
    },

    updateNodeName: (nodeId, name) => {
      const current = get().workflow;
      const target = current.nodes.find((n) => n.id === nodeId);
      if (!target || target.name === name) return;

      const updated: WorkflowDocument = {
        ...structuredClone(current),
        nodes: current.nodes.map((n) =>
          n.id === nodeId ? { ...structuredClone(n), name } : structuredClone(n),
        ),
        updatedAt: new Date().toISOString(),
      };

      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: updated,
        validationReport: validateWorkflow(updated),
        saveStatus: 'unsaved',
      }));
    },

    updateNodeConfig: (nodeId, config) => {
      const current = get().workflow;
      const target = current.nodes.find((n) => n.id === nodeId);
      if (!target) return;

      const updated: WorkflowDocument = {
        ...structuredClone(current),
        nodes: current.nodes.map((n) =>
          n.id === nodeId
            ? ({
                ...structuredClone(n),
                config: structuredClone(config),
              } as WorkflowNode)
            : structuredClone(n),
        ),
        updatedAt: new Date().toISOString(),
      };

      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: updated,
        validationReport: validateWorkflow(updated),
        saveStatus: 'unsaved',
      }));
    },

    updateNodePosition: (nodeId, position, recordHistory = true) => {
      const current = get().workflow;
      const target = current.nodes.find((n) => n.id === nodeId);
      if (
        !target ||
        (target.position.x === position.x && target.position.y === position.y)
      ) {
        return;
      }

      const updated: WorkflowDocument = {
        ...structuredClone(current),
        nodes: current.nodes.map((n) =>
          n.id === nodeId
            ? { ...structuredClone(n), position: { ...position } }
            : structuredClone(n),
        ),
        updatedAt: new Date().toISOString(),
      };

      set((s) => ({
        undoStack: recordHistory
          ? pushUndoSnapshot(s.undoStack, s.workflow)
          : s.undoStack,
        redoStack: recordHistory ? [] : s.redoStack,
        workflow: updated,
        saveStatus: 'unsaved',
      }));
    },

    removeNode: (nodeId) => {
      const current = get().workflow;
      if (!current.nodes.some((n) => n.id === nodeId)) return;

      const updated: WorkflowDocument = {
        ...structuredClone(current),
        nodes: current.nodes
          .filter((n) => n.id !== nodeId)
          .map((n) => structuredClone(n)),
        edges: current.edges
          .filter((e) => e.source !== nodeId && e.target !== nodeId)
          .map((e) => structuredClone(e)),
        updatedAt: new Date().toISOString(),
      };

      const remainingSelection = get().selectedNodeIds.filter(
        (id) => id !== nodeId,
      );
      const nextPrimaryId = remainingSelection[0] ?? null;

      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: updated,
        validationReport: validateWorkflow(updated),
        selectedNodeId: nextPrimaryId,
        selectedNodeIds: remainingSelection,
        inspectorMode: nextPrimaryId ? 'node' : 'overview',
        saveStatus: 'unsaved',
      }));
    },

    removeSelectedElements: () => {
      const { selectedNodeIds, selectedEdgeId, workflow } = get();
      if (selectedNodeIds.length === 0 && !selectedEdgeId) return;

      const removeSet = new Set(selectedNodeIds);
      const updated: WorkflowDocument = {
        ...structuredClone(workflow),
        nodes: workflow.nodes
          .filter((n) => !removeSet.has(n.id))
          .map((n) => structuredClone(n)),
        edges: workflow.edges
          .filter(
            (e) =>
              !removeSet.has(e.source) &&
              !removeSet.has(e.target) &&
              e.id !== selectedEdgeId,
          )
          .map((e) => structuredClone(e)),
        updatedAt: new Date().toISOString(),
      };

      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: updated,
        validationReport: validateWorkflow(updated),
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null,
        inspectorMode: 'overview',
        saveStatus: 'unsaved',
      }));
    },

    connectNodes: (connection) => {
      const current = get().workflow;
      const check = validateConnection(
        current.nodes,
        current.edges,
        connection,
      );
      if (!check.valid) {
        get().addToast(check.reason ?? 'Invalid port connection.', 'error');
        return check;
      }

      const sourceNode = current.nodes.find((n) => n.id === connection.source)!;
      const targetNode = current.nodes.find((n) => n.id === connection.target)!;
      const sourceSpec = getNodeSpecification(sourceNode.type);
      const targetSpec = getNodeSpecification(targetNode.type);

      const resolvedSourceHandle =
        connection.sourceHandle ?? sourceSpec.outputs[0]?.id ?? null;
      const resolvedTargetHandle =
        connection.targetHandle ?? targetSpec.inputs[0]?.id ?? null;

      const newEdge: WorkflowEdge = {
        id: `edge_${++edgeCounter}`,
        source: connection.source,
        sourceHandle: resolvedSourceHandle,
        target: connection.target,
        targetHandle: resolvedTargetHandle,
        label:
          sourceNode.type === 'condition' && resolvedSourceHandle
            ? resolvedSourceHandle
            : undefined,
      };

      const updated: WorkflowDocument = {
        ...structuredClone(current),
        edges: [...structuredClone(current.edges), newEdge],
        updatedAt: new Date().toISOString(),
      };

      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: updated,
        validationReport: validateWorkflow(updated),
        selectedEdgeId: newEdge.id,
        saveStatus: 'unsaved',
      }));

      return { valid: true };
    },

    removeEdge: (edgeId) => {
      const current = get().workflow;
      if (!current.edges.some((e) => e.id === edgeId)) return;

      const updated: WorkflowDocument = {
        ...structuredClone(current),
        edges: current.edges
          .filter((e) => e.id !== edgeId)
          .map((e) => structuredClone(e)),
        updatedAt: new Date().toISOString(),
      };

      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: updated,
        validationReport: validateWorkflow(updated),
        selectedEdgeId: s.selectedEdgeId === edgeId ? null : s.selectedEdgeId,
        saveStatus: 'unsaved',
      }));
    },

    duplicateNodes: (explicitNodeIds) => {
      const current = get().workflow;
      const idsToDuplicate =
        explicitNodeIds && explicitNodeIds.length > 0
          ? explicitNodeIds
          : get().selectedNodeIds;

      if (idsToDuplicate.length === 0) return [];

      const idSet = new Set(idsToDuplicate);
      const sourceNodes = current.nodes.filter((n) => idSet.has(n.id));
      if (sourceNodes.length === 0) return [];

      const oldToNewId = new Map<string, string>();
      const newNodes: WorkflowNode[] = sourceNodes.map((orig) => {
        const newId = `${orig.type}_${++nodeCounter}`;
        oldToNewId.set(orig.id, newId);
        return {
          ...structuredClone(orig),
          id: newId,
          name: `${orig.name} (Copy)`,
          position: {
            x: orig.position.x + 40,
            y: orig.position.y + 40,
          },
        };
      });

      const internalEdges = current.edges.filter(
        (e) => idSet.has(e.source) && idSet.has(e.target),
      );
      const newEdges: WorkflowEdge[] = internalEdges.map((origEdge) => ({
        ...structuredClone(origEdge),
        id: `edge_${++edgeCounter}`,
        source: oldToNewId.get(origEdge.source)!,
        target: oldToNewId.get(origEdge.target)!,
      }));

      const updated: WorkflowDocument = {
        ...structuredClone(current),
        nodes: [...structuredClone(current.nodes), ...newNodes],
        edges: [...structuredClone(current.edges), ...newEdges],
        updatedAt: new Date().toISOString(),
      };

      const newIds = newNodes.map((n) => n.id);
      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: updated,
        validationReport: validateWorkflow(updated),
        selectedNodeId: newIds[0] ?? null,
        selectedNodeIds: newIds,
        selectedEdgeId: null,
        rightInspectorCollapsed: false,
        inspectorMode: 'node',
        saveStatus: 'unsaved',
      }));

      return newNodes;
    },

    copySelection: () => {
      const { workflow, selectedNodeIds } = get();
      if (selectedNodeIds.length === 0) return 0;

      const idSet = new Set(selectedNodeIds);
      const copiedNodes = workflow.nodes
        .filter((n) => idSet.has(n.id))
        .map((n) => structuredClone(n));
      const copiedEdges = workflow.edges
        .filter((e) => idSet.has(e.source) && idSet.has(e.target))
        .map((e) => structuredClone(e));

      set({
        clipboard: {
          nodes: copiedNodes,
          edges: copiedEdges,
        },
      });
      return copiedNodes.length;
    },

    pasteClipboard: (offset = { x: 48, y: 48 }) => {
      const { clipboard, workflow } = get();
      if (!clipboard || clipboard.nodes.length === 0) return [];

      const oldToNewId = new Map<string, string>();
      const pastedNodes: WorkflowNode[] = clipboard.nodes.map((orig) => {
        const newId = `${orig.type}_${++nodeCounter}`;
        oldToNewId.set(orig.id, newId);
        return {
          ...structuredClone(orig),
          id: newId,
          name: `${orig.name} (Copy)`,
          position: {
            x: orig.position.x + offset.x,
            y: orig.position.y + offset.y,
          },
        };
      });

      const pastedEdges: WorkflowEdge[] = clipboard.edges
        .filter(
          (e) => oldToNewId.has(e.source) && oldToNewId.has(e.target),
        )
        .map((origEdge) => ({
          ...structuredClone(origEdge),
          id: `edge_${++edgeCounter}`,
          source: oldToNewId.get(origEdge.source)!,
          target: oldToNewId.get(origEdge.target)!,
        }));

      const updated: WorkflowDocument = {
        ...structuredClone(workflow),
        nodes: [...structuredClone(workflow.nodes), ...pastedNodes],
        edges: [...structuredClone(workflow.edges), ...pastedEdges],
        updatedAt: new Date().toISOString(),
      };

      const pastedIds = pastedNodes.map((n) => n.id);
      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: updated,
        validationReport: validateWorkflow(updated),
        selectedNodeId: pastedIds[0] ?? null,
        selectedNodeIds: pastedIds,
        selectedEdgeId: null,
        rightInspectorCollapsed: false,
        inspectorMode: 'node',
        saveStatus: 'unsaved',
      }));

      return pastedNodes;
    },

    undo: () => {
      const { undoStack, redoStack, workflow } = get();
      if (undoStack.length === 0) return false;

      const previous = undoStack[undoStack.length - 1];
      const nextUndo = undoStack.slice(0, -1);
      const nextRedo = [
        ...redoStack,
        structuredClone(workflow),
      ].slice(-MAX_UNDO_HISTORY);

      const restored = structuredClone(previous);
      const validSelection = get().selectedNodeIds.filter((id) =>
        restored.nodes.some((n) => n.id === id),
      );

      set({
        workflow: restored,
        validationReport: validateWorkflow(restored),
        undoStack: nextUndo,
        redoStack: nextRedo,
        selectedNodeId: validSelection[0] ?? null,
        selectedNodeIds: validSelection,
        selectedEdgeId: null,
        inspectorMode: validSelection[0] ? 'node' : 'overview',
        saveStatus: 'unsaved',
      });
      return true;
    },

    redo: () => {
      const { undoStack, redoStack, workflow } = get();
      if (redoStack.length === 0) return false;

      const nextDoc = redoStack[redoStack.length - 1];
      const nextRedo = redoStack.slice(0, -1);
      const nextUndo = pushUndoSnapshot(undoStack, workflow);

      const restored = structuredClone(nextDoc);
      const validSelection = get().selectedNodeIds.filter((id) =>
        restored.nodes.some((n) => n.id === id),
      );

      set({
        workflow: restored,
        validationReport: validateWorkflow(restored),
        undoStack: nextUndo,
        redoStack: nextRedo,
        selectedNodeId: validSelection[0] ?? null,
        selectedNodeIds: validSelection,
        selectedEdgeId: null,
        inspectorMode: validSelection[0] ? 'node' : 'overview',
        saveStatus: 'unsaved',
      });
      return true;
    },

    runStaticValidation: () => {
      const report = validateWorkflow(get().workflow);
      set({
        validationReport: report,
        bottomDrawerOpen: true,
        bottomDrawerTab: 'validation',
      });
      return report;
    },

    markSaved: () => {
      set({ saveStatus: 'saved', storageError: null });
    },

    hydrateFromStorage: async () => {
      try {
        const [workflows, customTemplates, meta] = await Promise.all([
          defaultPersistenceAdapter.listWorkflows(),
          defaultPersistenceAdapter.listCustomTemplates(),
          defaultPersistenceAdapter.getWorkspaceMeta(),
        ]);

        let activeDoc: WorkflowDocument | null = null;
        if (meta.activeWorkflowId) {
          activeDoc =
            workflows.find((w) => w.id === meta.activeWorkflowId) ?? null;
        }
        if (!activeDoc && workflows.length > 0) {
          activeDoc = workflows[0];
        }

        if (!activeDoc) {
          // Seed initial Expense Approval workflow into IndexedDB
          const seed = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
          await defaultPersistenceAdapter.saveWorkflow(seed);
          await defaultPersistenceAdapter.saveWorkspaceMeta({
            activeWorkflowId: seed.id,
          });
          set({
            workflow: seed,
            validationReport: validateWorkflow(seed),
            savedWorkflows: [seed],
            customTemplates,
            onboardingDismissed: Boolean(meta.onboardingDismissed),
            saveStatus: 'saved',
            storageError: null,
            isHydrated: true,
          });
          return;
        }

        set({
          workflow: structuredClone(activeDoc),
          validationReport: validateWorkflow(activeDoc),
          savedWorkflows: workflows,
          customTemplates,
          onboardingDismissed: Boolean(meta.onboardingDismissed),
          saveStatus: 'saved',
          storageError: null,
          isHydrated: true,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to access IndexedDB';
        set({
          saveStatus: 'error',
          storageError: msg,
          isHydrated: true,
        });
      }
    },

    saveCurrentWorkflow: async () => {
      const current = get().workflow;
      set({ saveStatus: 'saving', storageError: null });
      try {
        const updatedDoc: WorkflowDocument = {
          ...structuredClone(current),
          updatedAt: new Date().toISOString(),
        };
        const saved = await defaultPersistenceAdapter.saveWorkflow(updatedDoc);
        await defaultPersistenceAdapter.saveWorkspaceMeta({
          activeWorkflowId: saved.id,
        });
        const allWorkflows = await defaultPersistenceAdapter.listWorkflows();
        set({
          workflow: saved,
          savedWorkflows: allWorkflows,
          saveStatus: 'saved',
          storageError: null,
        });
        return true;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to save workflow to IndexedDB';
        set({
          saveStatus: 'error',
          storageError: msg,
        });
        return false;
      }
    },

    deleteSavedWorkflow: async (id) => {
      try {
        await defaultPersistenceAdapter.deleteWorkflow(id);
        const remaining = await defaultPersistenceAdapter.listWorkflows();
        const isCurrent = get().workflow.id === id;

        if (isCurrent) {
          if (remaining.length > 0) {
            get().loadWorkflow(remaining[0]);
            set({ savedWorkflows: remaining });
          } else {
            const fallback = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
            await defaultPersistenceAdapter.saveWorkflow(fallback);
            get().loadWorkflow(fallback);
            set({ savedWorkflows: [fallback] });
          }
        } else {
          set({ savedWorkflows: remaining });
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to delete workflow from IndexedDB';
        get().addToast(msg, 'error');
      }
    },

    saveAsCustomTemplate: async (customName) => {
      try {
        const current = get().workflow;
        const now = new Date().toISOString();
        const tplDoc: WorkflowDocument = {
          ...structuredClone(current),
          id: `tpl_custom_${Date.now()}_${++workflowCounter}`,
          name: customName?.trim() || `${current.name} (Template)`,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        };
        const saved = await defaultPersistenceAdapter.saveCustomTemplate(tplDoc);
        const allCustom = await defaultPersistenceAdapter.listCustomTemplates();
        set({ customTemplates: allCustom });
        return saved;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to save custom template';
        get().addToast(msg, 'error');
        return null;
      }
    },

    deleteCustomTemplate: async (id) => {
      try {
        await defaultPersistenceAdapter.deleteCustomTemplate(id);
        const allCustom = await defaultPersistenceAdapter.listCustomTemplates();
        set({ customTemplates: allCustom });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to delete custom template';
        get().addToast(msg, 'error');
      }
    },

    commitImportedWorkflow: async (doc) => {
      // Store imported workflow as a new local workflow; never execute automatically (PRD.md Journey D #6)
      const now = new Date().toISOString();
      const importedDoc: WorkflowDocument = {
        ...structuredClone(doc),
        id: `wf_import_${Date.now()}_${++workflowCounter}`,
        createdAt: doc.createdAt || now,
        updatedAt: now,
      };
      const saved = await defaultPersistenceAdapter.saveWorkflow(importedDoc);
      await defaultPersistenceAdapter.saveWorkspaceMeta({
        activeWorkflowId: saved.id,
      });
      const allWorkflows = await defaultPersistenceAdapter.listWorkflows();
      const report = validateWorkflow(saved);

      set({
        workflow: saved,
        validationReport: report,
        savedWorkflows: allWorkflows,
        undoStack: [],
        redoStack: [],
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null,
        activeRun: null,
        inspectorMode: 'overview',
        saveStatus: 'saved',
        storageError: null,
        importModalOpen: false,
      });

      return saved;
    },

    exportCurrentWorkflowJson: () => {
      return serializeWorkflowForExport(get().workflow);
    },

    dismissOnboarding: async () => {
      set({ onboardingDismissed: true });
      try {
        await defaultPersistenceAdapter.saveWorkspaceMeta({
          onboardingDismissed: true,
        });
      } catch {
        // Non-fatal
      }
    },

    restoreOnboarding: async () => {
      set({ onboardingDismissed: false });
      try {
        await defaultPersistenceAdapter.saveWorkspaceMeta({
          onboardingDismissed: false,
        });
      } catch {
        // Non-fatal
      }
    },

    setImportModalOpen: (open) => {
      set({ importModalOpen: open });
    },

    selectNode: (nodeId, multi = false) => {
      if (!nodeId) {
        set({
          selectedNodeId: null,
          selectedNodeIds: [],
          selectedEdgeId: null,
          inspectorMode: get().activeRun ? 'run' : 'overview',
        });
        return;
      }

      if (multi) {
        const currentIds = get().selectedNodeIds;
        const exists = currentIds.includes(nodeId);
        const nextIds = exists
          ? currentIds.filter((id) => id !== nodeId)
          : [...currentIds, nodeId];
        set({
          selectedNodeId: nextIds[nextIds.length - 1] ?? null,
          selectedNodeIds: nextIds,
          selectedEdgeId: null,
          rightInspectorCollapsed: false,
          inspectorMode: nextIds.length > 0 ? 'node' : 'overview',
        });
        return;
      }

      set({
        selectedNodeId: nodeId,
        selectedNodeIds: [nodeId],
        selectedEdgeId: null,
        rightInspectorCollapsed: false,
        inspectorMode: 'node',
      });
    },

    setSelectedNodes: (nodeIds) => {
      set({
        selectedNodeIds: nodeIds,
        selectedNodeId: nodeIds[0] ?? null,
        selectedEdgeId: null,
        inspectorMode: nodeIds.length > 0 ? 'node' : get().inspectorMode,
      });
    },

    selectEdge: (edgeId) => {
      set({
        selectedEdgeId: edgeId,
        selectedNodeId: null,
        selectedNodeIds: [],
      });
    },

    focusValidationIssue: (issueId) => {
      const issue = get().validationReport.issues.find((i) => i.id === issueId);
      if (!issue) return;
      if (issue.nodeId) {
        set({
          selectedNodeId: issue.nodeId,
          selectedNodeIds: [issue.nodeId],
          selectedEdgeId: null,
          rightInspectorCollapsed: false,
          inspectorMode: 'node',
        });
      } else if (issue.edgeId) {
        set({
          selectedEdgeId: issue.edgeId,
          selectedNodeId: null,
          selectedNodeIds: [],
        });
      }
    },

    toggleLeftSidebar: () => {
      set((s) => ({ leftSidebarCollapsed: !s.leftSidebarCollapsed }));
    },

    setLeftSidebarCollapsed: (collapsed) => {
      set({ leftSidebarCollapsed: collapsed });
    },

    setLeftSidebarTab: (tab) => {
      set({
        leftSidebarTab: tab,
        leftSidebarCollapsed: false,
      });
    },

    setNodeSearchQuery: (query) => {
      set({ nodeSearchQuery: query });
    },

    toggleRightInspector: () => {
      set((s) => ({ rightInspectorCollapsed: !s.rightInspectorCollapsed }));
    },

    setRightInspectorCollapsed: (collapsed) => {
      set({ rightInspectorCollapsed: collapsed });
    },

    setInspectorMode: (mode) => {
      set({
        inspectorMode: mode,
        rightInspectorCollapsed: false,
      });
    },

    toggleBottomDrawer: () => {
      set((s) => ({ bottomDrawerOpen: !s.bottomDrawerOpen }));
    },

    setBottomDrawerOpen: (open) => {
      set({ bottomDrawerOpen: open });
    },

    setBottomDrawerTab: (tab) => {
      set({
        bottomDrawerTab: tab,
        bottomDrawerOpen: true,
      });
    },

    setCommandPaletteOpen: (open) => {
      set({ commandPaletteOpen: open });
    },

    toggleCommandPalette: () => {
      set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen }));
    },

    setMobileActiveTab: (tab) => {
      set({ mobileActiveTab: tab });
    },

    setActiveRun: (run) => {
      set({
        activeRun: run,
        inspectorMode: run
          ? run.status === 'failed'
            ? 'error'
            : 'run'
          : 'overview',
      });
    },

    addToast: (message, tone = 'neutral') => {
      const id = `toast_${++toastCounter}`;
      set((s) => ({
        toasts: [...s.toasts, { id, message, tone }],
      }));
    },

    dismissToast: (id) => {
      set((s) => ({
        toasts: s.toasts.filter((t) => t.id !== id),
      }));
    },
  };
});
