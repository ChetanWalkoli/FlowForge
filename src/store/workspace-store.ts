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
  WorkflowLifecycleStatus,
  WorkflowNode,
  WorkflowRunRecord,
} from '../domain/types/workflow';
import {
  ConnectionValidationResult,
  validateConnection,
  validateWorkflow,
} from '../domain/validation/graph-validator';
import { autoLayoutWorkflow } from '../domain/graph/auto-layout';
import {
  buildRestoredWorkflowRevision,
  createWorkflowRevisionRecord,
  type WorkflowRevisionRecord,
} from '../domain/versioning/version-diff';
import {
  executeWorkflow,
  ExecutionPauseController,
  type ExecuteWorkflowOptions,
} from '../engine';
import {
  getDefaultTestCasesForWorkflow,
  runSingleWorkflowTestCase,
  runWorkflowTestSuite,
  type WorkflowTestCase,
  type WorkflowTestCaseResult,
  type WorkflowTestSuiteReport,
} from '../features/testing-lab/testing-lab';
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
  runInputModalOpen: boolean;
  generateWorkflowModalOpen: boolean;

  // Bounded Undo / Redo stacks (FR-007)
  undoStack: WorkflowDocument[];
  redoStack: WorkflowDocument[];

  // Selection & clipboard state (FR-004, FR-006)
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  clipboard: ClipboardSlice | null;

  // Run & debugger context (FR-025 through FR-045)
  activeRun: WorkflowRunRecord | null;
  runHistory: WorkflowRunRecord[];
  isExecuting: boolean;
  selectedTraceEventIndex: number | null;
  comparisonRunId: string | null;

  // Testing Lab & Coverage state (FR-046 through FR-051)
  testCases: WorkflowTestCase[];
  testSuiteReport: WorkflowTestSuiteReport | null;
  isRunningTests: boolean;

  // Immutable Versioning & Snapshots (FR-056 through FR-058)
  revisions: WorkflowRevisionRecord[];

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
  autoArrangeNodes: () => void;

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
  setGenerateWorkflowModalOpen: (open: boolean) => void;
  applyDraftWorkflow: (draft: WorkflowDocument, mode?: 'replace' | 'insert') => void;

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

  // Actions — Run state, TraceLab Replay & Run Comparison (FR-025 through FR-045)
  setRunInputModalOpen: (open: boolean) => void;
  executeCurrentWorkflow: (
    inputOverride?: Record<string, unknown>,
    options?: Omit<ExecuteWorkflowOptions, 'input' | 'signal' | 'onEvent'>,
  ) => Promise<WorkflowRunRecord | null>;
  cancelActiveRun: () => void;
  pauseActiveRun: () => void;
  resumeActiveRun: () => void;
  clearActiveRun: () => void;
  setActiveRun: (run: WorkflowRunRecord | null) => void;
  setSelectedTraceEventIndex: (index: number | null) => void;
  stepTraceReplay: (direction: 'first' | 'prev' | 'next' | 'last') => void;
  setComparisonRunId: (runId: string | null) => void;
  loadRunHistory: (workflowId?: string) => Promise<WorkflowRunRecord[]>;

  // Actions — Testing Lab (FR-046 through FR-051)
  addTestCase: (testCase: Omit<WorkflowTestCase, 'id' | 'workflowId' | 'createdAt' | 'updatedAt'> & { id?: string }) => WorkflowTestCase;
  updateTestCase: (testCaseId: string, patch: Partial<Omit<WorkflowTestCase, 'id' | 'workflowId'>>) => void;
  deleteTestCase: (testCaseId: string) => void;
  resetDefaultTestCases: () => void;
  runSingleTest: (testCaseId: string) => Promise<WorkflowTestCaseResult | null>;
  runTestSuite: () => Promise<WorkflowTestSuiteReport>;

  // Actions — Immutable Revisions & Diffs (FR-056 through FR-058)
  saveRevisionCheckpoint: (note?: string, status?: WorkflowLifecycleStatus) => WorkflowRevisionRecord;
  restoreRevision: (revisionId: string) => WorkflowDocument | null;

  // Actions — Toasts
  addToast: (message: string, tone?: ToastMessage['tone']) => void;
  dismissToast: (id: string) => void;
}

let nodeCounter = 100;
let edgeCounter = 100;
let toastCounter = 1;
let workflowCounter = 1;
let testCaseCounter = 100;

