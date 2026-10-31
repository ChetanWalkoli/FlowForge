import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from '../components/shell/AppShell';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import { STARTER_TEMPLATES } from '../domain/fixtures/starter-templates';
import { autoLayoutWorkflow } from '../domain/graph/auto-layout';
import type { WorkflowDocument, WorkflowNodeBase } from '../domain/types/workflow';
import {
  buildRestoredWorkflowRevision,
  compareWorkflowRevisions,
  createWorkflowRevisionRecord,
} from '../domain/versioning/version-diff';
import {
  createExecutionContext,
  EngineExecutionError,
  executeDelayNode,
  executeLoopNode,
  executeMergeNode,
  executeRetryNode,
  executeWorkflow,
} from '../engine';
import {
  calculateConditionBranchCoverage,
  evaluateTestAssertions,
  getDefaultTestCasesForWorkflow,
  runWorkflowTestSuite,
} from '../features/testing-lab/testing-lab';
import {
  compareWorkflowRuns,
  computePayloadDiff,
  replayRunAtEventIndex,
} from '../features/trace-lab/trace-replay';
import { defaultPersistenceAdapter } from '../persistence/indexeddb/indexeddb-adapter';
import { useWorkspaceStore } from '../store/workspace-store';

describe('Phase 6 & Phase 7 — TraceLab Replay, Testing Lab, Control-Flow & Versioning', () => {
  beforeEach(async () => {
    await defaultPersistenceAdapter.clearAll();
    useWorkspaceStore.getState().loadWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    useWorkspaceStore.setState({
      leftSidebarCollapsed: false,
      leftSidebarTab: 'nodes',
      rightInspectorCollapsed: false,
      inspectorMode: 'overview',
      bottomDrawerOpen: false,
      bottomDrawerTab: 'validation',
      commandPaletteOpen: false,
      importModalOpen: false,
      runInputModalOpen: false,
      onboardingDismissed: true,
      toasts: [],
    });
  });

  it('computes payload diffs, replays recorded trace events without re-running handlers, and compares two runs', async () => {
    // 1. Payload diffing (FR-041)
    const diff = computePayloadDiff(
      { amount: 500, status: 'pending', legacyFlag: true },
      { amount: 15000, status: 'pending', decision: 'manual_review' },
    );
    expect(diff.hasChanges).toBe(true);
    expect(diff.addedCount).toBe(1);
    expect(diff.modifiedCount).toBe(1);
    expect(diff.removedCount).toBe(1);
    expect(diff.unchangedCount).toBe(1);

    // 2. Execute two runs (true branch: amount <= 10000 vs false branch: amount > 10000)
    const autoApproveRun = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      input: {
        amount: 4250,
        requester: 'ada@flowforge.dev',
        department: 'Core Platform',
      },
    });
    const manualReviewRun = await executeWorkflow(EXPENSE_APPROVAL_WORKFLOW, {
      input: {
        amount: 15000,
        requester: 'grace@flowforge.dev',
        department: 'Infrastructure',
      },
    });

    expect(autoApproveRun.status).toBe('success');
    expect(manualReviewRun.status).toBe('success');

    // 3. Side-effect-free point-in-time replay (FR-043, FR-045)
    // At event index 0 (run.started), all nodes are still pending and no edges are traversed
    const replayAtStart = replayRunAtEventIndex(
      autoApproveRun,
      0,
      EXPENSE_APPROVAL_WORKFLOW.edges,
    );
    expect(replayAtStart.status).toBe('running');
    expect(replayAtStart.traversedEdgeIds).toHaveLength(0);
    expect(replayAtStart.nodeTraces.trigger_1.status).toBe('pending');
    expect(replayAtStart.finalOutput).toBeUndefined();

    // Find the event index where the condition branch is selected
    const branchEventIdx = autoApproveRun.events.findIndex(
      (e) => e.type === 'branch.selected',
    );
    expect(branchEventIdx).toBeGreaterThan(0);

    const replayAtBranch = replayRunAtEventIndex(
      autoApproveRun,
      branchEventIdx,
      EXPENSE_APPROVAL_WORKFLOW.edges,
    );
    expect(replayAtBranch.nodeTraces.trigger_1.status).toBe('success');
    expect(replayAtBranch.nodeTraces.condition_1.selectedHandleId).toBe('true');
    // End node has not executed yet at the condition branch step
    expect(replayAtBranch.nodeTraces.end_1.status).toBe('pending');

    // Replaying at null returns the complete run
    const replayFull = replayRunAtEventIndex(
      autoApproveRun,
      null,
      EXPENSE_APPROVAL_WORKFLOW.edges,
    );
    expect(replayFull.status).toBe('success');
    expect(replayFull.nodeTraces.end_1.status).toBe('success');

    // 4. Compare two runs (FR-044)
    const comparison = compareWorkflowRuns(
      manualReviewRun,
      autoApproveRun,
      EXPENSE_APPROVAL_WORKFLOW.nodes,
    );
    expect(comparison.baseRunId).toBe(manualReviewRun.runId);
    expect(comparison.targetRunId).toBe(autoApproveRun.runId);
    expect(comparison.branchDifferences).toHaveLength(1);
    expect(comparison.branchDifferences[0].changed).toBe(true);
    expect(comparison.branchDifferences[0].baseBranch).toBe('false');
    expect(comparison.branchDifferences[0].targetBranch).toBe('true');
    expect(comparison.finalOutputDiff.hasChanges).toBe(true);
  });

  it('auto-arranges workflow nodes into a deterministic left-to-right topological layout (FR-009)', () => {
    const scrambled: WorkflowDocument = {
      ...structuredClone(EXPENSE_APPROVAL_WORKFLOW),
      nodes: EXPENSE_APPROVAL_WORKFLOW.nodes.map((n) => ({
        ...structuredClone(n),
        position: { x: 999, y: 999 },
      })),
    };

    const arranged = autoLayoutWorkflow(scrambled);
    expect(arranged.nodes).toHaveLength(EXPENSE_APPROVAL_WORKFLOW.nodes.length);
    expect(arranged.edges).toEqual(EXPENSE_APPROVAL_WORKFLOW.edges);

    const triggerPos = arranged.nodes.find((n) => n.id === 'trigger_1')!
      .position;
    const conditionPos = arranged.nodes.find((n) => n.id === 'condition_1')!
      .position;
    const trueBranchPos = arranged.nodes.find(
      (n) => n.id === 'action_approve',
    )!.position;
    const falseBranchPos = arranged.nodes.find(
      (n) => n.id === 'action_review',
    )!.position;
    const endPos = arranged.nodes.find((n) => n.id === 'end_1')!.position;

    // Trigger -> Condition -> Actions -> End increases monotonically in X
    expect(triggerPos.x).toBeLessThan(conditionPos.x);
    expect(conditionPos.x).toBeLessThan(trueBranchPos.x);
    expect(trueBranchPos.x).toBe(falseBranchPos.x);
    expect(trueBranchPos.x).toBeLessThan(endPos.x);
    // True branch is placed above False branch
    expect(trueBranchPos.y).toBeLessThan(falseBranchPos.y);
  });

  it('creates immutable workflow revision records, computes structural diffs, and restores snapshots as new revision n + 1 (FR-056..FR-058)', () => {
    const v1Record = createWorkflowRevisionRecord(EXPENSE_APPROVAL_WORKFLOW, {
      note: 'Initial v1 baseline',
    });
    expect(v1Record.revisionNumber).toBe(1);

    // Mutate original object to verify snapshot immutability
    const modifiedDoc: WorkflowDocument = {
      ...structuredClone(EXPENSE_APPROVAL_WORKFLOW),
      revision: 2,
      nodes: [
        ...structuredClone(EXPENSE_APPROVAL_WORKFLOW.nodes).map((n) =>
          n.id === 'trigger_1' ? { ...n, name: 'Renamed Trigger' } : n,
        ),
        {
          id: 'node_delay_extra',
          type: 'delay',
          name: 'Extra Delay',
          version: 1,
          position: { x: 400, y: 400 },
          config: { label: 'Extra Delay', durationMs: 25 },
        },
      ],
    };

    const diffReport = compareWorkflowRevisions(v1Record.snapshot, modifiedDoc);
    expect(diffReport.hasChanges).toBe(true);
    expect(diffReport.addedNodes).toHaveLength(1);
    expect(diffReport.addedNodes[0].id).toBe('node_delay_extra');
    expect(diffReport.modifiedNodes).toHaveLength(1);
    expect(diffReport.modifiedNodes[0].nodeId).toBe('trigger_1');
    expect(diffReport.modifiedNodes[0].nameChanged).toBe(true);

    // Restore v1 on top of v2 -> produces revision 3
    const restoredV3 = buildRestoredWorkflowRevision(v1Record, 2);
    expect(restoredV3.revision).toBe(3);
    expect(restoredV3.nodes).toHaveLength(EXPENSE_APPROVAL_WORKFLOW.nodes.length);
    expect(restoredV3.nodes.find((n) => n.id === 'trigger_1')?.name).toBe(
      'Expense submitted',
    );
  });

  it('executes P1 control-flow node handlers (Delay, Retry, Loop, Merge) and enforces bounded retry/loop limits (FR-016, FR-033..FR-035)', () => {
    const context = createExecutionContext({
      items: ['alpha', 'beta', 'gamma'],
      passThrough: 42,
    });
    context.nodeOutputs.trigger_1 = {
      items: ['alpha', 'beta', 'gamma'],
      passThrough: 42,
    };

    // 1. Delay handler
    const delayNode: WorkflowNodeBase<'delay'> = {
      id: 'node_delay_test',
      type: 'delay',
      name: 'Bounded Delay',
      version: 1,
      position: { x: 0, y: 0 },
      config: { label: 'Bounded Delay', durationMs: 15 },
    };
    const delayResult = executeDelayNode({
      node: delayNode,
      context,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect(delayResult.nextHandleIds).toEqual(['next']);
    expect(delayResult.output).toMatchObject({
      passThrough: 42,
      delayedMs: 15,
    });

    // 2. Retry handler (succeeds when simulateFailuresBeforeSuccess < maxAttempts; throws ERR_RETRY_EXHAUSTED when >= maxAttempts)
    const retrySuccessNode: WorkflowNodeBase<'retry'> = {
      id: 'node_retry_ok',
      type: 'retry',
      name: 'Retry Policy',
      version: 1,
      position: { x: 0, y: 0 },
      config: {
        label: 'Retry Policy',
        maxAttempts: 3,
        backoffMs: 10,
        simulateFailuresBeforeSuccess: 2,
      },
    };
    const retryOkResult = executeRetryNode({
      node: retrySuccessNode,
      context,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect(retryOkResult.nextHandleIds).toEqual(['next']);
    expect(retryOkResult.output).toMatchObject({
      retryAttemptsUsed: 3,
      maxAttempts: 3,
      backoffMs: 10,
    });

    const retryFailNode: WorkflowNodeBase<'retry'> = {
      id: 'node_retry_exhausted',
      type: 'retry',
      name: 'Exhausted Retry',
      version: 1,
      position: { x: 0, y: 0 },
      config: {
        label: 'Exhausted Retry',
        maxAttempts: 2,
        backoffMs: 10,
        simulateFailuresBeforeSuccess: 2,
      },
    };
    expect(() =>
      executeRetryNode({
        node: retryFailNode,
        context,
        triggerNodeId: 'trigger_1',
        upstreamNodeId: 'trigger_1',
      }),
    ).toThrowError(EngineExecutionError);

    // 3. Loop handler (iterates over array & enforces maxIterations guard)
    const loopNode: WorkflowNodeBase<'loop'> = {
      id: 'node_loop_ok',
      type: 'loop',
      name: 'Bounded Loop',
      version: 1,
      position: { x: 0, y: 0 },
      config: {
        label: 'Bounded Loop',
        arraySource: { source: 'trigger', path: 'items' },
        maxIterations: 5,
        itemVariable: 'currentItem',
      },
    };
    const loopResult = executeLoopNode({
      node: loopNode,
      context,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect(loopResult.nextHandleIds).toEqual(['next']);
    expect(loopResult.output).toMatchObject({
      items: ['alpha', 'beta', 'gamma'],
      iterations: 3,
      maxIterations: 5,
      itemVariable: 'currentItem',
    });

    const loopExceededNode: WorkflowNodeBase<'loop'> = {
      id: 'node_loop_exceeded',
      type: 'loop',
      name: 'Exceeded Loop',
      version: 1,
      position: { x: 0, y: 0 },
      config: {
        label: 'Exceeded Loop',
        arraySource: { source: 'trigger', path: 'items' },
        maxIterations: 2,
        itemVariable: 'currentItem',
      },
    };
    expect(() =>
      executeLoopNode({
        node: loopExceededNode,
        context,
        triggerNodeId: 'trigger_1',
        upstreamNodeId: 'trigger_1',
      }),
    ).toThrowError(/exceeds configured maxIterations/i);

    // 4. Merge handler
    const mergeNode: WorkflowNodeBase<'merge'> = {
      id: 'node_merge_ok',
      type: 'merge',
      name: 'Converge Branches',
      version: 1,
      position: { x: 0, y: 0 },
      config: {
        label: 'Converge Branches',
        strategy: 'combineObjects',
        expectedBranches: 2,
      },
    };
    const mergeResult = executeMergeNode({
      node: mergeNode,
      context,
      triggerNodeId: 'trigger_1',
      upstreamNodeId: 'trigger_1',
    });
    expect(mergeResult.nextHandleIds).toEqual(['next']);
    expect(mergeResult.output).toMatchObject({
      passThrough: 42,
    });
  });

  it('runs the Testing Lab suite across starter templates and achieves 100% condition branch coverage (FR-046..FR-051)', async () => {
    const defaultCases = getDefaultTestCasesForWorkflow(
      EXPENSE_APPROVAL_WORKFLOW,
    );
    expect(defaultCases.length).toBeGreaterThanOrEqual(2);

    const suiteReport = await runWorkflowTestSuite(
      EXPENSE_APPROVAL_WORKFLOW,
      defaultCases,
    );
    expect(suiteReport.totalCases).toBe(defaultCases.length);
    expect(suiteReport.passedCases).toBe(defaultCases.length);
    expect(suiteReport.failedCases).toBe(0);
    expect(suiteReport.coverage.totalConditionNodes).toBe(1);
    expect(suiteReport.coverage.totalConditionBranches).toBe(2);
    expect(suiteReport.coverage.coveredBranchesCount).toBe(2);
    expect(suiteReport.coverage.coveragePercent).toBe(100);

    // Verify all 4 starter templates have passing default test suites with 100% branch coverage
    for (const template of STARTER_TEMPLATES) {
      const cases = getDefaultTestCasesForWorkflow(template);
      const report = await runWorkflowTestSuite(template, cases);
      expect(report.failedCases).toBe(0);
      expect(report.coverage.coveragePercent).toBe(100);
    }

    // Verify assertion failure detection
    const sampleRun = suiteReport.results[0].runRecord;
    const failedAssertions = evaluateTestAssertions(sampleRun, [
      {
        id: 'bad_field',
        kind: 'outputFieldEquals',
        fieldPath: 'decision',
        expectedValue: 'non_existent_decision',
      },
    ]);
    expect(failedAssertions[0].passed).toBe(false);

    // Verify coverage calculation when only one branch has run
    const partialCoverage = calculateConditionBranchCoverage(
      EXPENSE_APPROVAL_WORKFLOW,
      [sampleRun],
    );
    expect(partialCoverage.coveragePercent).toBe(50);
  });

  it('integrates TraceLab step replay, payload diffing, Testing Lab suite runner, and Version History in the UI', async () => {
    render(<AppShell />);

    await waitFor(() => {
      expect(useWorkspaceStore.getState().isHydrated).toBe(true);
    });

    // 1. Execute workflow twice (once with false branch amount: 15000, once with true branch amount: 4250)
    await act(async () => {
      await useWorkspaceStore.getState().executeCurrentWorkflow({
        amount: 15000,
        requester: 'grace@flowforge.dev',
        department: 'Infrastructure',
      });
    });
    await act(async () => {
      await useWorkspaceStore.getState().executeCurrentWorkflow({
        amount: 4250,
        requester: 'ada@flowforge.dev',
        department: 'Core Platform',
      });
    });

    // Switch bottom drawer to TraceLab Timeline
    const drawerTabs = screen.getByRole('tablist', {
      name: /Bottom drawer tabs/i,
    });
    fireEvent.click(
      within(drawerTabs).getByRole('tab', { name: /TraceLab Timeline/i }),
    );

    // Verify TraceLab replay toolbar is visible
    const replayToolbar = screen.getByRole('toolbar', {
      name: /TraceLab replay and comparison controls/i,
    });
    expect(
      within(replayToolbar).getByRole('button', { name: /Replay first step/i }),
    ).toBeInTheDocument();

    // Click "First" step button to enter replay mode at Step 1
    fireEvent.click(
      within(replayToolbar).getByRole('button', { name: /Replay first step/i }),
    );
    expect(
      within(replayToolbar).getByText(/Replay @ Step 1/i),
    ).toBeInTheDocument();

    // Step forward
    fireEvent.click(
      within(replayToolbar).getByRole('button', { name: /Replay next step/i }),
    );
    expect(
      within(replayToolbar).getByText(/Replay @ Step 2/i),
    ).toBeInTheDocument();

    // Return to Full Run
    fireEvent.click(
      within(replayToolbar).getByRole('button', {
        name: /Exit replay and show full run/i,
      }),
    );

    // Select previous run in "Compare with" dropdown
    const compareSelect = within(replayToolbar).getByLabelText(
      /Compare active run with previous run/i,
    ) as HTMLSelectElement;
    const previousRunOption = Array.from(compareSelect.options).find(
      (opt) => opt.value !== '',
    );
    expect(previousRunOption).toBeDefined();
    fireEvent.change(compareSelect, {
      target: { value: previousRunOption!.value },
    });

    const comparisonPanel = screen.getByLabelText(/Run comparison report/i);
    expect(
      within(comparisonPanel).getByText(/Branch Changes:/i),
    ).toBeInTheDocument();

    // 2. Select an executed Action node to verify Input -> Output Payload Diff in ContextualInspector
    act(() => {
      useWorkspaceStore.getState().selectNode('action_approve');
    });
    const inspector = screen.getByRole('complementary', {
      name: /Contextual inspector/i,
    });
    expect(
      within(inspector).getByLabelText(/Node payload diff/i),
    ).toBeInTheDocument();

    // 3. Switch to Testing Lab tab and run the Test Suite
    fireEvent.click(
      within(drawerTabs).getByRole('tab', { name: /Testing Lab/i }),
    );
    const testingLab = screen.getByLabelText(/Testing Lab workspace/i);
    const runSuiteBtn = within(testingLab).getByRole('button', {
      name: /Run Test Suite/i,
    });
    fireEvent.click(runSuiteBtn);

    await waitFor(() => {
      expect(
        within(testingLab).getByText(/Branch Coverage: 100% \(2\/2\)/i),
      ).toBeInTheDocument();
    });
    expect(within(testingLab).getByText(/2\/2 Passed/i)).toBeInTheDocument();

    // 4. Switch Inspector to Overview tab and test Version History snapshot & restore
    const inspectorTabs = within(inspector).getByRole('tablist', {
      name: /Inspector context modes/i,
    });
    fireEvent.click(
      within(inspectorTabs).getByRole('tab', { name: /^Overview/i }),
    );

    const versionSection = within(inspector).getByRole('region', {
      name: /Version history and snapshots/i,
    });
    expect(
      within(versionSection).getByText(/Version History \(v1\)/i),
    ).toBeInTheDocument();

    fireEvent.click(
      within(versionSection).getByRole('button', { name: /Save Snapshot/i }),
    );
    expect(
      within(versionSection).getByText(/Version History \(v2\)/i),
    ).toBeInTheDocument();

    const restoreBtn = within(versionSection).getByRole('button', {
      name: /Restore v1/i,
    });
    fireEvent.click(restoreBtn);
    expect(
      within(versionSection).getByText(/Version History \(v3\)/i),
    ).toBeInTheDocument();
  }, 25000);
});
