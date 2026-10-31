import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  draftWorkflowFromPrompt,
  DRAFT_PROMPT_SUGGESTIONS,
} from '../features/generator/workflow-drafter';
import { WorkflowDocumentSchema } from '../schemas/workflow-schema';
import { validateWorkflow } from '../domain/validation/graph-validator';
import { GenerateWorkflowModal } from '../components/shell/GenerateWorkflowModal';
import { useWorkspaceStore } from '../store/workspace-store';

describe('Phase 7 Task 4 — Plain-English Workflow Drafter (FR-063)', () => {
  it('drafts a valid Expense Approval workflow matching extracted threshold and condition operator', () => {
    const prompt = 'Check if expense amount exceeds $2,500. If true route for executive approval, otherwise auto-approve.';
    const proposal = draftWorkflowFromPrompt(prompt);

    expect(proposal.matchedPattern).toBe('Approval Routing Pattern');
    expect(proposal.confidence).toBe('high');
    expect(proposal.summary.parametersExtracted.threshold).toBe(2500);
    expect(proposal.summary.parametersExtracted.operator).toBe('greaterThan');

    // Schema and graph validation check
    const parseResult = WorkflowDocumentSchema.safeParse(proposal.workflow);
    expect(parseResult.success).toBe(true);

    const validation = validateWorkflow(proposal.workflow);
    expect(validation.valid).toBe(true);
    expect(validation.errorsCount).toBe(0);

    // Verify nodes structure
    const types = proposal.workflow.nodes.map((n) => n.type);
    expect(types).toContain('trigger');
    expect(types).toContain('condition');
    expect(types).toContain('action');
    expect(types).toContain('end');

    // Verify condition node configuration
    const cond = proposal.workflow.nodes.find((n) => n.type === 'condition')!;
    expect(cond.config.operator).toBe('greaterThan');
    expect(cond.config.right?.kind === 'literal' ? cond.config.right.value : null).toBe(2500);
  });

  it('drafts a valid User Form Validation workflow checking email field presence', () => {
    const prompt = 'Validate incoming registration form. Check that email is provided. If true accept registration, otherwise reject.';
    const proposal = draftWorkflowFromPrompt(prompt);

    expect(proposal.matchedPattern).toBe('Data Validation Guard Pattern');
    expect(proposal.workflow.nodes.some((n) => n.type === 'condition')).toBe(true);

    const validation = validateWorkflow(proposal.workflow);
    expect(validation.valid).toBe(true);
    expect(validation.errorsCount).toBe(0);

    const trigger = proposal.workflow.nodes.find((n) => n.type === 'trigger')!;
    expect(trigger.config.inputSchema?.email).toBe('string');
  });

  it('drafts an Incident Alert Dispatcher with emergency channel routing', () => {
    const prompt = 'Inspect incoming alert severity. If severity equals critical, dispatch immediate Slack alert, otherwise log routine event.';
    const proposal = draftWorkflowFromPrompt(prompt);

    expect(proposal.matchedPattern).toBe('Alert & Incident Dispatch Pattern');
    const validation = validateWorkflow(proposal.workflow);
    expect(validation.valid).toBe(true);

    const cond = proposal.workflow.nodes.find((n) => n.type === 'condition')!;
    expect(cond.config.operator).toBe('equals');
    expect(cond.config.right?.kind === 'literal' ? cond.config.right.value : null).toBe('critical');
  });

  it('drafts a Data Pipeline with intermediate Transform node for normalization', () => {
    const prompt = 'Filter telemetry events where latency exceeds 750ms. Transform and flag high-latency anomalies.';
    const proposal = draftWorkflowFromPrompt(prompt);

    expect(proposal.matchedPattern).toBe('Data Pipeline & Transform Pattern');
    expect(proposal.summary.parametersExtracted.threshold).toBe(750);

    const nodeTypes = proposal.workflow.nodes.map((n) => n.type);
    expect(nodeTypes).toContain('trigger');
    expect(nodeTypes).toContain('transform');
    expect(nodeTypes).toContain('condition');
    expect(nodeTypes).toContain('action');
    expect(nodeTypes).toContain('end');

    const validation = validateWorkflow(proposal.workflow);
    expect(validation.valid).toBe(true);
  });

  it('drafts a Scheduled Batch workflow with Retry and Loop control flow', () => {
    const prompt = 'Run scheduled hourly sync. Fetch records with retry up to 3 attempts, loop through items, and finalize sync.';
    const proposal = draftWorkflowFromPrompt(prompt);

    expect(proposal.matchedPattern).toBe('Scheduled Batch & Resilience Pattern');
    const nodeTypes = proposal.workflow.nodes.map((n) => n.type);
    expect(nodeTypes).toContain('retry');
    expect(nodeTypes).toContain('loop');

    const validation = validateWorkflow(proposal.workflow);
    expect(validation.valid).toBe(true);
  });

  it('produces valid workflows for all suggestion templates', () => {
    for (const item of DRAFT_PROMPT_SUGGESTIONS) {
      const proposal = draftWorkflowFromPrompt(item.prompt);
      expect(proposal.workflow.nodes.length).toBeGreaterThanOrEqual(4);
      expect(proposal.workflow.edges.length).toBeGreaterThanOrEqual(3);

      const validation = validateWorkflow(proposal.workflow);
      expect(validation.valid).toBe(true);
      expect(validation.errorsCount).toBe(0);
    }
  });

  it('renders GenerateWorkflowModal, compiles from suggestion chip, and applies to canvas', async () => {
    const user = userEvent.setup();
    useWorkspaceStore.getState().createBlankWorkflow();
    useWorkspaceStore.getState().setGenerateWorkflowModalOpen(true);

    render(<GenerateWorkflowModal />);

    expect(
      screen.getByRole('heading', { name: 'Draft Workflow with Plain English' }),
    ).toBeInTheDocument();

    // Click Expense Approval suggestion chip
    const suggestionBtn = screen.getByRole('button', { name: 'Expense Approval' });
    await user.click(suggestionBtn);

    // Verify proposal preview appears
    await waitFor(() => {
      expect(screen.getByText('Approval Routing Pattern')).toBeInTheDocument();
      expect(screen.getByText('Generated Nodes')).toBeInTheDocument();
    });

    // Apply to canvas in Replace mode
    const applyBtn = screen.getByRole('button', { name: 'Apply to Canvas' });
    await user.click(applyBtn);

    // Verify modal is closed
    await waitFor(() => {
      expect(useWorkspaceStore.getState().generateWorkflowModalOpen).toBe(false);
    });

    // Verify current workflow in store has been replaced by drafted workflow
    const currentWf = useWorkspaceStore.getState().workflow;
    expect(currentWf.name).toMatch(/Expense Approval/);
    expect(currentWf.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it('supports Append to canvas mode without destroying existing workflow nodes', async () => {
    const user = userEvent.setup();
    useWorkspaceStore.getState().createBlankWorkflow();
    const initialNodeCount = useWorkspaceStore.getState().workflow.nodes.length; // 1 (Trigger)

    useWorkspaceStore.getState().setGenerateWorkflowModalOpen(true);
    render(<GenerateWorkflowModal />);

    // Type custom prompt
    const textarea = screen.getByLabelText(/Describe what you want to automate/i);
    await user.type(textarea, 'Check if score exceeds 90 points');

    const compileBtn = screen.getByRole('button', { name: 'Compile Workflow Draft' });
    await user.click(compileBtn);

    await waitFor(() => {
      expect(screen.getByText('General Rule & Decision Pattern')).toBeInTheDocument();
    });

    // Select Append to canvas radio
    const appendRadio = screen.getByLabelText('Append to canvas');
    await user.click(appendRadio);

    // Click Apply
    const applyBtn = screen.getByRole('button', { name: 'Apply to Canvas' });
    await user.click(applyBtn);

    // Store now has initial nodes + appended generated nodes
    const finalNodes = useWorkspaceStore.getState().workflow.nodes;
    expect(finalNodes.length).toBeGreaterThan(initialNodeCount + 3);
  });
});
