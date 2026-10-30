import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../components/shell/AppShell';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import {
  FORM_VALIDATION_WORKFLOW,
  NOTIFICATION_FLOW_WORKFLOW,
} from '../domain/fixtures/starter-templates';
import { executeNodeHandler } from '../engine';
import { defaultPersistenceAdapter } from '../persistence/indexeddb/indexeddb-adapter';
import { useWorkspaceStore } from '../store/workspace-store';

describe('Phase 5 Task 9 — Runtime Visualization and TraceLab UI Integration', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await defaultPersistenceAdapter.clearAll();
    useWorkspaceStore.getState().loadWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    useWorkspaceStore.setState({
      savedWorkflows: [structuredClone(EXPENSE_APPROVAL_WORKFLOW)],
      customTemplates: [],
      isHydrated: true,
      onboardingDismissed: true,
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

  it('renders clean empty/no-run states in Canvas, ContextualInspector, and BottomDrawer before execution', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    // 1. Canvas nodes have idle execution status before any run
    const triggerCard = screen.getByRole('listitem', {
      name: /Workflow node: Expense submitted/i,
    });
    expect(triggerCard).toHaveAttribute('data-execution-status', 'idle');

    // 2. Selecting a node before execution shows "Node has not executed yet" in Inspector
    await user.click(triggerCard);
    const inspector = screen.getByRole('complementary', {
      name: 'Contextual inspector',
    });
    const traceSection = within(inspector).getByRole('region', {
      name: 'Node execution trace',
    });
    expect(traceSection).toHaveTextContent(/Node has not executed yet/i);
    expect(traceSection).toHaveTextContent(/Not Executed/i);

    // 3. Bottom drawer Output and Timeline tabs show empty states
    const drawer = screen.getByRole('region', {
      name: 'Execution and validation drawer',
    });
    await user.click(
      within(drawer).getByRole('tab', { name: /Output & Logs/i }),
    );
    expect(
      within(drawer).getByText('No execution output yet'),
    ).toBeInTheDocument();

    await user.click(
      within(drawer).getByRole('tab', { name: /TraceLab Timeline/i }),
    );
    expect(
      within(drawer).getByText('No recorded trace events'),
    ).toBeInTheDocument();
  });

  it('renders node statuses (success, skipped) and traversed vs skipped edge states on the canvas, and clears stale runtime UI when switching workflows', async () => {
    render(<AppShell />);

    await act(async () => {
      await useWorkspaceStore.getState().executeCurrentWorkflow({
        amount: 4250,
        requester: 'ada@flowforge.dev',
        department: 'Core Platform',
      });
    });

    // Executed nodes show 'success' status; non-taken branch shows 'skipped'
    const triggerCard = screen.getByRole('listitem', {
      name: /Workflow node: Expense submitted/i,
    });
    const conditionCard = screen.getByRole('listitem', {
      name: /Workflow node: Threshold check/i,
    });
    const approveCard = screen.getByRole('listitem', {
      name: /Workflow node: Auto-approve expense/i,
    });
    const reviewCard = screen.getByRole('listitem', {
      name: /Workflow node: Route to manual review/i,
    });
    const endCard = screen.getByRole('listitem', {
      name: /Workflow node: Decision complete/i,
    });

    expect(triggerCard).toHaveAttribute('data-execution-status', 'success');
    expect(conditionCard).toHaveAttribute('data-execution-status', 'success');
    expect(approveCard).toHaveAttribute('data-execution-status', 'success');
    expect(reviewCard).toHaveAttribute('data-execution-status', 'skipped');
    expect(endCard).toHaveAttribute('data-execution-status', 'success');

    // Condition node displays selected branch indicator on canvas card
    expect(conditionCard).toHaveTextContent('→ true');

    // Skipped node displays skip reason on canvas card
    expect(
      screen.getByTestId('node-skip-reason-action_review'),
    ).toBeInTheDocument();

    // Verify traversed vs skipped edge states in DOM
    const canvas = screen.getByRole('main', {
      name: 'Workflow canvas workspace',
    });
    const traversedEdges = canvas.querySelectorAll(
      '[data-edge-state="traversed"]',
    );
    const skippedEdges = canvas.querySelectorAll('[data-edge-state="skipped"]');
    expect(traversedEdges.length).toBeGreaterThan(0);
    expect(skippedEdges.length).toBeGreaterThan(0);

    // Switching workflows clears stale runtime decorations on the canvas
    act(() => {
      useWorkspaceStore.getState().loadWorkflow(FORM_VALIDATION_WORKFLOW);
    });

    const formTriggerCard = screen.getByRole('listitem', {
      name: /Workflow node: Form submitted/i,
    });
    expect(formTriggerCard).toHaveAttribute('data-execution-status', 'idle');
    expect(
      canvas.querySelectorAll('[data-edge-state="traversed"]').length,
    ).toBe(0);
  });

  it('displays selected node execution trace (input/output payloads, timing) and Condition explainability in ContextualInspector', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    await act(async () => {
      await useWorkspaceStore.getState().executeCurrentWorkflow({
        amount: 22000,
        requester: 'director@flowforge.dev',
        department: 'Finance',
      });
    });

    // Click Condition node on canvas to inspect its trace & condition explainability
    const conditionCard = screen.getByRole('listitem', {
      name: /Workflow node: Threshold check/i,
    });
    await user.click(conditionCard);

    const inspector = screen.getByRole('complementary', {
      name: 'Contextual inspector',
    });
    const traceSection = within(inspector).getByRole('region', {
      name: 'Node execution trace',
    });

    expect(traceSection).toHaveTextContent('success');
    expect(traceSection).toHaveTextContent('Node Input Payload');
    expect(traceSection).toHaveTextContent('Node Output Payload');

    // Condition explainability card shows expression, operands, operator, result, selected branch, and explanation
    const explainability = within(traceSection).getByLabelText(
      'Condition evaluation explainability',
    );
    expect(explainability).toHaveTextContent('Branch: false');
    expect(explainability).toHaveTextContent('22000');
    expect(explainability).toHaveTextContent('lessThanOrEqual');
    expect(explainability).toHaveTextContent('10000');
    expect(explainability).toHaveTextContent('false');
  });

  it('renders structured runtime errors on the failed canvas node, in ContextualInspector, and in BottomDrawer', async () => {
    render(<AppShell />);

    await act(async () => {
      await useWorkspaceStore.getState().executeCurrentWorkflow({
        amount: 'corrupted-amount',
        requester: 'ada@flowforge.dev',
        department: 'Engineering',
      });
    });

    // 1. Failed node on canvas shows data-execution-status="failed" and runtime error banner
    const triggerCard = screen.getByRole('listitem', {
      name: /Workflow node: Expense submitted/i,
    });
    expect(triggerCard).toHaveAttribute('data-execution-status', 'failed');
    expect(screen.getByTestId('node-runtime-error-trigger_1')).toHaveTextContent(
      /amount/i,
    );

    // 2. Inspector opens in 'error' mode showing the runtime error; switching to 'node' mode shows Node runtime error details
    const inspector = screen.getByRole('complementary', {
      name: 'Contextual inspector',
    });
    expect(inspector).toHaveTextContent('ERR_INVALID_TRIGGER_INPUT');

    act(() => {
      useWorkspaceStore.getState().setInspectorMode('node');
    });
    const nodeErrorCard = within(inspector).getByRole('alert', {
      name: 'Node runtime error details',
    });
    expect(nodeErrorCard).toHaveTextContent('ERR_INVALID_TRIGGER_INPUT');

    // 3. Bottom drawer opens on TraceLab Timeline tab with the failed event selected
    const drawer = screen.getByRole('region', {
      name: 'Execution and validation drawer',
    });
    const eventDetails = within(drawer).getByLabelText(
      'Selected trace event details',
    );
    expect(eventDetails).toHaveTextContent('run.failed');
    expect(eventDetails).toHaveTextContent('ERR_INVALID_TRIGGER_INPUT');
  });

  it('streams live execution updates while running and displays final output, appendLog entries, and interactive timeline events in BottomDrawer', async () => {
    const user = userEvent.setup();
    act(() => {
      useWorkspaceStore.getState().loadWorkflow(NOTIFICATION_FLOW_WORKFLOW);
    });
    render(<AppShell />);

    let releaseAction!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseAction = resolve;
    });

    // Start Notification workflow and pause mid-run so we can observe live 'running' state
    let runPromise!: Promise<unknown>;
    act(() => {
      runPromise = useWorkspaceStore.getState().executeCurrentWorkflow(
        {
          severity: 'critical',
          summary: 'TLS certificate expiring in 2h',
          owner: 'oncall-sre',
        },
        {
          nodeRunner: async (params) => {
            if (params.node.id === 'action_page') {
              await gate;
            }
            return executeNodeHandler(params);
          },
        },
      );
    });

    // While paused inside action_page, its canvas node status is 'running'
    await waitFor(() => {
      const runningCard = screen.getByRole('listitem', {
        name: /Workflow node: Dispatch urgent page/i,
      });
      expect(runningCard).toHaveAttribute('data-execution-status', 'running');
    });

    // Release gate to complete the workflow
    releaseAction();
    await act(async () => {
      await runPromise;
    });

    // BottomDrawer opens on Output & Logs tab showing finalOutput and execution logs
    const drawer = screen.getByRole('region', {
      name: 'Execution and validation drawer',
    });
    expect(
      within(drawer).getByText(/"channel": "pager_immediate"/),
    ).toBeInTheDocument();

    const logsRegion = within(drawer).getByLabelText('Execution logs');
    expect(logsRegion).toHaveTextContent(
      'Completed Dispatch urgent page',
    );

    // Switch to TraceLab Timeline tab and click an event to inspect its details
    await user.click(
      within(drawer).getByRole('tab', { name: /TraceLab Timeline/i }),
    );
    const timelineList = within(drawer).getByRole('list', {
      name: 'Chronological execution event timeline',
    });
    const branchEventBtn = within(timelineList).getByRole('listitem', {
      name: /branch\.selected/i,
    });
    await user.click(branchEventBtn);

    const selectedEventDetails = within(drawer).getByLabelText(
      'Selected trace event details',
    );
    expect(selectedEventDetails).toHaveTextContent('branch.selected');
    expect(selectedEventDetails).toHaveTextContent('critical');
  });
});
