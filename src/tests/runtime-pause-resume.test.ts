import { beforeEach, describe, expect, it } from 'vitest';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import type { ExecutionEvent, WorkflowRunRecord } from '../domain/types/workflow';
import {
  executeWorkflow,
  ExecutionPauseController,
} from '../engine';
import { defaultPersistenceAdapter } from '../persistence/indexeddb/indexeddb-adapter';
import { useWorkspaceStore } from '../store/workspace-store';

describe('Task 2 — Runtime Pause and Resume (FR-041)', () => {
  beforeEach(async () => {
    await defaultPersistenceAdapter.clearAll();
  });

  it('ExecutionPauseController pauses, resumes, and handles step-through transitions correctly', async () => {
    const controller = new ExecutionPauseController();
    expect(controller.isPaused).toBe(false);

    controller.pause();
    expect(controller.isPaused).toBe(true);

    // waitIfPaused should wait until resumed
    let resumed = false;
    const waitPromise = controller.waitIfPaused().then((aborted) => {
      resumed = true;
      return aborted;
    });

    expect(resumed).toBe(false);
    controller.resume();
    const aborted = await waitPromise;
    expect(aborted).toBe(false);
    expect(resumed).toBe(true);
    expect(controller.isPaused).toBe(false);
  });

  it('ExecutionPauseController aborts immediately when signal is cancelled during pause', async () => {
    const controller = new ExecutionPauseController();
    controller.pause();

    const abortController = new AbortController();
    const waitPromise = controller.waitIfPaused(abortController.signal);

    abortController.abort();
    const aborted = await waitPromise;
    expect(aborted).toBe(true);
  });

  it('pauses workflow execution at a node boundary and resumes to completion without re-executing finished nodes', async () => {
    const events: ExecutionEvent[] = [];
    const pauseController = new ExecutionPauseController();
    const nodesExecuted: string[] = [];

    // Pause before the 2nd node
    let stepCount = 0;
    const runPromise = executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      input: {
        amount: 3500,
        requester: 'elena@flowforge.dev',
        department: 'Product',
      },
      pauseController,
      onBeforeNodeStep: (node) => {
        nodesExecuted.push(node.id);
        stepCount++;
        if (stepCount === 1) {
          // Pause before node 2 starts
          pauseController.pause();
        }
      },
      onEvent: (event) => {
        events.push(event);
      },
    });

    // Wait short delay to allow first node to finish and pause to engage
    await new Promise((r) => setTimeout(r, 20));

    expect(pauseController.isPaused).toBe(true);
    expect(events.some((e) => e.type === 'run.paused')).toBe(true);

    const executedCountBeforeResume = nodesExecuted.length;
    expect(executedCountBeforeResume).toBe(1);

    // Resume execution
    pauseController.resume();
    const finalRun = await runPromise;

    expect(finalRun.status).toBe('success');
    expect(events.some((e) => e.type === 'run.resumed')).toBe(true);

    // Ensure finished node (trigger_1) was not executed twice
    const triggerExecutions = nodesExecuted.filter((id) => id === 'trigger_1');
    expect(triggerExecutions).toHaveLength(1);

    // Ensure all required nodes in the path executed
    expect(nodesExecuted.length).toBeGreaterThan(executedCountBeforeResume);
  });

  it('cancels cleanly when cancel signal is triggered while in paused state', async () => {
    const pauseController = new ExecutionPauseController();
    const abortController = new AbortController();

    let stepCount = 0;
    const runPromise = executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      input: { amount: 2000, requester: 'alex@flowforge.dev', department: 'Eng' },
      pauseController,
      signal: abortController.signal,
      onBeforeNodeStep: () => {
        stepCount++;
        if (stepCount === 1) {
          pauseController.pause();
        }
      },
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(pauseController.isPaused).toBe(true);

    // Cancel while paused
    abortController.abort();
    const finalRun = await runPromise;

    expect(finalRun.status).toBe('cancelled');
  });

  it('workspace store exposes pauseActiveRun and resumeActiveRun and transitions activeRun status', async () => {
    useWorkspaceStore.getState().loadWorkflow(EXPENSE_APPROVAL_WORKFLOW);

    // Track activeRun statuses received
    const statuses: Array<WorkflowRunRecord['status']> = [];
    const unsub = useWorkspaceStore.subscribe((state) => {
      if (state.activeRun) {
        statuses.push(state.activeRun.status);
      }
    });

    // Execute with a small async node hook so we can pause in-flight
    let hasPaused = false;
    const executionPromise = useWorkspaceStore.getState().executeCurrentWorkflow(
      { amount: 4500, requester: 'sarah@flowforge.dev', department: 'Design' },
      {
        onBeforeNodeStep: async () => {
          if (!hasPaused) {
            hasPaused = true;
            useWorkspaceStore.getState().pauseActiveRun();
            // Allow store state to settle
            await new Promise((r) => setTimeout(r, 10));
          }
        },
      },
    );

    // Wait until pause is registered in store
    await new Promise((r) => setTimeout(r, 30));

    const pausedRun = useWorkspaceStore.getState().activeRun;
    expect(pausedRun).not.toBeNull();
    expect(pausedRun?.status).toBe('paused');

    // Resume execution via store
    useWorkspaceStore.getState().resumeActiveRun();
    const completedRun = await executionPromise;

    unsub();

    expect(completedRun).not.toBeNull();
    expect(completedRun?.status).toBe('success');
    expect(statuses).toContain('paused');
    expect(statuses).toContain('running');
  });
});

