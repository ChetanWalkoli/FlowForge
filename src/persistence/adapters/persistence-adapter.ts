/**
 * FlowForge — Persistence Adapter Contract
 * Defines the replaceable persistence boundary for local IndexedDB and future server adapters (ARCHITECTURE.md §2).
 */

import type { WorkflowDocument, WorkflowRunRecord } from '../../domain/types/workflow';

export interface WorkspaceMetadataRecord {
  key: 'workspace_meta';
  activeWorkflowId?: string;
  onboardingDismissed?: boolean;
  updatedAt: string;
}

export interface PersistenceAdapter {
  // Workflows CRUD (FR-052, FR-053)
  listWorkflows(): Promise<WorkflowDocument[]>;
  getWorkflow(id: string): Promise<WorkflowDocument | null>;
  saveWorkflow(doc: WorkflowDocument): Promise<WorkflowDocument>;
  deleteWorkflow(id: string): Promise<void>;

  // Custom User Templates (FR-062)
  listCustomTemplates(): Promise<WorkflowDocument[]>;
  saveCustomTemplate(doc: WorkflowDocument): Promise<WorkflowDocument>;
  deleteCustomTemplate(id: string): Promise<void>;

  // Execution Run History (FR-042)
  listRuns(workflowId?: string): Promise<WorkflowRunRecord[]>;
  saveRun(run: WorkflowRunRecord): Promise<void>;

  // Workspace session & onboarding metadata (FR-053, FR-061)
  getWorkspaceMeta(): Promise<WorkspaceMetadataRecord>;
  saveWorkspaceMeta(
    patch: Partial<Omit<WorkspaceMetadataRecord, 'key' | 'updatedAt'>>,
  ): Promise<WorkspaceMetadataRecord>;

  // Utility for tests / reset
  clearAll(): Promise<void>;
}

