import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  PayloadViewer,
  Select,
  StatusBadge,
  ToastRegion,
} from '../components/ui';
import { App } from '../app/App';

describe('Precision Studio Reusable UI Primitives', () => {
  it('renders Button variants and handles click and disabled states', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { rerender } = render(
      <Button variant="primary" onClick={onClick}>
        Run Workflow
      </Button>,
    );

    const btn = screen.getByRole('button', { name: 'Run Workflow' });
    expect(btn).toHaveClass('ff-btn', 'ff-btn--primary');
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button variant="destructive" disabled onClick={onClick}>
        Delete
      </Button>,
    );
    const disabledBtn = screen.getByRole('button', { name: 'Delete' });
    expect(disabledBtn).toBeDisabled();
    await user.click(disabledBtn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders Input with accessible label, helper text, and validation error while preserving user value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <Input
        label="Threshold Amount"
        required
        defaultValue="10000"
        helperText="Maximum auto-approval amount"
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText('Threshold Amount');
    expect(input).toHaveValue('10000');
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByText('Maximum auto-approval amount')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '-50');
    expect(input).toHaveValue('-50');

    rerender(
      <Input
        label="Threshold Amount"
        required
        defaultValue="-50"
        error="Amount must be non-negative"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Amount must be non-negative',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveValue('-50');
  });

  it('renders Select with options and accessible label', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Select
        label="Operator"
        defaultValue="equals"
        onChange={onChange}
        options={[
          { value: 'equals', label: 'Equals' },
          { value: 'greaterThan', label: 'Greater Than' },
        ]}
      />,
    );

    const select = screen.getByLabelText('Operator');
    await user.selectOptions(select, 'greaterThan');
    expect(onChange).toHaveBeenCalled();
  });

  it('renders StatusBadge with semantic label and role="status" (never color alone)', () => {
    render(<StatusBadge status="failed" label="Node Failed" />);
    const badge = screen.getByRole('status', { name: 'Status: Node Failed' });
    expect(badge).toHaveTextContent('Node Failed');
    expect(badge).toHaveClass('ff-badge--danger');
  });

  it('renders EmptyState with title, description, shortcut hint, and action', () => {
    render(
      <EmptyState
        title="Start with a trigger"
        description="Add a trigger node to begin."
        shortcutHint="Press N"
        action={<Button variant="primary">Add Trigger</Button>}
      />,
    );

    expect(screen.getByText('Start with a trigger')).toBeInTheDocument();
    expect(screen.getByText('Press N')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add Trigger' }),
    ).toBeInTheDocument();
  });

  it('renders ConfirmDialog and supports confirm, cancel, and Escape key', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Delete node?"
        description="This action can be undone with Ctrl+Z."
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders PayloadViewer with JSON formatting and line-wrap toggle', async () => {
    const user = userEvent.setup();
    render(
      <PayloadViewer
        title="Node Output"
        payload={{ decision: 'approved', amount: 4250 }}
      />,
    );

    expect(screen.getByText('Node Output')).toBeInTheDocument();
    expect(screen.getByText(/"decision": "approved"/)).toBeInTheDocument();

    const wrapBtn = screen.getByRole('button', { name: /Disable line wrap/i });
    await user.click(wrapBtn);
    expect(
      screen.getByRole('button', { name: /Enable line wrap/i }),
    ).toBeInTheDocument();
  });

  it('renders ToastRegion and dismisses notifications', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(
      <ToastRegion
        toasts={[{ id: 't1', message: 'Workflow saved', tone: 'neutral' }]}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText('Workflow saved')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Dismiss notification' }),
    );
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });

  it('renders the AppShell workspace and interacts cleanly', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('FlowForge')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Rename workflow: Expense approval/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(
      screen.getByText(
        'Workflow "Expense approval" validated and queued for execution.',
      ),
    ).toBeInTheDocument();
  });
});

