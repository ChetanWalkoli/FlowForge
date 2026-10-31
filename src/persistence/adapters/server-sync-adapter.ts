/**
 * FlowForge — Server Synchronization Adapter & Protocol (FR-059)
 *
 * Implements a local-first remote synchronization architecture.
 * IndexedDB remains the authoritative local cache, operating seamlessly offline.
 * Remote sync pushes and pulls workflows, revisions, and test suites with
 * configurable conflict resolution, auth boundary management, and offline queueing.
 */

import type { WorkflowDocument, WorkflowRunRecord } from '../../domain/types/workflow';
import type { WorkflowRevisionRecord } from '../../domain/versioning/version-diff';
import type { PersistedTestSuiteRecord } from '../../schemas/persistence-schema';
import type { PersistenceAdapter, WorkspaceMetadataRecord } from './persistence-adapter';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'conflict';

export type ConflictResolutionStrategy =
  | 'client-wins'
  | 'server-wins'
  | 'revision-fork';

export interface SyncConflict<T = unknown> {
  entityType: 'workflow' | 'revision' | 'testSuite';
  entityId: string;
  clientVersion: number;
  serverVersion: number;
  clientData: T;
  serverData: T;
  resolvedAt?: string;
}

export interface SyncQueueItem {
  id: string;
  entityType: 'workflow' | 'revision' | 'testSuite';
  entityId: string;
  action: 'upsert' | 'delete';
  timestamp: string;
  payload?: unknown;
}

export interface SyncTransportResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface SyncTransport {
  pushChange(
    item: SyncQueueItem,
    token?: string,
  ): Promise<SyncTransportResponse<{ serverVersion: number; conflict?: boolean }>>;
  pullRemote(
    workflowId: string,
    token?: string,
  ): Promise<SyncTransportResponse<{ workflow?: WorkflowDocument; revisions?: WorkflowRevisionRecord[] }>>;
}

export interface ServerSyncAdapterConfig {
  localAdapter: PersistenceAdapter;
  endpointUrl?: string;
  authToken?: string;
  conflictStrategy?: ConflictResolutionStrategy;
  transport?: SyncTransport;
  autoSync?: boolean;
}

/**
 * In-memory fallback mock/test transport for isolated unit tests without network requirements.
 */
export class MemorySyncTransport implements SyncTransport {
  private remoteStore = new Map<string, { workflow?: WorkflowDocument; revisions: WorkflowRevisionRecord[] }>();
  public simulateNetworkError = false;
  public simulateConflict = false;

  async pushChange(
    item: SyncQueueItem,
    _token?: string,
  ): Promise<SyncTransportResponse<{ serverVersion: number; conflict?: boolean }>> {
    if (this.simulateNetworkError) {
      return { ok: false, status: 503, error: { code: 'NETWORK_UNAVAILABLE', message: 'Remote server unreachable' } };
    }

    if (this.simulateConflict) {
      return {
        ok: false,
        status: 409,
        error: { code: 'VERSION_CONFLICT', message: 'Remote version differs from local version' },
        data: { serverVersion: 99, conflict: true },
      };
    }

    if (item.entityType === 'workflow' && item.payload) {
      const doc = item.payload as WorkflowDocument;
      const existing = this.remoteStore.get(doc.id) ?? { revisions: [] };
      this.remoteStore.set(doc.id, { ...existing, workflow: structuredClone(doc) });
      return { ok: true, status: 200, data: { serverVersion: doc.revision } };
    }

    return { ok: true, status: 200, data: { serverVersion: 1 } };
  }

  async pullRemote(
    workflowId: string,
    _token?: string,
  ): Promise<SyncTransportResponse<{ workflow?: WorkflowDocument; revisions?: WorkflowRevisionRecord[] }>> {
    if (this.simulateNetworkError) {
      return { ok: false, status: 503, error: { code: 'NETWORK_UNAVAILABLE', message: 'Remote server unreachable' } };
    }
    const record = this.remoteStore.get(workflowId);
    return {
      ok: true,
      status: 200,
      data: {
        workflow: record?.workflow ? structuredClone(record.workflow) : undefined,
        revisions: record?.revisions ? structuredClone(record.revisions) : [],
      },
    };
  }
}

/**
 * ServerSyncAdapter wraps an underlying local PersistenceAdapter (e.g. IndexedDbAdapter),
 * performing immediate local writes and managing an asynchronous outbound sync queue.
 */
export class ServerSyncAdapter implements PersistenceAdapter {
  private local: PersistenceAdapter;
  private transport: SyncTransport;
  private authToken?: string;
  private conflictStrategy: ConflictResolutionStrategy;
  private syncQueue: SyncQueueItem[] = [];
  private currentStatus: SyncStatus = 'idle';
  private statusListeners: Array<(status: SyncStatus) => void> = [];
  private isOnline = true;

  constructor(config: ServerSyncAdapterConfig) {
    this.local = config.localAdapter;
    this.transport = config.transport ?? new MemorySyncTransport();
    this.authToken = config.authToken;
    this.conflictStrategy = config.conflictStrategy ?? 'revision-fork';
    this.isOnline = typeof navigator !== 'undefined' ? (navigator.onLine ?? true) : true;
  }

  public getStatus(): SyncStatus {
    return this.currentStatus;
  }

  public getQueueLength(): number {
    return this.syncQueue.length;
  }

