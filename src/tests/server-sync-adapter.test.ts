import { beforeEach, describe, expect, it } from 'vitest';
import {
  MemorySyncTransport,
  ServerSyncAdapter,
  type SyncStatus,
} from '../persistence/adapters/server-sync-adapter';
import type { PersistenceAdapter } from '../persistence/adapters/persistence-adapter';
import type { WorkflowDocument } from '../domain/types/workflow';
import type { WorkflowRevisionRecord } from '../domain/versioning/version-diff';
import type { PersistedTestSuiteRecord } from '../schemas/persistence-schema';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';

class MockLocalAdapter implements PersistenceAdapter {
  private workflows = new Map<string, WorkflowDocument>();
  private revisions: WorkflowRevisionRecord[] = [];
  private testSuites = new Map<string, PersistedTestSuiteRecord>();

  async listWorkflows(): Promise<WorkflowDocument[]> {
    return Array.from(this.workflows.values());
  }
  async getWorkflow(id: string): Promise<WorkflowDocument | null> {
    return this.workflows.get(id) ?? null;
  }
  async saveWorkflow(doc: WorkflowDocument): Promise<WorkflowDocument> {
    this.workflows.set(doc.id, structuredClone(doc));
    return structuredClone(doc);
  }
  async deleteWorkflow(id: string): Promise<void> {
    this.workflows.delete(id);
  }
  async listCustomTemplates(): Promise<WorkflowDocument[]> {
    return [];
  }
  async saveCustomTemplate(doc: WorkflowDocument): Promise<WorkflowDocument> {
    return doc;
  }
  async deleteCustomTemplate(): Promise<void> {}
  async listRuns() {
    return [];
  }
  async saveRun(): Promise<void> {}
  async listRevisions(workflowId: string): Promise<WorkflowRevisionRecord[]> {
    return this.revisions.filter((r) => r.workflowId === workflowId);
  }
  async saveRevision(record: WorkflowRevisionRecord): Promise<void> {
    this.revisions.push(structuredClone(record));
  }
  async getTestSuite(workflowId: string): Promise<PersistedTestSuiteRecord | null> {
    return this.testSuites.get(workflowId) ?? null;
  }
  async saveTestSuite(record: PersistedTestSuiteRecord): Promise<void> {
    this.testSuites.set(record.workflowId, structuredClone(record));
  }
  async getWorkspaceMeta() {
    return { key: 'workspace_meta' as const, updatedAt: new Date().toISOString() };
  }
  async saveWorkspaceMeta() {
    return { key: 'workspace_meta' as const, updatedAt: new Date().toISOString() };
  }
  async clearAll() {
    this.workflows.clear();
    this.revisions = [];
    this.testSuites.clear();
  }
}

describe('Phase 7 Task 5 — Server Synchronization Adapter (FR-059)', () => {
  let localAdapter: MockLocalAdapter;
  let transport: MemorySyncTransport;
  let syncAdapter: ServerSyncAdapter;

  beforeEach(() => {
    localAdapter = new MockLocalAdapter();
    transport = new MemorySyncTransport();
    syncAdapter = new ServerSyncAdapter({
      localAdapter,
      transport,
      authToken: 'ff_secret_token_123',
      conflictStrategy: 'revision-fork',
    });
  });

  it('performs local writes immediately and flushes queue to remote transport', async () => {
    const statuses: SyncStatus[] = [];
    syncAdapter.subscribeStatus((st) => statuses.push(st));

    const doc = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
    const saved = await syncAdapter.saveWorkflow(doc);

    expect(saved.id).toBe(doc.id);
    const inLocal = await localAdapter.getWorkflow(doc.id);
    expect(inLocal?.name).toBe(doc.name);

    // Queue flushed
    expect(syncAdapter.getQueueLength()).toBe(0);
    expect(syncAdapter.getStatus()).toBe('idle');

    // Remote pull should now have the synced document
    const pullRes = await transport.pullRemote(doc.id);
    expect(pullRes.ok).toBe(true);
    expect(pullRes.data?.workflow?.id).toBe(doc.id);
  });

  it('holds changes in queue when offline and flushes when setOnline(true) is invoked', async () => {
    syncAdapter.setOnline(false);
    expect(syncAdapter.getStatus()).toBe('offline');

    const doc = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
    await syncAdapter.saveWorkflow(doc);

    // Write succeeded locally despite being offline
    const inLocal = await localAdapter.getWorkflow(doc.id);
    expect(inLocal).toBeDefined();

    // Held in outbound queue
    expect(syncAdapter.getQueueLength()).toBe(1);

    // Reconnecting triggers queue flush
    syncAdapter.setOnline(true);
    await new Promise((r) => setTimeout(r, 20));

    expect(syncAdapter.getQueueLength()).toBe(0);
    expect(syncAdapter.getStatus()).toBe('idle');
  });

  it('resolves conflicts using revision-fork strategy to protect user edits', async () => {
    transport.simulateConflict = true;

    const doc = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
    doc.revision = 3;

    await syncAdapter.saveWorkflow(doc);

    // Forked revision was created in local adapter
    const allWorkflows = await localAdapter.listWorkflows();
    const forked = allWorkflows.find((w) => w.id === doc.id);
    expect(forked?.revision).toBe(4);
    expect(forked?.name).toContain('Forked Revision');
  });

  it('handles remote transport network errors gracefully without corrupting local data', async () => {
    transport.simulateNetworkError = true;

    const doc = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
    await syncAdapter.saveWorkflow(doc);

    // Local save succeeded
    const inLocal = await localAdapter.getWorkflow(doc.id);
    expect(inLocal).toBeDefined();

    // Adapter reported error and retained queue item for future retry
    expect(syncAdapter.getStatus()).toBe('error');
    expect(syncAdapter.getQueueLength()).toBe(1);
  });
});
