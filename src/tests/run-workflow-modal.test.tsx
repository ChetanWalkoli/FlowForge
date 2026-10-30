import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../components/shell/AppShell';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import { executeNodeHandler } from '../engine';
import { defaultPersistenceAdapter } from '../persistence/indexeddb/indexeddb-adapter';
import { useWorkspaceStore } from '../store/workspace-store';

describe('Phase 5 Task 8 — Run Input Modal and Run Entry Points', () => {
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

  it('opens RunWorkflowModal from TopBar Run button, prefills trigger sampleInput, and displays expected schema fields', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    const topBar = screen.getByRole('banner', { name: 'Workspace top bar' });
    await user.click(within(topBar).getByRole('button', { name: /^Run$/i }));

    const dialog = screen.getByRole('dialog', {
      name: /Run Workflow: Expense approval/i,
    });
    expect(dialog).toBeInTheDocument();

    // Schema badges are shown
    const schemaRegion = within(dialog).getByLabelText(
      'Required trigger schema fields',
    );
    expect(schemaRegion).toHaveTextContent('amount: number');
    expect(schemaRegion).toHaveTextContent('requester: string');
    expect(schemaRegion).toHaveTextContent('department: string');

    // Textarea is prefilled with trigger sampleInput
    const textarea = within(dialog).getByLabelText(
      'Trigger input JSON',
    ) as HTMLTextAreaElement;
    expect(JSON.parse(textarea.value)).toEqual({
      amount: 4250,
      requester: 'ada@flowforge.dev',
      department: 'Core Platform',
    });

    expect(
      within(dialog).getByText('Trigger input matches schema'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Execute Workflow' }),
    ).toBeEnabled();
  });

  it('opens RunWorkflowModal from CommandPalette Run workflow action', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    await user.keyboard('{Control>}k{/Control}');
    const palette = screen.getByRole('dialog', { name: 'Command palette' });
    const searchInput = within(palette).getByLabelText('Search commands');
    await user.type(searchInput, 'Run workflow');

    await user.click(
      within(palette).getByRole('option', { name: /Run workflow\.\.\./i }),
    );

    expect(
      screen.queryByRole('dialog', { name: 'Command palette' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: /Run Workflow: Expense approval/i }),
    ).toBeInTheDocument();
  });

  it('validates malformed JSON and trigger schema errors inline, disables execution, and supports Reset to Sample Input', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    await user.click(screen.getByRole('button', { name: /^Run$/i }));
    const dialog = screen.getByRole('dialog', {
      name: /Run Workflow: Expense approval/i,
    });
    const textarea = within(dialog).getByLabelText('Trigger input JSON');
    const executeBtn = within(dialog).getByRole('button', {
      name: 'Execute Workflow',
    });

    // 1. Malformed JSON syntax
    fireEvent.change(textarea, { target: { value: '{ "amount": 500, ' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Invalid JSON syntax',
    );
    expect(executeBtn).toBeDisabled();

    // 2. Schema violation: missing required field and wrong primitive type
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          amount: 'invalid_number_type',
          requester: 'ada@flowforge.dev',
          department: 'Core Platform',
        }),
      },
    });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Trigger schema validation failed',
    );
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/amount/i);
    expect(executeBtn).toBeDisabled();

    // 3. Reset to Sample Input restores valid JSON and enables button
    await user.click(
      within(dialog).getByRole('button', { name: 'Reset to Sample Input' }),
    );
    expect(
      within(dialog).getByText('Trigger input matches schema'),
    ).toBeInTheDocument();
    expect(executeBtn).toBeEnabled();
  });

  it('allows editing JSON input, closes modal on Execute Workflow, and runs the workflow with the edited payload', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    await user.click(screen.getByRole('button', { name: /^Run$/i }));
    const dialog = screen.getByRole('dialog', {
      name: /Run Workflow: Expense approval/i,
    });
    const textarea = within(dialog).getByLabelText('Trigger input JSON');

    // Edit input so amount > 10,000 (triggers manual_review branch)
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify(
          {
            amount: 25000,
            requester: 'vp@flowforge.dev',
            department: 'Executive',
          },
          null,
          2,
        ),
      },
    });

    await user.click(
      within(dialog).getByRole('button', { name: 'Execute Workflow' }),
    );

    // Modal closes immediately
    expect(
      screen.queryByRole('dialog', {
        name: /Run Workflow: Expense approval/i,
      }),
    ).not.toBeInTheDocument();

    // Wait for workflow execution to complete with the custom payload
    await waitFor(() => {
      const activeRun = useWorkspaceStore.getState().activeRun;
      expect(activeRun).not.toBeNull();
      expect(activeRun?.status).toBe('success');
      expect(activeRun?.finalOutput).toEqual({
        decision: 'manual_review',
        routing: 'finance_committee',
        amount: 25000,
        requester: 'vp@flowforge.dev',
      });
    });
  });

  it('supports closing and cancelling the modal via Cancel button, Close button, and Escape key without executing', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    // 1. Close via Cancel button
    await user.click(screen.getByRole('button', { name: /^Run$/i }));
    let dialog = screen.getByRole('dialog', {
      name: /Run Workflow: Expense approval/i,
    });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('dialog', {
        name: /Run Workflow: Expense approval/i,
      }),
    ).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().activeRun).toBeNull();

    // 2. Close via Escape key
    await user.click(screen.getByRole('button', { name: /^Run$/i }));
    expect(
      screen.getByRole('dialog', { name: /Run Workflow: Expense approval/i }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', {
        name: /Run Workflow: Expense approval/i,
      }),
    ).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().activeRun).toBeNull();

    // 3. Close via header X button
    await user.click(screen.getByRole('button', { name: /^Run$/i }));
    dialog = screen.getByRole('dialog', {
      name: /Run Workflow: Expense approval/i,
    });
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Close run workflow dialog',
      }),
    );
    expect(
      screen.queryByRole('dialog', {
        name: /Run Workflow: Expense approval/i,
      }),
    ).not.toBeInTheDocument();
    expect(useWorkspaceStore.getState().activeRun).toBeNull();
  });

  it('disables and guards Run entry points while the workflow is already executing and supports Cancel Run from TopBar', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    let releaseRun!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });

    // Start an async execution that pauses on condition_1
    let runPromise!: Promise<unknown>;
    act(() => {
      runPromise = useWorkspaceStore
        .getState()
        .executeCurrentWorkflow(undefined, {
          nodeRunner: async (params) => {
            if (params.node.id === 'condition_1') {
              await gate;
            }
            return executeNodeHandler(params);
          },
        });
    });

    const topBar = screen.getByRole('banner', { name: 'Workspace top bar' });
    const runBtn = within(topBar).getByRole('button', { name: /^Run$/i });
    expect(runBtn).toBeDisabled();

    // Cancel Run button is visible in TopBar while executing
    const cancelBtn = within(topBar).getByRole('button', {
      name: 'Cancel active run',
    });
    expect(cancelBtn).toBeInTheDocument();

    // CommandPalette Run workflow item is disabled while executing
    await user.keyboard('{Control>}k{/Control}');
    const palette = screen.getByRole('dialog', { name: 'Command palette' });
    const runCmdOption = within(palette).getByRole('option', {
      name: /Run workflow \(Currently running\.\.\.\)/i,
    });
    expect(runCmdOption).toBeDisabled();
    await user.keyboard('{Escape}');

    // Click Cancel Run in TopBar and release gate
    await user.click(cancelBtn);
    releaseRun();
    await act(async () => {
      await runPromise;
    });

    expect(useWorkspaceStore.getState().activeRun?.status).toBe('cancelled');
    expect(runBtn).toBeEnabled();
  });
});

