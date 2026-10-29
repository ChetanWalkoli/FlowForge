import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../components/shell/AppShell';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import { useWorkspaceStore } from '../store/workspace-store';

describe('Phase 2 — Core Application Shell, Layout, and Navigation', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    useWorkspaceStore.setState({
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

  it('renders TopBar, NavigationSidebar, central canvas, ContextualInspector, and BottomDrawer', () => {
    render(<AppShell />);

    expect(
      screen.getByRole('banner', { name: 'Workspace top bar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', {
        name: 'Workspace navigation sidebar',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('main', { name: 'Workflow canvas workspace' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Contextual inspector' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', {
        name: 'Execution and validation drawer',
      }),
    ).toBeInTheDocument();
  });

  it('supports inline workflow renaming in TopBar and updates save status', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    const renameBtn = screen.getByRole('button', {
      name: /Rename workflow: Expense approval/i,
    });
    await user.click(renameBtn);

    const input = screen.getByRole('textbox', { name: 'Workflow name' });
    await user.clear(input);
    await user.type(input, 'Quarterly Budget Flow{Enter}');

    expect(
      screen.getByRole('button', {
        name: 'Rename workflow: Quarterly Budget Flow',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Status: Unsaved changes' }),
    ).toBeInTheDocument();
  });

  it('collapses and expands the left sidebar and right inspector', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    // Collapse left sidebar
    await user.click(
      screen.getByRole('button', { name: 'Collapse left sidebar' }),
    );
    expect(
      screen.getByRole('complementary', {
        name: 'Workspace navigation sidebar (collapsed)',
      }),
    ).toBeInTheDocument();

    // Expand left sidebar via rail icon
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(
      screen.getByRole('complementary', {
        name: 'Workspace navigation sidebar',
      }),
    ).toBeInTheDocument();

    // Collapse right inspector
    await user.click(
      screen.getAllByRole('button', { name: 'Collapse inspector' })[0],
    );
    expect(
      screen.getByRole('complementary', {
        name: 'Contextual inspector (collapsed)',
      }),
    ).toBeInTheDocument();

    // Expand right inspector
    await user.click(
      screen.getAllByRole('button', { name: 'Expand inspector' })[0],
    );
    expect(
      screen.getByRole('complementary', { name: 'Contextual inspector' }),
    ).toBeInTheDocument();
  });

  it('filters the Node Library by search query and shows empty state when no match', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    const searchInput = screen.getByLabelText('Search nodes');
    await user.type(searchInput, 'Condition');

    expect(
      screen.getByRole('button', { name: 'Add Condition node' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Trigger node' }),
    ).not.toBeInTheDocument();

    // Non-existent node search
    await user.clear(searchInput);
    await user.type(searchInput, 'xyznonexistent');
    expect(screen.getByText('No matching nodes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(
      screen.getByRole('button', { name: 'Add Trigger node' }),
    ).toBeInTheDocument();
  });

  it('switches sidebar tabs between Nodes, Templates, and Outline and loads a template', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    const sidebar = screen.getByRole('complementary', {
      name: 'Workspace navigation sidebar',
    });

    await user.click(within(sidebar).getByRole('tab', { name: /Templates/i }));
    const formTplBtn = screen.getByRole('button', {
      name: /Load template: Registration form validation/i,
    });
    await user.click(formTplBtn);

    expect(
      screen.getByRole('button', {
        name: /Rename workflow: Registration form validation/i,
      }),
    ).toBeInTheDocument();

    // Switch to Outline tab and select a node
    await user.click(within(sidebar).getByRole('tab', { name: /Outline/i }));
    await user.click(
      within(sidebar).getByRole('button', { name: 'Select node Email present?' }),
    );

    const inspector = screen.getByRole('complementary', {
      name: 'Contextual inspector',
    });
    expect(within(inspector).getByText('Email present?')).toBeInTheDocument();
    expect(
      within(inspector).getByText(/ID: cond_email/i),
    ).toBeInTheDocument();
  });

  it('updates ContextualInspector when selecting and deleting a node on canvas', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    const canvasNode = screen.getByRole('listitem', {
      name: /Workflow node: Auto-approve expense/i,
    });
    await user.click(canvasNode);

    const inspector = screen.getByRole('complementary', {
      name: 'Contextual inspector',
    });
    expect(
      within(inspector).getByText(/ID: action_approve/i),
    ).toBeInTheDocument();

    // Delete node from inspector
    await user.click(
      within(inspector).getByRole('button', { name: 'Delete Node' }),
    );
    expect(
      screen.queryByRole('listitem', {
        name: /Workflow node: Auto-approve expense/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('expands BottomDrawer, switches tabs, and focuses node when clicking a validation issue', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    // Add an unconnected Action node so a validation error is produced
    await user.click(screen.getByRole('button', { name: 'Add Action node' }));

    // Click Validate button in TopBar to open bottom drawer Validation tab
    await user.click(screen.getByRole('button', { name: /Validate/i }));

    const drawer = screen.getByRole('region', {
      name: 'Execution and validation drawer',
    });
    const issueBtn = within(drawer).getAllByRole('button', {
      name: /Focus issue:/i,
    })[0];
    await user.click(issueBtn);

    // Switch bottom drawer tabs
    await user.click(
      within(drawer).getByRole('tab', { name: /Output & Logs/i }),
    );
    expect(screen.getByText('No execution output yet')).toBeInTheDocument();

    await user.click(
      within(drawer).getByRole('tab', { name: /TraceLab Timeline/i }),
    );
    expect(screen.getByText('No recorded trace events')).toBeInTheDocument();

    await user.click(
      within(drawer).getByRole('tab', { name: /Testing Lab/i }),
    );
    expect(
      within(drawer).getByText(
        /Define input test cases, expected outputs, and branch coverage assertions/i,
      ),
    ).toBeInTheDocument();
  });

  it('opens Command Palette via Ctrl+K, searches commands, and executes selected command', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    await user.keyboard('{Control>}k{/Control}');
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    expect(dialog).toBeInTheDocument();

    const searchInput = within(dialog).getByLabelText('Search commands');
    await user.type(searchInput, 'Create blank workflow');

    await user.keyboard('{Enter}');
    expect(
      screen.queryByRole('dialog', { name: 'Command palette' }),
    ).not.toBeInTheDocument();

    // Canvas now shows the empty state ("Start with a trigger")
    expect(screen.getByText('Start with a trigger')).toBeInTheDocument();
  });
});
