/**
 * FlowForge — Local IndexedDB Persistence Adapter
 * Implements the PersistenceAdapter interface using IndexedDB (`idb`) with schema validation at boundaries.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  WorkflowDocument,
  WorkflowRunRecord,
} from '../../domain/types/workflow';
import type { WorkflowRevisionRecord } from '../../domain/versioning/version-diff';
import {
  parsePersistedRevision,
  parsePersistedTestSuite,
  WorkflowRevisionRecordSchema,
  type PersistedTestSuiteRecord,
} from '../../schemas/persistence-schema';
import { WorkflowDocumentSchema } from '../../schemas/workflow-schema';
import type {
  PersistenceAdapter,
  WorkspaceMetadataRecord,
} from '../adapters/persistence-adapter';

export const FLOWFORGE_DB_NAME = 'flowforge_studio_db';
export const FLOWFORGE_DB_VERSION = 2;

interface FlowForgeDBSchema extends DBSchema {
  workflows: {
    key: string;
    value: WorkflowDocument;
    indexes: { 'by-updated': string };
  };
  templates: {
    key: string;
    value: WorkflowDocument;
  };
  runs: {
    key: string;
    value: WorkflowRunRecord;
    indexes: { 'by-workflow': string };
  };
  revisions: {
    key: string;
    value: WorkflowRevisionRecord;
    indexes: { 'by-workflow': string };
  };
  testSuites: {
    key: string;
    value: PersistedTestSuiteRecord;
  };
  meta: {
    key: string;
    value: WorkspaceMetadataRecord;
  };
}

export class LocalIndexedDBAdapter implements PersistenceAdapter {
  private dbPromise: Promise<IDBPDatabase<FlowForgeDBSchema>> | null = null;

  private getDb(): Promise<IDBPDatabase<FlowForgeDBSchema>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<FlowForgeDBSchema>(
        FLOWFORGE_DB_NAME,
        FLOWFORGE_DB_VERSION,
        {
          upgrade(db) {
            if (!db.objectStoreNames.contains('workflows')) {
              const wfStore = db.createObjectStore('workflows', {
                keyPath: 'id',
              });
              wfStore.createIndex('by-updated', 'updatedAt');
            }
            if (!db.objectStoreNames.contains('templates')) {
              db.createObjectStore('templates', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('runs')) {
              const runStore = db.createObjectStore('runs', {
                keyPath: 'runId',
              });
              runStore.createIndex('by-workflow', 'workflowId');
            }
            if (!db.objectStoreNames.contains('revisions')) {
              const revStore = db.createObjectStore('revisions', {
                keyPath: 'revisionId',
              });
              revStore.createIndex('by-workflow', 'workflowId');
            }
            if (!db.objectStoreNames.contains('testSuites')) {
              db.createObjectStore('testSuites', { keyPath: 'workflowId' });
            }
            if (!db.objectStoreNames.contains('meta')) {
              db.createObjectStore('meta', { keyPath: 'key' });
            }
          },
        },
      );
    }
    return this.dbPromise;
  }

  async listWorkflows(): Promise<WorkflowDocument[]> {
    const db = await this.getDb();
    const all = await db.getAll('workflows');
    const validDocs: WorkflowDocument[] = [];
    for (const item of all) {
      const parsed = WorkflowDocumentSchema.safeParse(item);
      if (parsed.success) {
        validDocs.push(parsed.data as WorkflowDocument);
      }
    }
    return validDocs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getWorkflow(id: string): Promise<WorkflowDocument | null> {
    const db = await this.getDb();
    const doc = await db.get('workflows', id);
    if (!doc) return null;
    const parsed = WorkflowDocumentSchema.safeParse(doc);
    return parsed.success ? (parsed.data as WorkflowDocument) : null;
  }

  async saveWorkflow(doc: WorkflowDocument): Promise<WorkflowDocument> {
    const parsed = WorkflowDocumentSchema.safeParse(doc);
    if (!parsed.success) {
      throw new Error(
        `Cannot persist invalid workflow document: ${parsed.error.issues[0]?.message ?? 'Schema violation'}`,
      );
    }
    const db = await this.getDb();
    const cloned = structuredClone(parsed.data as WorkflowDocument);
    await db.put('workflows', cloned);
    return cloned;
  }

  async deleteWorkflow(id: string): Promise<void> {
    const db = await this.getDb();
    await db.delete('workflows', id);
  }

  async listCustomTemplates(): Promise<WorkflowDocument[]> {
    const db = await this.getDb();
    const all = await db.getAll('templates');
    const valid: WorkflowDocument[] = [];
    for (const item of all) {
      const parsed = WorkflowDocumentSchema.safeParse(item);
      if (parsed.success) {
        valid.push(parsed.data as WorkflowDocument);
      }
    }
    return valid;
  }

  async saveCustomTemplate(doc: WorkflowDocument): Promise<WorkflowDocument> {
    const parsed = WorkflowDocumentSchema.safeParse(doc);
    if (!parsed.success) {
      throw new Error(
        `Cannot save invalid template: ${parsed.error.issues[0]?.message ?? 'Schema violation'}`,
      );
    }
    const db = await this.getDb();
    const cloned = structuredClone(parsed.data as WorkflowDocument);
    await db.put('templates', cloned);
    return cloned;
  }

  async deleteCustomTemplate(id: string): Promise<void> {
    const db = await this.getDb();
    await db.delete('templates', id);
  }

  async listRuns(workflowId?: string): Promise<WorkflowRunRecord[]> {
    const db = await this.getDb();
    const all = workflowId
      ? await db.getAllFromIndex('runs', 'by-workflow', workflowId)
      : await db.getAll('runs');

    const deduplicated = new Map<string, WorkflowRunRecord>();
    for (const item of all) {
      if (
        item &&
        typeof item === 'object' &&
        typeof item.runId === 'string' &&
        item.runId.length > 0 &&
        typeof item.workflowId === 'string' &&
        item.workflowId.length > 0 &&
        typeof item.startedAt === 'number'
      ) {
        if (!workflowId || item.workflowId === workflowId) {
          deduplicated.set(item.runId, structuredClone(item));
        }
      }
    }

    return Array.from(deduplicated.values()).sort((a, b) => {
      if (b.startedAt !== a.startedAt) {
        return b.startedAt - a.startedAt;
      }
      return b.runId.localeCompare(a.runId);
    });
  }

  async saveRun(run: WorkflowRunRecord): Promise<void> {
    if (
      !run ||
      typeof run.runId !== 'string' ||
      run.runId.trim().length === 0 ||
      typeof run.workflowId !== 'string' ||
      run.workflowId.trim().length === 0
    ) {
      throw new Error('Cannot persist invalid workflow run record: missing runId or workflowId.');
    }
    const db = await this.getDb();
    await db.put('runs', structuredClone(run));
  }

  async listRevisions(workflowId: string): Promise<WorkflowRevisionRecord[]> {
    if (!workflowId || typeof workflowId !== 'string') return [];
    const db = await this.getDb();
    const all = await db.getAllFromIndex('revisions', 'by-workflow', workflowId);
    const validRevisions: WorkflowRevisionRecord[] = [];
    for (const item of all) {
      const parsed = parsePersistedRevision(item);
      if (parsed) {
        validRevisions.push(parsed);
      }
    }
    // Return newest revisions first (matches UI expectations)
    return validRevisions.sort((a, b) => b.revisionNumber - a.revisionNumber);
  }

  async saveRevision(record: WorkflowRevisionRecord): Promise<void> {
    const parsed = WorkflowRevisionRecordSchema.safeParse(record);
    if (!parsed.success) {
      throw new Error(
        `Cannot persist invalid workflow revision record: ${parsed.error.issues[0]?.message ?? 'Schema violation'}`,
      );
    }
    const db = await this.getDb();
    await db.put('revisions', structuredClone(record));
  }

  async getTestSuite(workflowId: string): Promise<PersistedTestSuiteRecord | null> {
    if (!workflowId || typeof workflowId !== 'string') return null;
    const db = await this.getDb();
    const raw = await db.get('testSuites', workflowId);
    if (!raw) return null;
    return parsePersistedTestSuite(raw);
  }

  async saveTestSuite(record: PersistedTestSuiteRecord): Promise<void> {
    if (!record || typeof record.workflowId !== 'string' || record.workflowId.trim().length === 0) {
      throw new Error('Cannot persist test suite record: missing or empty workflowId.');
    }
    const db = await this.getDb();
    await db.put('testSuites', structuredClone(record));
  }

  async getWorkspaceMeta(): Promise<WorkspaceMetadataRecord> {
    const db = await this.getDb();
    const existing = await db.get('meta', 'workspace_meta');
    if (existing) {
      return existing;
    }
    return {
      key: 'workspace_meta',
      onboardingDismissed: false,
      updatedAt: new Date().toISOString(),
    };
  }

  async saveWorkspaceMeta(
    patch: Partial<Omit<WorkspaceMetadataRecord, 'key' | 'updatedAt'>>,
  ): Promise<WorkspaceMetadataRecord> {
    const db = await this.getDb();
    const current = await this.getWorkspaceMeta();
    const updated: WorkspaceMetadataRecord = {
      ...current,
      ...patch,
      key: 'workspace_meta',
      updatedAt: new Date().toISOString(),
    };
    await db.put('meta', updated);
    return updated;
  }

  async clearAll(): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(
      ['workflows', 'templates', 'runs', 'revisions', 'testSuites', 'meta'],
      'readwrite',
    );
    await Promise.all([
      tx.objectStore('workflows').clear(),
      tx.objectStore('templates').clear(),
      tx.objectStore('runs').clear(),
      tx.objectStore('revisions').clear(),
      tx.objectStore('testSuites').clear(),
      tx.objectStore('meta').clear(),
      tx.done,
    ]);
  }
}

export const defaultPersistenceAdapter: PersistenceAdapter =
  new LocalIndexedDBAdapter();

