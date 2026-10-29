import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../components/shell/AppShell';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import { STARTER_TEMPLATES } from '../domain/fixtures/starter-templates';
import { defaultPersistenceAdapter } from '../persistence/indexeddb/indexeddb-adapter';
import {
  serializeWorkflowForExport,
  validateAndPreviewImport,
} from '../persistence/import-export';
import { useWorkspaceStore } from '../store/workspace-store';
import type { WorkflowDocument } from '../domain/types/workflow';

describe('Phase 4 — IndexedDB Persistence, Import/Export, Templates, and Onboarding', () => {
  beforeEach(async () => {
    await defaultPersistenceAdapter.clearAll();
    useWorkspaceStore.getState().loadWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    useWorkspaceStore.setState({
      savedWorkflows: [structuredClone(EXPENSE_APPROVAL_WORKFLOW)],
      customTemplates: [],
      isHydrated: true,
      onboardingDismissed: false,
      importModalOpen: false,
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

  it('persists workflows to IndexedDB, updates saveStatus, and recovers state across reloads', async () => {
    const store = useWorkspaceStore.getState();

    // Rename workflow and add a Transform node
    store.renameWorkflow('Persisted Expense Pipeline');
    store.addNodeByType('transform');
    expect(useWorkspaceStore.getState().saveStatus).toBe('unsaved');

    // Save to IndexedDB
    const ok = await useWorkspaceStore.getState().saveCurrentWorkflow();
    expect(ok).toBe(true);
    expect(useWorkspaceStore.getState().saveStatus).toBe('saved');

    // Verify directly in IndexedDB
    const storedList = await defaultPersistenceAdapter.listWorkflows();
    expect(storedList.some((w) => w.name === 'Persisted Expense Pipeline')).toBe(
      true,
    );

    // Simulate reload by resetting in-memory workflow to blank, then calling hydrateFromStorage()
    useWorkspaceStore.getState().createBlankWorkflow();
    expect(useWorkspaceStore.getState().workflow.name).toBe('Untitled workflow');

    await useWorkspaceStore.getState().hydrateFromStorage();
    expect(useWorkspaceStore.getState().workflow.name).toBe(
      'Persisted Expense Pipeline',
    );
    expect(useWorkspaceStore.getState().workflow.nodes).toHaveLength(6);
  });

  it('supports workflow library CRUD in the Saved tab (save multiple workflows, switch, and delete)', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    // Save initial workflow
    await act(async () => {
      await useWorkspaceStore.getState().saveCurrentWorkflow();
    });

    // Create a second workflow, rename, and save
    await act(async () => {
      useWorkspaceStore.getState().createBlankWorkflow();
      useWorkspaceStore.getState().renameWorkflow('Second Local Workflow');
      useWorkspaceStore.getState().addNodeByType('trigger');
      await useWorkspaceStore.getState().saveCurrentWorkflow();
    });

    // Open Saved tab in left sidebar
    const sidebar = screen.getByRole('complementary', {
      name: 'Workspace navigation sidebar',
    });
    await user.click(within(sidebar).getByRole('tab', { name: /Saved/i }));

    expect(
      within(sidebar).getByRole('button', {
        name: 'Open saved workflow: Second Local Workflow',
      }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('button', {
        name: 'Open saved workflow: Expense approval',
      }),
    ).toBeInTheDocument();

    // Switch back to Expense approval from Saved list
    await user.click(
      within(sidebar).getByRole('button', {
        name: 'Open saved workflow: Expense approval',
      }),
    );
    expect(useWorkspaceStore.getState().workflow.name).toBe('Expense approval');

    // Delete Second Local Workflow
    await user.click(
      within(sidebar).getByRole('button', {
        name: 'Delete saved workflow Second Local Workflow',
      }),
    );
    await waitFor(() => {
      expect(
        within(sidebar).queryByRole('button', {
          name: 'Open saved workflow: Second Local Workflow',
        }),
      ).not.toBeInTheDocument();
    });
  });

  it('exports versioned JSON (stripping any secret keys) and validates/previews JSON imports without auto-executing', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    // 1. Test export serialization & secret scrubbing
    const docWithSecret = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
    const triggerNode = docWithSecret.nodes.find((n) => n.type === 'trigger');
    if (triggerNode && triggerNode.type === 'trigger') {
      triggerNode.config.sampleInput = {
        amount: 500,
        requester: 'ada@flowforge.dev',
        apiKey: 'sk_live_should_be_stripped',
        password: 'super_secret_password',
      };
    }

    const exportedJson = serializeWorkflowForExport(docWithSecret);
    expect(exportedJson).toContain('"format": "flowforge.workflow"');
    expect(exportedJson).toContain('"formatVersion": 1');
    expect(exportedJson).not.toContain('sk_live_should_be_stripped');
    expect(exportedJson).not.toContain('super_secret_password');

    // 2. Test validateAndPreviewImport on broken edge reference
    const brokenDoc: WorkflowDocument = structuredClone(
      EXPENSE_APPROVAL_WORKFLOW,
    );
    brokenDoc.edges.push({
      id: 'edge_broken',
      source: 'non_existent_node',
      sourceHandle: 'next',
      target: 'end_1',
      targetHandle: 'in',
    });
    const brokenPreview = validateAndPreviewImport(JSON.stringify(brokenDoc));
    expect(brokenPreview.canCommit).toBe(false);
    expect(brokenPreview.schemaErrors[0]).toMatch(/BROKEN_EDGE_REFERENCE/);

    // 3. Test interactive ImportWorkflowModal preview and commit
    await act(async () => {
      useWorkspaceStore.getState().setImportModalOpen(true);
    });
    const dialog = await screen.findByRole('dialog', {
      name: /Import Workflow JSON/i,
    });

    const textarea = within(dialog).getByLabelText('Workflow JSON payload');

    // Paste invalid JSON first -> Confirm Import button stays disabled
    await user.type(textarea, '{{ invalid');
    expect(
      within(dialog).getByText(
        /Import rejected by schema or graph validation/i,
      ),
    ).toBeInTheDocument();
    const confirmBtn = within(dialog).getByRole('button', {
      name: 'Confirm Import',
    });
    expect(confirmBtn).toBeDisabled();

    // Now paste valid exported JSON
    await user.clear(textarea);
    const validImportDoc = {
      ...structuredClone(STARTER_TEMPLATES[2]), // Telemetry priority filter
      name: 'Imported Telemetry Flow',
    };
    // Set value directly via fireEvent/paste for speed and accuracy with JSON braces
    await user.click(textarea);
    await user.paste(JSON.stringify(validImportDoc));

    expect(
      within(dialog).getByText('Preview: Imported Telemetry Flow'),
    ).toBeInTheDocument();
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);

    // Verify imported workflow is committed as a new local workflow and activeRun is null (never auto-executed)
    await waitFor(() => {
      expect(useWorkspaceStore.getState().workflow.name).toBe(
        'Imported Telemetry Flow',
      );
    });
    expect(useWorkspaceStore.getState().workflow.id).toMatch(/^wf_import_/);
    expect(useWorkspaceStore.getState().activeRun).toBeNull();
  });

  it('validates all 4 starter templates and allows saving and deleting custom user templates', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    // Verify all 4 starter templates pass validation
    expect(STARTER_TEMPLATES).toHaveLength(4);
    for (const tpl of STARTER_TEMPLATES) {
      const preview = validateAndPreviewImport(JSON.stringify(tpl));
      expect(preview.canCommit).toBe(true);
      expect(preview.valid).toBe(true);
    }

    // Open Templates tab in sidebar
    const sidebar = screen.getByRole('complementary', {
      name: 'Workspace navigation sidebar',
    });
    await user.click(within(sidebar).getByRole('tab', { name: /Templates/i }));

    // Save current workflow as a custom template
    await user.click(
      within(sidebar).getByRole('button', {
        name: 'Save Current as Template',
      }),
    );

    expect(
      await within(sidebar).findByRole('button', {
        name: 'Load custom template: Expense approval (Template)',
      }),
    ).toBeInTheDocument();

    // Delete custom template
    await user.click(
      within(sidebar).getByRole('button', {
        name: 'Delete custom template Expense approval (Template)',
      }),
    );
    await waitFor(() => {
      expect(
        within(sidebar).queryByRole('button', {
          name: 'Load custom template: Expense approval (Template)',
        }),
      ).not.toBeInTheDocument();
    });
  });

  it('renders the onboarding quickstart banner and persists dismissal in IndexedDB', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    const banner = screen.getByRole('complementary', {
      name: 'Workflow quickstart guide',
    });
    expect(banner).toBeInTheDocument();
    expect(within(banner).getByText(/1\. Add:/i)).toBeInTheDocument();
    expect(within(banner).getByText(/2\. Connect:/i)).toBeInTheDocument();
    expect(within(banner).getByText(/3\. Configure:/i)).toBeInTheDocument();
    expect(within(banner).getByText(/4\. Run:/i)).toBeInTheDocument();

    await user.click(
      within(banner).getByRole('button', { name: 'Dismiss quickstart hint' }),
    );
    expect(
      screen.queryByRole('complementary', {
        name: 'Workflow quickstart guide',
      }),
    ).not.toBeInTheDocument();

    const meta = await defaultPersistenceAdapter.getWorkspaceMeta();
    expect(meta.onboardingDismissed).toBe(true);
  });
});
