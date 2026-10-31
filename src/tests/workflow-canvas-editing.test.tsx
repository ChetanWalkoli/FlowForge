import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../components/shell/AppShell';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import { MAX_UNDO_HISTORY, useWorkspaceStore } from '../store/workspace-store';

describe('Phase 3 — Workflow Canvas, Custom Nodes, Configuration Forms, and Editing', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    useWorkspaceStore.setState({
      isHydrated: true,
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
    });
  });

  it('renders React Flow canvas with custom nodes, typed handles, minimap, and canvas controls', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    // Verify all 5 Expense Approval nodes render on the React Flow canvas
    expect(
      screen.getByRole('listitem', {
        name: /Workflow node: Expense submitted \(Trigger\)/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', {
        name: /Workflow node: Threshold check \(<= \$10k\) \(Condition\)/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', {
        name: /Workflow node: Auto-approve expense \(Action\)/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', {
        name: /Workflow node: Route to manual review \(Action\)/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', {
        name: /Workflow node: Decision complete \(End\)/i,
      }),
    ).toBeInTheDocument();

    // Verify Condition node exposes both "true" and "false" labeled handles
    const conditionCard = screen.getByRole('listitem', {
      name: /Workflow node: Threshold check/i,
    });
    expect(within(conditionCard).getByText('true')).toBeInTheDocument();
    expect(within(conditionCard).getByText('false')).toBeInTheDocument();

    // Verify CanvasControls toolbar (zoom in/out, fit view, reset view, minimap toggle)
    const controls = screen.getByRole('toolbar', {
      name: 'Canvas navigation controls',
    });
    expect(within(controls).getByText('100%')).toBeInTheDocument();

    await user.click(within(controls).getByRole('button', { name: 'Zoom in' }));
    expect(within(controls).getByText('120%')).toBeInTheDocument();

    await user.click(
      within(controls).getByRole('button', { name: 'Reset view' }),
    );
    expect(within(controls).getByText('100%')).toBeInTheDocument();

    // Toggle minimap visibility
    const hideMinimapBtn = within(controls).getByRole('button', {
      name: 'Hide minimap',
    });
    await user.click(hideMinimapBtn);
    expect(
      within(controls).getByRole('button', { name: 'Show minimap' }),
    ).toBeInTheDocument();
  });

  it('creates all 5 MVP node types (Trigger, Condition, Action, Transform, End) with unique IDs', async () => {
    useWorkspaceStore.getState().createBlankWorkflow();
    render(<AppShell />);

    const mvpButtons = [
      'Add Trigger node',
      'Add Condition node',
      'Add Action node',
      'Add Transform node',
      'Add End node',
    ];

    for (const [index, label] of mvpButtons.entries()) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => {
        expect(useWorkspaceStore.getState().workflow.nodes).toHaveLength(index + 1);
      });
    }

    const nodes = useWorkspaceStore.getState().workflow.nodes;
    expect(nodes).toHaveLength(5);
    const uniqueIds = new Set(nodes.map((n) => n.id));
    expect(uniqueIds.size).toBe(5);
    expect(nodes.map((n) => n.type)).toEqual([
      'trigger',
      'condition',
      'action',
      'transform',
      'end',
    ]);
  });

  it('connects compatible ports, disconnects edges, and rejects invalid connections with clear feedback', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    // Add a new Transform node
    await user.click(screen.getByRole('button', { name: 'Add Transform node' }));
    const transformNode = useWorkspaceStore
      .getState()
      .workflow.nodes.find((n) => n.type === 'transform')!;
    expect(transformNode).toBeDefined();

    const inspector = screen.getByRole('complementary', {
      name: 'Contextual inspector',
    });

    // Attempt an invalid connection: connecting Transform output -> Trigger input
    const targetSelect = within(inspector).getByLabelText(
      'Connect to target node',
    );
    await user.selectOptions(targetSelect, 'trigger_1');
    await user.click(
      within(inspector).getByRole('button', { name: 'Connect' }),
    );

    // Should reject and show error toast
    expect(
      screen.getByText(
        /Trigger nodes are entry points and cannot receive incoming connections/i,
      ),
    ).toBeInTheDocument();

    // Now connect Transform output -> End node (valid connection)
    await user.selectOptions(targetSelect, 'end_1');
    await user.click(
      within(inspector).getByRole('button', { name: 'Connect' }),
    );

    await waitFor(() => {
      expect(
        useWorkspaceStore
          .getState()
          .workflow.edges.some(
            (e) => e.source === transformNode.id && e.target === 'end_1',
          ),
      ).toBe(true);
    });

    // Disconnect the newly created edge from the inspector
    const disconnectBtn = within(inspector).getByRole('button', {
      name: /Disconnect next to Decision complete/i,
    });
    await user.click(disconnectBtn);

    await waitFor(() => {
      expect(
        useWorkspaceStore
          .getState()
          .workflow.edges.some(
            (e) => e.source === transformNode.id && e.target === 'end_1',
          ),
      ).toBe(false);
    });
  });

  it('renders contextual configuration forms for Trigger, Condition, Action, Transform, and End nodes and validates inputs', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    const inspector = screen.getByRole('complementary', {
      name: 'Contextual inspector',
    });

    // 1. Select Trigger node and add an input schema field
    await user.click(
      screen.getByRole('listitem', {
        name: /Workflow node: Expense submitted/i,
      }),
    );
    const newFieldInput = within(inspector).getByLabelText(
      'New input schema field name',
    );
    await user.type(newFieldInput, 'currency');
    await user.click(
      within(inspector).getByRole('button', { name: 'Add Field' }),
    );
    const triggerNode = useWorkspaceStore
      .getState()
      .workflow.nodes.find((n) => n.id === 'trigger_1')!;
    if (triggerNode.type === 'trigger') {
      expect(triggerNode.config.inputSchema.currency).toBe('string');
    }

    // 2. Select Condition node and update operator and threshold
    await user.click(
      screen.getByRole('listitem', {
        name: /Workflow node: Threshold check/i,
      }),
    );
    const rightValInput = within(inspector).getByLabelText(
      'Right Comparison Value',
    );
    await user.clear(rightValInput);
    await user.type(rightValInput, '25000');

    const condNode = useWorkspaceStore
      .getState()
      .workflow.nodes.find((n) => n.id === 'condition_1')!;
    if (condNode.type === 'condition') {
      expect(condNode.config.right).toEqual({
        kind: 'literal',
        value: 25000,
      });
    }

    // Test inline validation error when clearing required Left Operand Field Path
    const leftPathInput = within(inspector).getByLabelText(
      'Left Operand Field Path',
    );
    await user.clear(leftPathInput);
    expect(
      within(inspector).getAllByText('Operand field path is required').length,
    ).toBeGreaterThanOrEqual(1);

    // Restore valid path
    await user.type(leftPathInput, 'amount');

    // 3. Select Action node and switch operation to setValue
    await user.click(
      screen.getByRole('listitem', {
        name: /Workflow node: Auto-approve expense/i,
      }),
    );
    const actionOpSelect = within(inspector).getByLabelText('Action Operation');
    await user.selectOptions(actionOpSelect, 'setValue');
    const targetKeyInput = within(inspector).getByLabelText('Target Key');
    expect(targetKeyInput).toHaveValue('result');

    // 4. Select End node and add a required output field
    await user.click(
      screen.getByRole('listitem', {
        name: /Workflow node: Decision complete/i,
      }),
    );
    const reqFieldInput = within(inspector).getByLabelText(
      'New required output field',
    );
    await user.type(reqFieldInput, 'approver');
    await user.click(within(inspector).getByRole('button', { name: 'Add' }));
    const endNode = useWorkspaceStore
      .getState()
      .workflow.nodes.find((n) => n.id === 'end_1')!;
    if (endNode.type === 'end') {
      expect(endNode.config.requiredFields).toContain('approver');
    }
  });

  it('supports multi-selection, node duplication, and copy/paste with fresh unique IDs and preserved internal edges', () => {
    const store = useWorkspaceStore.getState();

    // Multi-select condition_1 and action_approve (which have an internal edge edge_cond_true)
    store.selectNode('condition_1', false);
    store.selectNode('action_approve', true);
    expect(useWorkspaceStore.getState().selectedNodeIds).toEqual([
      'condition_1',
      'action_approve',
    ]);

    // Copy selection and paste
    const copiedCount = useWorkspaceStore.getState().copySelection();
    expect(copiedCount).toBe(2);

    const pastedNodes = useWorkspaceStore.getState().pasteClipboard();
    expect(pastedNodes).toHaveLength(2);
    expect(pastedNodes[0].id).not.toBe('condition_1');
    expect(pastedNodes[1].id).not.toBe('action_approve');

    // Verify internal edge between the two pasted nodes was also duplicated with fresh IDs
    const allEdges = useWorkspaceStore.getState().workflow.edges;
    const pastedInternalEdge = allEdges.find(
      (e) =>
        e.source === pastedNodes[0].id &&
        e.target === pastedNodes[1].id &&
        e.sourceHandle === 'true',
    );
    expect(pastedInternalEdge).toBeDefined();

    // Duplicate a single node
    useWorkspaceStore.getState().selectNode('trigger_1', false);
    const duplicated = useWorkspaceStore.getState().duplicateNodes();
    expect(duplicated).toHaveLength(1);
    expect(duplicated[0].name).toBe('Expense submitted (Copy)');
  });

  it('maintains bounded undo/redo history across node additions, config edits, positions, and deletions', () => {
    const initialCount = useWorkspaceStore.getState().workflow.nodes.length;

    // 1. Add a node
    const added = useWorkspaceStore.getState().addNodeByType('action');
    expect(useWorkspaceStore.getState().workflow.nodes).toHaveLength(
      initialCount + 1,
    );

    // 2. Move the node
    useWorkspaceStore
      .getState()
      .updateNodePosition(added.id, { x: 777, y: 888 });
    expect(
      useWorkspaceStore
        .getState()
        .workflow.nodes.find((n) => n.id === added.id)?.position,
    ).toEqual({ x: 777, y: 888 });

    // 3. Undo position change
    expect(useWorkspaceStore.getState().undo()).toBe(true);
    expect(
      useWorkspaceStore
        .getState()
        .workflow.nodes.find((n) => n.id === added.id)?.position,
    ).not.toEqual({ x: 777, y: 888 });

    // 4. Undo node addition
    expect(useWorkspaceStore.getState().undo()).toBe(true);
    expect(useWorkspaceStore.getState().workflow.nodes).toHaveLength(
      initialCount,
    );

    // 5. Redo node addition
    expect(useWorkspaceStore.getState().redo()).toBe(true);
    expect(useWorkspaceStore.getState().workflow.nodes).toHaveLength(
      initialCount + 1,
    );

    // 6. Verify bounded history cap (MAX_UNDO_HISTORY = 50)
    for (let i = 0; i < MAX_UNDO_HISTORY + 15; i++) {
      useWorkspaceStore
        .getState()
        .updateNodePosition('trigger_1', { x: 100 + i, y: 200 });
    }
    expect(useWorkspaceStore.getState().undoStack.length).toBeLessThanOrEqual(
      MAX_UNDO_HISTORY,
    );
  });
});