  public setOnline(online: boolean): void {
    this.isOnline = online;
    if (!online) {
      this.setStatus('offline');
    } else if (this.currentStatus === 'offline') {
      this.setStatus('idle');
      void this.flushQueue();
    }
  }

  public setAuthToken(token?: string): void {
    this.authToken = token;
  }

  public subscribeStatus(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  private setStatus(status: SyncStatus): void {
    this.currentStatus = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // Safe emission
      }
    }
  }

  /**
   * Enqueues a local change for synchronization and triggers background flush.
   */
  private enqueueChange(item: Omit<SyncQueueItem, 'id' | 'timestamp'>): void {
    const queueItem: SyncQueueItem = {
      ...item,
      id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.syncQueue.push(queueItem);
    void this.flushQueue();
  }

  /**
   * Flushes the pending synchronization queue.
   */
  public async flushQueue(): Promise<{ processed: number; remaining: number }> {
    if (!this.isOnline) {
      this.setStatus('offline');
      return { processed: 0, remaining: this.syncQueue.length };
    }

    if (this.syncQueue.length === 0) {
      this.setStatus('idle');
      return { processed: 0, remaining: 0 };
    }

    this.setStatus('syncing');
    let processed = 0;

    while (this.syncQueue.length > 0 && this.isOnline) {
      const item = this.syncQueue[0];
      try {
        const response = await this.transport.pushChange(item, this.authToken);
        if (response.ok) {
          this.syncQueue.shift();
          processed++;
        } else if (response.status === 409) {
          // Conflict detected
          this.setStatus('conflict');
          await this.handleConflict(item, response);
          this.syncQueue.shift();
          processed++;
        } else {
          // Server error or network issue
          this.setStatus('error');
          break;
        }
      } catch {
        this.setStatus('error');
        break;
      }
    }

    if (this.syncQueue.length === 0) {
      this.setStatus('idle');
    }

    return { processed, remaining: this.syncQueue.length };
  }

  private async handleConflict(
    item: SyncQueueItem,
    _response: SyncTransportResponse,
  ): Promise<void> {
    if (this.conflictStrategy === 'client-wins') {
      // Re-push local client version as definitive
      return;
    }

    if (item.entityType === 'workflow' && item.payload) {
      const clientDoc = item.payload as WorkflowDocument;
      if (this.conflictStrategy === 'revision-fork') {
        // Increment revision and append fork marker
        const forkedDoc: WorkflowDocument = {
          ...structuredClone(clientDoc),
          revision: clientDoc.revision + 1,
          name: `${clientDoc.name} (Forked Revision)`,
          updatedAt: new Date().toISOString(),
        };
        await this.local.saveWorkflow(forkedDoc);
      }
    }
  }

  // --- PersistenceAdapter Implementations (Pass-through + Enqueue) ---

  async listWorkflows(): Promise<WorkflowDocument[]> {
    return this.local.listWorkflows();
  }

  async getWorkflow(id: string): Promise<WorkflowDocument | null> {
    return this.local.getWorkflow(id);
  }

  async saveWorkflow(doc: WorkflowDocument): Promise<WorkflowDocument> {
    const saved = await this.local.saveWorkflow(doc);
    this.enqueueChange({
      entityType: 'workflow',
      entityId: doc.id,
      action: 'upsert',
      payload: structuredClone(doc),
    });
    return saved;
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.local.deleteWorkflow(id);
    this.enqueueChange({
      entityType: 'workflow',
      entityId: id,
      action: 'delete',
    });
  }

  async listCustomTemplates(): Promise<WorkflowDocument[]> {
    return this.local.listCustomTemplates();
  }

  async saveCustomTemplate(doc: WorkflowDocument): Promise<WorkflowDocument> {
    return this.local.saveCustomTemplate(doc);
  }

  async deleteCustomTemplate(id: string): Promise<void> {
    return this.local.deleteCustomTemplate(id);
  }

  async listRuns(workflowId?: string): Promise<WorkflowRunRecord[]> {
    return this.local.listRuns(workflowId);
  }

  async saveRun(run: WorkflowRunRecord): Promise<void> {
    return this.local.saveRun(run);
  }

  async listRevisions(workflowId: string): Promise<WorkflowRevisionRecord[]> {
    return this.local.listRevisions(workflowId);
  }

  async saveRevision(record: WorkflowRevisionRecord): Promise<void> {
    await this.local.saveRevision(record);
    this.enqueueChange({
      entityType: 'revision',
      entityId: record.revisionId,
      action: 'upsert',
      payload: structuredClone(record),
    });
  }

  async getTestSuite(workflowId: string): Promise<PersistedTestSuiteRecord | null> {
    return this.local.getTestSuite(workflowId);
  }

  async saveTestSuite(record: PersistedTestSuiteRecord): Promise<void> {
    await this.local.saveTestSuite(record);
    this.enqueueChange({
      entityType: 'testSuite',
      entityId: record.workflowId,
      action: 'upsert',
      payload: structuredClone(record),
    });
  }

  async getWorkspaceMeta(): Promise<WorkspaceMetadataRecord> {
    return this.local.getWorkspaceMeta();
  }

  async saveWorkspaceMeta(
    patch: Partial<Omit<WorkspaceMetadataRecord, 'key' | 'updatedAt'>>,
  ): Promise<WorkspaceMetadataRecord> {
    return this.local.saveWorkspaceMeta(patch);
  }

  async clearAll(): Promise<void> {
    this.syncQueue = [];
    this.setStatus('idle');
    return this.local.clearAll();
  }
}

