import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import { FORM_VALIDATION_WORKFLOW } from '../domain/fixtures/starter-templates';
import { executeNodeHandler } from '../engine';
import { defaultPersistenceAdapter } from '../persistence/indexeddb/indexeddb-adapter';
import { useWorkspaceStore } from '../store/workspace-store';

describe('Phase 5 Task 7 — Workspace Store Runtime Integration and IndexedDB Run Persistence', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await defaultPersistenceAdapter.clearAll();
    useWorkspaceStore.getState().loadWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    useWorkspaceStore.setState({
      savedWorkflows: [structuredClone(EXPENSE_APPROVAL_WORKFLOW)],
      customTemplates: [],
      isHydrated: true,
      onboardingDismissed: false,
      importModalOpen: false,
      runInputModalOpen: false,
      activeRun: null,
      runHistory: [],
      isExecuting: false,
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
      storageError: null,
      toasts: [],
    });
  });

  it('starts a workflow from the workspace store, updates activeRun/nodeTraces/events on success, and does not mutate stored workflow definitions', async () => {
    const beforeWorkflowSnapshot = structuredClone(
      useWorkspaceStore.getState().workflow,
    );

    const runResult = await useWorkspaceStore
      .getState()
      .executeCurrentWorkflow({
        amount: 3200,
        requester: 'claire@flowforge.dev',
        department: 'Engineering',
      });

    expect(runResult).not.toBeNull();
    expect(runResult?.status).toBe('success');
    expect(runResult?.workflowId).toBe(EXPENSE_APPROVAL_WORKFLOW.id);
    expect(runResult?.finalOutput).toEqual({
      decision: 'approved',
      routing: 'automatic',
      amount: 3200,
      requester: 'claire@flowforge.dev',
    });

    const state = useWorkspaceStore.getState();
    expect(state.isExecuting).toBe(false);
    expect(state.activeRun?.runId).toBe(runResult?.runId);
    expect(state.activeRun?.status).toBe('success');
    expect(state.activeRun?.nodeTraces['trigger_1'].status).toBe(
      'success',
    );
    expect(state.activeRun?.nodeTraces['condition_1'].status).toBe(
      'success',
    );
    expect(state.activeRun?.nodeTraces['action_approve'].status).toBe('success');
    expect(state.activeRun?.nodeTraces['action_review'].status).toBe('skipped');
    expect(state.activeRun?.nodeTraces['end_1'].status).toBe('success');
    expect(state.activeRun?.events.at(0)?.type).toBe('run.started');
    expect(state.activeRun?.events.at(-1)?.type).toBe('run.completed');

    // UI state transitions on completion
    expect(state.bottomDrawerOpen).toBe(true);
    expect(state.bottomDrawerTab).toBe('output');
    expect(state.inspectorMode).toBe('run');
    expect(state.runHistory).toHaveLength(1);
    expect(state.runHistory[0].runId).toBe(runResult?.runId);
    expect(
      state.toasts.some((t) => t.message.includes('Workflow completed in')),
    ).toBe(true);

    // Stored workflow definition must remain completely unmutated
    expect(state.workflow).toEqual(beforeWorkflowSnapshot);
  });

  it('updates workspace state accurately on failed runs, selects the failed node, and opens error inspector & timeline drawer', async () => {
    // Pass invalid trigger input (amount as string instead of number)
    const failedRun = await useWorkspaceStore
      .getState()
      .executeCurrentWorkflow({
        amount: 'not-a-number',
        requester: 'claire@flowforge.dev',
        department: 'Engineering',
      });

    expect(failedRun).not.toBeNull();
    expect(failedRun?.status).toBe('failed');
    expect(failedRun?.error?.code).toBe('ERR_INVALID_TRIGGER_INPUT');
    expect(failedRun?.error?.nodeId).toBe('trigger_1');

    const state = useWorkspaceStore.getState();
    expect(state.isExecuting).toBe(false);
    expect(state.activeRun?.status).toBe('failed');
    expect(state.selectedNodeId).toBe('trigger_1');
    expect(state.selectedNodeIds).toEqual(['trigger_1']);
    expect(state.rightInspectorCollapsed).toBe(false);
    expect(state.inspectorMode).toBe('error');
    expect(state.bottomDrawerOpen).toBe(true);
    expect(state.bottomDrawerTab).toBe('timeline');
    expect(state.runHistory).toHaveLength(1);
    expect(state.runHistory[0].status).toBe('failed');
    expect(state.toasts.some((t) => t.tone === 'error')).toBe(true);
  });

  it('supports cancelling an active run via cancelActiveRun() and ensures cancellation state does not leak into subsequent runs', async () => {
    const runPromise = useWorkspaceStore.getState().executeCurrentWorkflow(
      {
        amount: 2500,
        requester: 'alex@flowforge.dev',
        department: 'Product',
      },
      {
        onBeforeNodeStep: async (node) => {
          if (node.id === 'action_approve') {
            // While running, activeRun is in 'running' state and separated from runHistory
            expect(useWorkspaceStore.getState().isExecuting).toBe(true);
            expect(useWorkspaceStore.getState().activeRun?.status).toBe(
              'running',
            );
            expect(useWorkspaceStore.getState().runHistory).toHaveLength(0);
            useWorkspaceStore.getState().cancelActiveRun();
          }
        },
      },
    );

    const cancelledRun = await runPromise;
    expect(cancelledRun).not.toBeNull();
    expect(cancelledRun?.status).toBe('cancelled');
    expect(cancelledRun?.events.at(-1)?.type).toBe('run.cancelled');

    const stateAfterCancel = useWorkspaceStore.getState();
    expect(stateAfterCancel.isExecuting).toBe(false);
    expect(stateAfterCancel.activeRun?.status).toBe('cancelled');
    expect(stateAfterCancel.runHistory).toHaveLength(1);
    expect(stateAfterCancel.runHistory[0].status).toBe('cancelled');

    // Subsequent run on the same workflow must succeed without any leaked cancellation state
    const nextRun = await useWorkspaceStore.getState().executeCurrentWorkflow({
      amount: 1800,
      requester: 'alex@flowforge.dev',
      department: 'Product',
    });

    expect(nextRun?.status).toBe('success');
    expect(useWorkspaceStore.getState().activeRun?.status).toBe('success');
    expect(useWorkspaceStore.getState().runHistory).toHaveLength(2);
  });

  it('prevents duplicate concurrent execution of the same workflow while it is already running', async () => {
    let releaseStep!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseStep = resolve;
    });

    const firstRunPromise = useWorkspaceStore
      .getState()
      .executeCurrentWorkflow(undefined, {
        nodeRunner: async (params) => {
          if (params.node.id === 'condition_1') {
            await gate;
          }
          return executeNodeHandler(params);
        },
      });

    expect(useWorkspaceStore.getState().isExecuting).toBe(true);

    // Attempt to start a duplicate run while firstRunPromise is still in flight
    const duplicateRunResult = await useWorkspaceStore
      .getState()
      .executeCurrentWorkflow();

    expect(duplicateRunResult).toBeNull();
    expect(
      useWorkspaceStore
        .getState()
        .toasts.some((t) => t.message.includes('already running')),
    ).toBe(true);

    // Release first run and verify it completes cleanly
    releaseStep();
    const firstRunResult = await firstRunPromise;
    expect(firstRunResult?.status).toBe('success');
    expect(useWorkspaceStore.getState().isExecuting).toBe(false);
    expect(useWorkspaceStore.getState().runHistory).toHaveLength(1);
  });

  it('prevents stale asynchronous updates from modifying a different workflow when switching workflows mid-run', async () => {
    let releaseFirstWorkflow!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirstWorkflow = resolve;
    });

    // Start Expense Approval workflow and pause inside condition_amount
    const expenseRunPromise = useWorkspaceStore
      .getState()
      .executeCurrentWorkflow(
        {
          amount: 1900,
          requester: 'dana@flowforge.dev',
          department: 'Ops',
        },
        {
          runId: 'run_bg_expense',
          nodeRunner: async (params) => {
            if (params.node.id === 'condition_amount') {
              await gate;
            }
            return executeNodeHandler(params);
          },
        },
      );

    // Switch active workflow to Form Validation while Expense Approval is still executing
    useWorkspaceStore.getState().loadWorkflow(FORM_VALIDATION_WORKFLOW);
    expect(useWorkspaceStore.getState().workflow.id).toBe(
      FORM_VALIDATION_WORKFLOW.id,
    );
    expect(useWorkspaceStore.getState().activeRun).toBeNull();
    expect(useWorkspaceStore.getState().isExecuting).toBe(false);

    // Let the background Expense Approval run finish
    releaseFirstWorkflow();
    const completedExpenseRun = await expenseRunPromise;

    expect(completedExpenseRun?.runId).toBe('run_bg_expense');
    expect(completedExpenseRun?.workflowId).toBe(EXPENSE_APPROVAL_WORKFLOW.id);
    expect(completedExpenseRun?.status).toBe('success');

    // Current active workflow (Form Validation) must NOT be polluted by the background run
    const currentFormState = useWorkspaceStore.getState();
    expect(currentFormState.workflow.id).toBe(FORM_VALIDATION_WORKFLOW.id);
    expect(currentFormState.activeRun).toBeNull();
    expect(currentFormState.runHistory).toEqual([]);

    // Persisted runs for Expense Approval must contain the completed background run
    const persistedExpenseRuns = await defaultPersistenceAdapter.listRuns(
      EXPENSE_APPROVAL_WORKFLOW.id,
    );
    expect(persistedExpenseRuns).toHaveLength(1);
    expect(persistedExpenseRuns[0].runId).toBe('run_bg_expense');

    // Switching back to Expense Approval loads its persisted run history
    useWorkspaceStore.getState().loadWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    await useWorkspaceStore
      .getState()
      .loadRunHistory(EXPENSE_APPROVAL_WORKFLOW.id);
    expect(
      useWorkspaceStore.getState().runHistory.map((r) => r.runId),
    ).toContain('run_bg_expense');
  });

  it('persists completed, failed, and cancelled runs to IndexedDB without duplicates and restores run history after application reload', async () => {
    await defaultPersistenceAdapter.saveWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    await defaultPersistenceAdapter.saveWorkspaceMeta({
      activeWorkflowId: EXPENSE_APPROVAL_WORKFLOW.id,
    });

    let clock = 1700000000000;
    const nextNow = () => {
      clock += 100;
      return clock;
    };

    // 1. Completed run
    const completedRun = await useWorkspaceStore
      .getState()
      .executeCurrentWorkflow(
        {
          amount: 1500,
          requester: 'one@flowforge.dev',
          department: 'Eng',
        },
        { runId: 'run_hist_completed', now: nextNow },
      );
    expect(completedRun?.status).toBe('success');

    // 2. Failed run
    const failedRun = await useWorkspaceStore
      .getState()
      .executeCurrentWorkflow(
        {
          amount: 'invalid-number',
          requester: 'two@flowforge.dev',
          department: 'Eng',
        },
        { runId: 'run_hist_failed', now: nextNow },
      );
    expect(failedRun?.status).toBe('failed');

    // 3. Cancelled run
    const cancelledRun = await useWorkspaceStore
      .getState()
      .executeCurrentWorkflow(
        {
          amount: 2500,
          requester: 'three@flowforge.dev',
          department: 'Eng',
        },
        {
          runId: 'run_hist_cancelled',
          now: nextNow,
          onBeforeNodeStep: () => {
            useWorkspaceStore.getState().cancelActiveRun();
          },
        },
      );
    expect(cancelledRun?.status).toBe('cancelled');

    // Re-saving an existing runId must not create duplicates in IndexedDB
    await defaultPersistenceAdapter.saveRun(completedRun!);

    const storedRuns = await defaultPersistenceAdapter.listRuns(
      EXPENSE_APPROVAL_WORKFLOW.id,
    );
    expect(storedRuns.map((r) => r.runId)).toEqual([
      'run_hist_cancelled',
      'run_hist_failed',
      'run_hist_completed',
    ]);

    // Simulate application reload: clear in-memory store state and call hydrateFromStorage()
    useWorkspaceStore.setState({
      activeRun: null,
      runHistory: [],
      isHydrated: false,
    });
    expect(useWorkspaceStore.getState().runHistory).toEqual([]);

    await useWorkspaceStore.getState().hydrateFromStorage();

    const restoredState = useWorkspaceStore.getState();
    expect(restoredState.isHydrated).toBe(true);
    expect(restoredState.workflow.id).toBe(EXPENSE_APPROVAL_WORKFLOW.id);
    expect(restoredState.activeRun).toBeNull();
    expect(restoredState.runHistory.map((r) => r.runId)).toEqual([
      'run_hist_cancelled',
      'run_hist_failed',
      'run_hist_completed',
    ]);
  });

  it('handles IndexedDB persistence failures gracefully without losing the in-memory execution result or run history', async () => {
    vi.spyOn(defaultPersistenceAdapter, 'saveRun').mockRejectedValueOnce(
      new Error('Simulated IndexedDB quota exceeded'),
    );

    const run = await useWorkspaceStore.getState().executeCurrentWorkflow({
      amount: 950,
      requester: 'resilient@flowforge.dev',
      department: 'QA',
    });

    expect(run).not.toBeNull();
    expect(run?.status).toBe('success');

    const state = useWorkspaceStore.getState();
    // In-memory activeRun and runHistory are preserved despite IndexedDB failure
    expect(state.activeRun?.runId).toBe(run?.runId);
    expect(state.activeRun?.status).toBe('success');
    expect(state.runHistory).toHaveLength(1);
    expect(state.runHistory[0].runId).toBe(run?.runId);
    expect(state.storageError).toBe('Simulated IndexedDB quota exceeded');
    expect(
      state.toasts.some(
        (t) =>
          t.tone === 'error' &&
          t.message.includes('Simulated IndexedDB quota exceeded'),
      ),
    ).toBe(true);
  });
});