interface ActiveRunHandle {
  abortController: AbortController;
  pauseController: ExecutionPauseController;
}

/**
 * Tracks active AbortControllers and ExecutionPauseControllers keyed by workflowId so each workflow
 * can have at most one active execution at a time, and cancellation/pause state is strictly scoped per run.
 */
const activeRunControllers = new Map<string, ActiveRunHandle>();

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

/**
 * Merges and deduplicates finalized run records for a specific workflow ID,
 * keeping active (`running`) runs strictly separate from historical run records.
 */
function mergeAndDeduplicateRuns(
  runs: WorkflowRunRecord[],
  workflowId: string,
): WorkflowRunRecord[] {
  const byRunId = new Map<string, WorkflowRunRecord>();
  for (const run of runs) {
    if (
      run &&
      run.workflowId === workflowId &&
      run.status !== 'running' &&
      !byRunId.has(run.runId)
    ) {
      byRunId.set(run.runId, structuredClone(run));
    }
  }
  return Array.from(byRunId.values()).sort((a, b) => {
    if (b.startedAt !== a.startedAt) {
      return b.startedAt - a.startedAt;
    }
    return b.runId.localeCompare(a.runId);
  });
}

function persistCurrentTestSuite(
  workflowId: string,
  testCases: WorkflowTestCase[],
  lastReport: WorkflowTestSuiteReport | null,
): void {
  void defaultPersistenceAdapter
    .saveTestSuite({
      workflowId,
      testCases: structuredClone(testCases),
      lastReport: lastReport ? structuredClone(lastReport) : null,
      updatedAt: new Date().toISOString(),
    })
    .catch(() => {
      // Non-fatal persistence error
    });
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const initialDoc = createInitialWorkflow();
  const initialValidation = validateWorkflow(initialDoc);
  const initialRevisionRecord = createWorkflowRevisionRecord(initialDoc, {
    note: 'Initial workflow baseline',
  });

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
    runInputModalOpen: false,
    generateWorkflowModalOpen: false,

    undoStack: [],
    redoStack: [],

    selectedNodeId: null,
    selectedNodeIds: [],
    selectedEdgeId: null,
    clipboard: null,

    activeRun: null,
    runHistory: [],
    isExecuting: false,
    selectedTraceEventIndex: null,
    comparisonRunId: null,

    testCases: getDefaultTestCasesForWorkflow(initialDoc),
    testSuiteReport: null,
    isRunningTests: false,

    revisions: [initialRevisionRecord],

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
      const baselineRev = createWorkflowRevisionRecord(cloned, {
        note: `Loaded workflow v${cloned.revision}`,
      });
      set({
        workflow: cloned,
        validationReport: report,
        undoStack: [],
        redoStack: [],
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null,
        activeRun: null,
        runHistory: [],
        isExecuting: activeRunControllers.has(cloned.id),
        selectedTraceEventIndex: null,
        comparisonRunId: null,
        testCases: getDefaultTestCasesForWorkflow(cloned),
        testSuiteReport: null,
        isRunningTests: false,
        revisions: [baselineRev],
        runInputModalOpen: false,
        inspectorMode: 'overview',
        saveStatus: 'saved',
        storageError: null,
      });
      void defaultPersistenceAdapter
        .saveWorkspaceMeta({ activeWorkflowId: cloned.id })
        .catch(() => {
          // Non-fatal metadata update
        });
      void Promise.all([
        defaultPersistenceAdapter.listRuns(cloned.id).catch(() => []),
        defaultPersistenceAdapter.listRevisions(cloned.id).catch(() => []),
        defaultPersistenceAdapter.getTestSuite(cloned.id).catch(() => null),
      ]).then(([runs, revs, suite]) => {
        if (get().workflow.id === cloned.id) {
          set((s) => ({
            runHistory: mergeAndDeduplicateRuns(
              [...s.runHistory, ...runs],
              cloned.id,
            ),
            revisions:
              revs && revs.length > 0 ? revs : s.revisions,
            testCases:
              suite && suite.testCases && suite.testCases.length > 0
                ? suite.testCases
                : s.testCases,
            testSuiteReport:
              suite && suite.lastReport ? suite.lastReport : s.testSuiteReport,
          }));
        }
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
      const baselineRev = createWorkflowRevisionRecord(blankDoc, {
        note: 'Initial draft',
      });
      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: blankDoc,
        validationReport: report,
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null,
        activeRun: null,
        runHistory: [],
        isExecuting: false,
        selectedTraceEventIndex: null,
        comparisonRunId: null,
        testCases: [],
        testSuiteReport: null,
        isRunningTests: false,
        revisions: [baselineRev],
        runInputModalOpen: false,
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

    autoArrangeNodes: () => {
      const current = get().workflow;
      if (current.nodes.length === 0) return;

      const arranged = autoLayoutWorkflow(current);
      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: arranged,
        validationReport: validateWorkflow(arranged),
        saveStatus: 'unsaved',
      }));
      get().addToast('Auto-arranged workflow graph.', 'neutral');
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
          const [seedRuns, seedRevs, seedSuite] = await Promise.all([
            defaultPersistenceAdapter.listRuns(seed.id).catch(() => []),
            defaultPersistenceAdapter.listRevisions(seed.id).catch(() => []),
            defaultPersistenceAdapter.getTestSuite(seed.id).catch(() => null),
          ]);
          set({
            workflow: seed,
            validationReport: validateWorkflow(seed),
            savedWorkflows: [seed],
            customTemplates,
            activeRun: null,
            runHistory: mergeAndDeduplicateRuns(seedRuns, seed.id),
            isExecuting: activeRunControllers.has(seed.id),
            selectedTraceEventIndex: null,
            comparisonRunId: null,
            testCases:
              seedSuite && seedSuite.testCases.length > 0
                ? seedSuite.testCases
                : getDefaultTestCasesForWorkflow(seed),
            testSuiteReport: seedSuite ? seedSuite.lastReport : null,
            isRunningTests: false,
            revisions:
              seedRevs.length > 0
                ? seedRevs
                : [
                    createWorkflowRevisionRecord(seed, {
                      note: 'Seeded workflow baseline',
                    }),
                  ],
            onboardingDismissed: Boolean(meta.onboardingDismissed),
            saveStatus: 'saved',
            storageError: null,
            isHydrated: true,
          });
          return;
        }

        const [persistedRuns, persistedRevs, persistedSuite] =
          await Promise.all([
            defaultPersistenceAdapter
              .listRuns(activeDoc.id)
              .catch(() => []),
            defaultPersistenceAdapter
              .listRevisions(activeDoc.id)
              .catch(() => []),
            defaultPersistenceAdapter
              .getTestSuite(activeDoc.id)
              .catch(() => null),
          ]);

        set({
          workflow: structuredClone(activeDoc),
          validationReport: validateWorkflow(activeDoc),
          savedWorkflows: workflows,
          customTemplates,
          activeRun: null,
          runHistory: mergeAndDeduplicateRuns(persistedRuns, activeDoc.id),
          isExecuting: activeRunControllers.has(activeDoc.id),
          selectedTraceEventIndex: null,
          comparisonRunId: null,
          testCases:
            persistedSuite && persistedSuite.testCases.length > 0
              ? persistedSuite.testCases
              : getDefaultTestCasesForWorkflow(activeDoc),
          testSuiteReport: persistedSuite ? persistedSuite.lastReport : null,
          isRunningTests: false,
          revisions:
            persistedRevs.length > 0
              ? persistedRevs
              : [
                  createWorkflowRevisionRecord(activeDoc, {
                    note: `Loaded workflow v${activeDoc.revision}`,
                  }),
                ],
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
        runHistory: [],
        isExecuting: false,
        selectedTraceEventIndex: null,
        comparisonRunId: null,
        testCases: getDefaultTestCasesForWorkflow(saved),
        testSuiteReport: null,
        isRunningTests: false,
        revisions: [
          createWorkflowRevisionRecord(saved, {
            note: 'Imported workflow baseline',
          }),
        ],
        runInputModalOpen: false,
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

    setGenerateWorkflowModalOpen: (open) => {
      set({ generateWorkflowModalOpen: open });
    },

    applyDraftWorkflow: (draft, mode = 'replace') => {
      const current = get().workflow;
      if (mode === 'replace') {
        const cloned = structuredClone(draft);
        const report = validateWorkflow(cloned);
        const baselineRev = createWorkflowRevisionRecord(cloned, {
          note: `Drafted from prompt: ${cloned.name}`,
        });
        set((s) => ({
          undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
          redoStack: [],
          workflow: cloned,
          validationReport: report,
          selectedNodeId: cloned.nodes[0]?.id ?? null,
          selectedNodeIds: cloned.nodes[0] ? [cloned.nodes[0].id] : [],
          selectedEdgeId: null,
          activeRun: null,
          runHistory: [],
          revisions: [baselineRev],
          saveStatus: 'unsaved',
          generateWorkflowModalOpen: false,
        }));
        void defaultPersistenceAdapter.saveWorkflow(cloned).catch(() => {});
        void defaultPersistenceAdapter.saveRevision(baselineRev).catch(() => {});
        return;
      }

      // Mode === 'insert': append nodes and edges to current workflow with offset & fresh IDs
      let maxY = 0;
      for (const n of current.nodes) {
        if (n.position.y > maxY) maxY = n.position.y;
      }
      const yOffset = maxY + 240;

      const idMap = new Map<string, string>();
      const newNodes: WorkflowNode[] = draft.nodes.map((node) => {
        const newId = `node_${++nodeCounter}`;
        idMap.set(node.id, newId);
        return {
          ...structuredClone(node),
          id: newId,
          position: {
            x: node.position.x,
            y: node.position.y + yOffset,
          },
        };
      });

      // Update references inside node config
      for (const node of newNodes) {
        if (node.type === 'condition' && node.config.left?.source) {
          if (idMap.has(node.config.left.source)) {
            node.config.left.source = idMap.get(node.config.left.source)!;
          }
        } else if (node.type === 'action' && node.config.actionType === 'buildObject' && node.config.fields) {
          for (const entry of Object.values(node.config.fields)) {
            if (entry.kind === 'ref' && idMap.has(entry.source)) {
              entry.source = idMap.get(entry.source)!;
            }
          }
        }
      }

      const newEdges: WorkflowEdge[] = draft.edges.map((edge) => ({
        ...structuredClone(edge),
        id: `edge_${++edgeCounter}`,
        source: idMap.get(edge.source) || edge.source,
        target: idMap.get(edge.target) || edge.target,
      }));

      const merged: WorkflowDocument = {
        ...structuredClone(current),
        nodes: [...structuredClone(current.nodes), ...newNodes],
        edges: [...structuredClone(current.edges), ...newEdges],
        updatedAt: new Date().toISOString(),
      };

      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: merged,
        validationReport: validateWorkflow(merged),
        selectedNodeId: newNodes[0]?.id ?? null,
        selectedNodeIds: newNodes.map((n) => n.id),
        selectedEdgeId: null,
        saveStatus: 'unsaved',
        generateWorkflowModalOpen: false,
      }));
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

    setRunInputModalOpen: (open) => {
      set({ runInputModalOpen: open });
    },

    executeCurrentWorkflow: async (inputOverride, options = {}) => {
      const workflowSnapshot = structuredClone(get().workflow);
      const targetWorkflowId = workflowSnapshot.id;

      // Prevent duplicate concurrent runs for the same workflow
      if (activeRunControllers.has(targetWorkflowId)) {
        get().addToast('Workflow is already running.', 'warning');
        return null;
      }

      const abortController = new AbortController();
      const pauseController = new ExecutionPauseController();
      activeRunControllers.set(targetWorkflowId, {
        abortController,
        pauseController,
      });

      set({
        isExecuting: true,
        runInputModalOpen: false,
        selectedTraceEventIndex: null,
      });

      try {
        const finalRun = await executeWorkflow(workflowSnapshot, {
          ...options,
          input: inputOverride,
          signal: abortController.signal,
          pauseController,
          workflowLookup:
            options.workflowLookup ??
            (async (id: string) => {
              const inMemory = get().savedWorkflows.find((w) => w.id === id);
              if (inMemory) return inMemory;
              return defaultPersistenceAdapter.getWorkflow(id);
            }),
          onEvent: (_event, snapshot) => {
            // Only update activeRun if the user has not switched away from targetWorkflowId
            if (get().workflow.id === targetWorkflowId) {
              set({
                activeRun: structuredClone(snapshot),
              });
            }
          },
        });

        activeRunControllers.delete(targetWorkflowId);
        const completedRecord = structuredClone(finalRun);

        // Apply state updates only if the executed workflow is still the active workflow
        if (get().workflow.id === targetWorkflowId) {
          const updatedHistory = mergeAndDeduplicateRuns(
            [completedRecord, ...get().runHistory],
            targetWorkflowId,
          );
          const failedNodeId =
            completedRecord.status === 'failed' &&
            completedRecord.error?.nodeId &&
            get().workflow.nodes.some(
              (n) => n.id === completedRecord.error?.nodeId,
            )
              ? completedRecord.error.nodeId
              : null;

          set((s) => ({
            activeRun: completedRecord,
            runHistory: updatedHistory,
            isExecuting: activeRunControllers.has(s.workflow.id),
            bottomDrawerOpen: true,
            bottomDrawerTab:
              completedRecord.status === 'failed' ? 'timeline' : 'output',
            rightInspectorCollapsed:
              completedRecord.status === 'failed'
                ? false
                : s.rightInspectorCollapsed,
            inspectorMode:
              completedRecord.status === 'failed'
                ? 'error'
                : s.selectedNodeId
                  ? 'node'
                  : 'run',
            selectedNodeId: failedNodeId ?? s.selectedNodeId,
            selectedNodeIds: failedNodeId ? [failedNodeId] : s.selectedNodeIds,
          }));

          if (completedRecord.status === 'success') {
            get().addToast(
              `Workflow completed in ${completedRecord.durationMs ?? 0}ms.`,
              'neutral',
            );
          } else if (completedRecord.status === 'failed') {
            get().addToast(
              `Workflow failed: ${completedRecord.error?.message ?? 'Execution error'}`,
              'error',
            );
          } else if (completedRecord.status === 'cancelled') {
            get().addToast('Workflow execution cancelled.', 'warning');
          }
        } else {
          // User switched workflows during execution; keep current workflow state untouched
          set((s) => ({
            isExecuting: activeRunControllers.has(s.workflow.id),
          }));
        }

        // Persist finalized run (completed, failed, or cancelled) to IndexedDB
        try {
          await defaultPersistenceAdapter.saveRun(completedRecord);
          const persistedRuns =
            await defaultPersistenceAdapter.listRuns(targetWorkflowId);
          if (get().workflow.id === targetWorkflowId) {
            set((s) => ({
              runHistory: mergeAndDeduplicateRuns(
                [completedRecord, ...persistedRuns, ...s.runHistory],
                targetWorkflowId,
              ),
            }));
          }
        } catch (storageErr) {
          const msg =
            storageErr instanceof Error
              ? storageErr.message
              : 'Failed to persist workflow run to IndexedDB';
          set({ storageError: msg });
          get().addToast(msg, 'error');
        }

        return completedRecord;
      } catch (unexpectedErr) {
        activeRunControllers.delete(targetWorkflowId);
        const msg =
          unexpectedErr instanceof Error
            ? unexpectedErr.message
            : 'Unexpected workflow execution error';
        if (get().workflow.id === targetWorkflowId) {
          set({
            isExecuting: false,
          });
        }
        get().addToast(msg, 'error');
        return null;
      }
    },

    cancelActiveRun: () => {
      const currentWorkflowId = get().workflow.id;
      const entry = activeRunControllers.get(currentWorkflowId);
      if (entry && !entry.abortController.signal.aborted) {
        entry.abortController.abort();
      }
    },

    pauseActiveRun: () => {
      const currentWorkflowId = get().workflow.id;
      const entry = activeRunControllers.get(currentWorkflowId);
      if (entry) {
        entry.pauseController.pause();
        get().addToast('Workflow execution paused.', 'neutral');
      }
    },

    resumeActiveRun: () => {
      const currentWorkflowId = get().workflow.id;
      const entry = activeRunControllers.get(currentWorkflowId);
      if (entry) {
        entry.pauseController.resume();
        get().addToast('Resumed workflow execution.', 'neutral');
      }
    },

    clearActiveRun: () => {
      set((s) => ({
        activeRun: null,
        selectedTraceEventIndex: null,
        inspectorMode: s.selectedNodeId ? 'node' : 'overview',
      }));
    },

    setActiveRun: (run) => {
      const cloned = run ? structuredClone(run) : null;
      set((s) => ({
        activeRun: cloned,
        selectedTraceEventIndex: null,
        inspectorMode: cloned
          ? cloned.status === 'failed'
            ? 'error'
            : 'run'
          : s.selectedNodeId
            ? 'node'
            : 'overview',
      }));
    },

    setSelectedTraceEventIndex: (index) => {
      set({ selectedTraceEventIndex: index });
    },

    stepTraceReplay: (direction) => {
      const { activeRun, selectedTraceEventIndex, workflow } = get();
      if (!activeRun || activeRun.events.length === 0) return;

      const totalEvents = activeRun.events.length;
      const currentIdx =
        selectedTraceEventIndex === null ? totalEvents - 1 : selectedTraceEventIndex;

      let nextIdx: number | null = currentIdx;
      if (direction === 'first') {
        nextIdx = 0;
      } else if (direction === 'prev') {
        nextIdx = Math.max(0, currentIdx - 1);
      } else if (direction === 'next') {
        nextIdx = Math.min(totalEvents - 1, currentIdx + 1);
      } else if (direction === 'last') {
        nextIdx = null;
      }

      const targetEvent =
        nextIdx !== null ? activeRun.events[nextIdx] : activeRun.events[totalEvents - 1];
      const eventNodeId =
        targetEvent &&
        'nodeId' in targetEvent &&
        targetEvent.nodeId &&
        workflow.nodes.some((n) => n.id === targetEvent.nodeId)
          ? targetEvent.nodeId
          : null;

      set((s) => ({
        selectedTraceEventIndex: nextIdx,
        selectedNodeId: eventNodeId ?? s.selectedNodeId,
        selectedNodeIds: eventNodeId ? [eventNodeId] : s.selectedNodeIds,
        inspectorMode: eventNodeId ? 'node' : s.inspectorMode,
      }));
    },

    setComparisonRunId: (runId) => {
      set({ comparisonRunId: runId });
    },

    loadRunHistory: async (workflowId) => {
      const targetId = workflowId ?? get().workflow.id;
      try {
        const persisted = await defaultPersistenceAdapter.listRuns(targetId);
        const deduplicated = mergeAndDeduplicateRuns(persisted, targetId);
        if (get().workflow.id === targetId) {
          set((s) => ({
            runHistory: mergeAndDeduplicateRuns(
              [...s.runHistory, ...deduplicated],
              targetId,
            ),
          }));
        }
        return deduplicated;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to load workflow run history from IndexedDB';
        set({ storageError: msg });
        return get().workflow.id === targetId ? get().runHistory : [];
      }
    },

    addTestCase: (testCaseInput) => {
      const now = new Date().toISOString();
      const newCase: WorkflowTestCase = {
        id: testCaseInput.id ?? `tc_${Date.now()}_${++testCaseCounter}`,
        workflowId: get().workflow.id,
        name: testCaseInput.name.trim() || 'Untitled Test Case',
        description: testCaseInput.description,
        input: structuredClone(testCaseInput.input),
        assertions: structuredClone(testCaseInput.assertions),
        createdAt: now,
        updatedAt: now,
      };
      const updatedCases = [...get().testCases, newCase];
      set({ testCases: updatedCases });
      persistCurrentTestSuite(
        get().workflow.id,
        updatedCases,
        get().testSuiteReport,
      );
      return newCase;
    },

    updateTestCase: (testCaseId, patch) => {
      const now = new Date().toISOString();
      const updatedCases = get().testCases.map((tc) =>
        tc.id === testCaseId
          ? {
              ...structuredClone(tc),
              ...structuredClone(patch),
              updatedAt: now,
            }
          : tc,
      );
      set({ testCases: updatedCases });
      persistCurrentTestSuite(
        get().workflow.id,
        updatedCases,
        get().testSuiteReport,
      );
    },

    deleteTestCase: (testCaseId) => {
      const updatedCases = get().testCases.filter((tc) => tc.id !== testCaseId);
      set({ testCases: updatedCases });
      persistCurrentTestSuite(
        get().workflow.id,
        updatedCases,
        get().testSuiteReport,
      );
    },

    resetDefaultTestCases: () => {
      const defaults = getDefaultTestCasesForWorkflow(get().workflow);
      set({
        testCases: defaults,
        testSuiteReport: null,
      });
      persistCurrentTestSuite(get().workflow.id, defaults, null);
      get().addToast('Reset test suite to starter scenarios.', 'neutral');
    },

    runSingleTest: async (testCaseId) => {
      const tc = get().testCases.find((c) => c.id === testCaseId);
      if (!tc) return null;

      set({ isRunningTests: true });
      try {
        const result = await runSingleWorkflowTestCase(get().workflow, tc);
        const existingResults = get().testSuiteReport?.results ?? [];
        const updatedResults = existingResults.some(
          (r: WorkflowTestCaseResult) => r.testCaseId === testCaseId,
        )
          ? existingResults.map((r: WorkflowTestCaseResult) =>
              r.testCaseId === testCaseId ? result : r,
            )
          : [...existingResults, result];

        const report = await runWorkflowTestSuite(
          get().workflow,
          get().testCases.filter((c) =>
            updatedResults.some(
              (r: WorkflowTestCaseResult) => r.testCaseId === c.id,
            ),
          ),
        );

        set({
          testSuiteReport: report,
          isRunningTests: false,
          activeRun: structuredClone(result.runRecord),
          selectedTraceEventIndex: null,
        });
        persistCurrentTestSuite(get().workflow.id, get().testCases, report);
        return result;
      } catch (err) {
        set({ isRunningTests: false });
        const msg = err instanceof Error ? err.message : 'Test execution failed';
        get().addToast(msg, 'error');
        return null;
      }
    },

    runTestSuite: async () => {
      const currentWorkflow = structuredClone(get().workflow);
      const currentCases = structuredClone(get().testCases);
      set({
        isRunningTests: true,
        bottomDrawerOpen: true,
        bottomDrawerTab: 'tests',
      });

      try {
        const report = await runWorkflowTestSuite(currentWorkflow, currentCases);
        set((s) => ({
          testSuiteReport: report,
          isRunningTests: false,
          workflow:
            report.passedCases === report.totalCases && report.totalCases > 0
              ? {
                  ...s.workflow,
                  status:
                    s.workflow.status === 'published' ? 'published' : 'tested',
                }
              : s.workflow,
        }));
        persistCurrentTestSuite(currentWorkflow.id, currentCases, report);
        get().addToast(
          `Test Suite: ${report.passedCases}/${report.totalCases} passed (${report.coverage.coveragePercent}% branch coverage).`,
          report.failedCases === 0 ? 'neutral' : 'warning',
        );
        return report;
      } catch (err) {
        set({ isRunningTests: false });
        const msg =
          err instanceof Error ? err.message : 'Test suite execution failed';
        get().addToast(msg, 'error');
        throw err;
      }
    },

    saveRevisionCheckpoint: (note, status) => {
      const current = get().workflow;
      const highestRev = Math.max(
        current.revision,
        ...get().revisions.map((r) => r.revisionNumber),
      );
      const nextRevNumber = highestRev + 1;
      const now = new Date().toISOString();

      const updatedWorkflow: WorkflowDocument = {
        ...structuredClone(current),
        revision: nextRevNumber,
        status: status ?? current.status,
        updatedAt: now,
      };

      const record = createWorkflowRevisionRecord(updatedWorkflow, {
        note: note?.trim() || `Revision v${nextRevNumber} checkpoint`,
        nowIso: now,
      });

      set((s) => ({
        workflow: updatedWorkflow,
        revisions: [record, ...s.revisions],
        saveStatus: 'unsaved',
      }));

      void defaultPersistenceAdapter.saveRevision(record).catch(() => {});

      get().addToast(
        `Saved immutable snapshot v${nextRevNumber}.`,
        'neutral',
      );
      return record;
    },

    restoreRevision: (revisionId) => {
      const targetRecord = get().revisions.find(
        (r) => r.revisionId === revisionId,
      );
      if (!targetRecord) return null;

      const highestRev = Math.max(
        get().workflow.revision,
        ...get().revisions.map((r) => r.revisionNumber),
      );
      const restoredDoc = buildRestoredWorkflowRevision(
        targetRecord,
        highestRev,
      );
      const restoredRecord = createWorkflowRevisionRecord(restoredDoc, {
        note: `Restored from v${targetRecord.revisionNumber}`,
      });

      set((s) => ({
        undoStack: pushUndoSnapshot(s.undoStack, s.workflow),
        redoStack: [],
        workflow: restoredDoc,
        validationReport: validateWorkflow(restoredDoc),
        revisions: [restoredRecord, ...s.revisions],
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeId: null,
        saveStatus: 'unsaved',
      }));

      void defaultPersistenceAdapter.saveRevision(restoredRecord).catch(() => {});

      get().addToast(
        `Restored v${targetRecord.revisionNumber} as new revision v${restoredDoc.revision}.`,
        'neutral',
      );
      return restoredDoc;
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
