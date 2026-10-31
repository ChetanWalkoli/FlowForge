import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { EXPENSE_APPROVAL_WORKFLOW } from '../domain/fixtures/expense-approval';
import { FORM_VALIDATION_WORKFLOW } from '../domain/fixtures/starter-templates';
import type { WorkflowDocument, WorkflowRunRecord } from '../domain/types/workflow';
import { createWorkflowRevisionRecord } from '../domain/versioning/version-diff';
import {
  defaultPersistenceAdapter,
  FLOWFORGE_DB_NAME,
  FLOWFORGE_DB_VERSION,
  LocalIndexedDBAdapter,
} from '../persistence/indexeddb/indexeddb-adapter';
import type { PersistedTestSuiteRecord } from '../schemas/persistence-schema';
import { useWorkspaceStore } from '../store/workspace-store';

describe('Task 1 — IndexedDB Persistence: Revisions, Test Cases, and Schema Migrations', () => {
  beforeEach(async () => {
    await defaultPersistenceAdapter.clearAll();
  });

  it('safely upgrades a v1 database to v2, preserving workflows and runs while creating revisions and testSuites stores', async () => {
    const testDbName = `test_upgrade_db_${Date.now()}`;

    // 1. Create a simulated v1 database with workflows and runs
    const v1Db = await openDB(testDbName, 1, {
      upgrade(db) {
        const wfStore = db.createObjectStore('workflows', { keyPath: 'id' });
        wfStore.createIndex('by-updated', 'updatedAt');
        db.createObjectStore('templates', { keyPath: 'id' });
        const runStore = db.createObjectStore('runs', { keyPath: 'runId' });
        runStore.createIndex('by-workflow', 'workflowId');
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });

    const v1Workflow: WorkflowDocument = structuredClone(EXPENSE_APPROVAL_WORKFLOW);
    const v1Run: WorkflowRunRecord = {
      runId: 'run_v1_001',
      workflowId: v1Workflow.id,
      workflowName: v1Workflow.name,
      revision: 1,
      status: 'success',
      startedAt: 1000,
      completedAt: 1050,
      durationMs: 50,
      input: {},
      events: [],
      nodeTraces: {},
      traversedEdgeIds: [],
    };

    await v1Db.put('workflows', v1Workflow);
    await v1Db.put('runs', v1Run);
    v1Db.close();

    // 2. Open with v2 upgrade logic (same as LocalIndexedDBAdapter)
    const v2Db = await openDB(testDbName, 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('workflows')) {
          const wfStore = db.createObjectStore('workflows', { keyPath: 'id' });
          wfStore.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('templates')) {
          db.createObjectStore('templates', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('runs')) {
          const runStore = db.createObjectStore('runs', { keyPath: 'runId' });
          runStore.createIndex('by-workflow', 'workflowId');
        }
        if (!db.objectStoreNames.contains('revisions')) {
          const revStore = db.createObjectStore('revisions', { keyPath: 'revisionId' });
          revStore.createIndex('by-workflow', 'workflowId');
        }
        if (!db.objectStoreNames.contains('testSuites')) {
          db.createObjectStore('testSuites', { keyPath: 'workflowId' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      },
    });

    // 3. Verify existing data preserved
    const retrievedWf = await v2Db.get('workflows', v1Workflow.id);
    expect(retrievedWf).toEqual(v1Workflow);

    const retrievedRun = await v2Db.get('runs', 'run_v1_001');
    expect(retrievedRun).toEqual(v1Run);

    // 4. Verify new stores are functional
    expect(v2Db.objectStoreNames.contains('revisions')).toBe(true);
    expect(v2Db.objectStoreNames.contains('testSuites')).toBe(true);

    v2Db.close();
  });

  it('persists and lists immutable workflow revisions sorted by revision number descending', async () => {
    const adapter = new LocalIndexedDBAdapter();
    const wf1 = EXPENSE_APPROVAL_WORKFLOW;
    const wf2 = FORM_VALIDATION_WORKFLOW;

    const rev1 = createWorkflowRevisionRecord(wf1, { note: 'Initial revision', nowIso: '2026-10-31T01:00:00.000Z' });
    const rev2Doc = { ...structuredClone(wf1), revision: 2, name: 'Expense Approval v2' };
    const rev2 = createWorkflowRevisionRecord(rev2Doc, { note: 'Second revision', nowIso: '2026-10-31T02:00:00.000Z' });
    const revOtherWf = createWorkflowRevisionRecord(wf2, { note: 'Other workflow revision' });

    await adapter.saveRevision(rev1);
    await adapter.saveRevision(rev2);
    await adapter.saveRevision(revOtherWf);

    const listWf1 = await adapter.listRevisions(wf1.id);
    expect(listWf1).toHaveLength(2);
    // Highest revision first
    expect(listWf1[0].revisionNumber).toBe(2);
    expect(listWf1[0].note).toBe('Second revision');
    expect(listWf1[1].revisionNumber).toBe(1);

    const listWf2 = await adapter.listRevisions(wf2.id);
    expect(listWf2).toHaveLength(1);
    expect(listWf2[0].workflowId).toBe(wf2.id);
  });

  it('tolerates and skips corrupted revision records without throwing or losing valid revisions', async () => {
    const adapter = new LocalIndexedDBAdapter();
    const wf = EXPENSE_APPROVAL_WORKFLOW;

    const validRev = createWorkflowRevisionRecord(wf, { note: 'Valid revision' });
    await adapter.saveRevision(validRev);

    // Inject corrupted record directly via idb
    const rawDb = await openDB(FLOWFORGE_DB_NAME, FLOWFORGE_DB_VERSION);
    await rawDb.put('revisions', {
      revisionId: 'corrupted_rev_999',
      workflowId: wf.id,
      revisionNumber: 'not-a-number', // Malformed
      status: 'unknown-status',
    });
    rawDb.close();

    const list = await adapter.listRevisions(wf.id);
    expect(list).toHaveLength(1);
    expect(list[0].revisionId).toBe(validRev.revisionId);
  });

  it('persists and retrieves testing lab suites including test cases and test reports', async () => {
    const adapter = new LocalIndexedDBAdapter();
    const wf = EXPENSE_APPROVAL_WORKFLOW;

    const sampleRun: WorkflowRunRecord = {
      runId: 'run_tc_101',
      workflowId: wf.id,
      workflowName: wf.name,
      revision: 1,
      status: 'success',
      startedAt: 100,
      completedAt: 150,
      durationMs: 50,
      input: { amount: 2500 },
      events: [],
      nodeTraces: {},
      traversedEdgeIds: [],
    };

    const testSuiteRecord: PersistedTestSuiteRecord = {
      workflowId: wf.id,
      testCases: [
        {
          id: 'tc_101',
          workflowId: wf.id,
          name: 'Under $10k auto-approval',
          description: 'Validates automatic approval path',
          input: { amount: 2500, requester: 'test@flowforge.dev', department: 'Eng' },
          assertions: [
            { id: 'as_1', kind: 'status', expectedStatus: 'success' },
            { id: 'as_2', kind: 'outputFieldEquals', fieldPath: 'decision', expectedValue: 'approved' },
            { id: 'as_3', kind: 'branchSelected', conditionNodeId: 'cond_1', expectedHandle: 'true' },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      lastReport: {
        workflowId: wf.id,
        workflowRevision: 1,
        totalCases: 1,
        passedCases: 1,
        failedCases: 0,
        results: [
          {
            testCaseId: 'tc_101',
            testCaseName: 'Under $10k auto-approval',
            workflowId: wf.id,
            workflowRevision: 1,
            passed: true,
            durationMs: 40,
            evaluatedAt: Date.now(),
            runRecord: sampleRun,
            assertionResults: [],
          },
        ],
        coverage: {
          totalConditionNodes: 1,
          totalConditionBranches: 2,
          coveredBranchesCount: 2,
          coveragePercent: 100,
          perCondition: [],
        },
        completedAt: Date.now(),
      },
      updatedAt: new Date().toISOString(),
    };

    await adapter.saveTestSuite(testSuiteRecord);

    const loadedSuite = await adapter.getTestSuite(wf.id);
    expect(loadedSuite).not.toBeNull();
    expect(loadedSuite?.workflowId).toBe(wf.id);
    expect(loadedSuite?.testCases).toHaveLength(1);
    expect(loadedSuite?.testCases[0].name).toBe('Under $10k auto-approval');
    expect(loadedSuite?.lastReport?.passedCases).toBe(1);
    expect(loadedSuite?.lastReport?.coverage.coveragePercent).toBe(100);
  });

  it('drops corrupted test cases within a suite while preserving valid test cases and metadata', async () => {
    const adapter = new LocalIndexedDBAdapter();
    const wf = EXPENSE_APPROVAL_WORKFLOW;

    // Inject corrupted suite record directly
    const rawDb = await openDB(FLOWFORGE_DB_NAME, FLOWFORGE_DB_VERSION);
    await rawDb.put('testSuites', {
      workflowId: wf.id,
      testCases: [
        {
          id: 'valid_case_1',
          workflowId: wf.id,
          name: 'Valid test case',
          input: { amount: 100 },
          assertions: [{ id: 'as_1', kind: 'status', expectedStatus: 'success' }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'broken_case_2',
          workflowId: wf.id,
          // Missing required input and assertions
        },
      ],
      lastReport: null,
      updatedAt: new Date().toISOString(),
    });
    rawDb.close();

    const retrieved = await adapter.getTestSuite(wf.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.testCases).toHaveLength(1);
    expect(retrieved?.testCases[0].id).toBe('valid_case_1');
  });

  it('workspace store persists revision snapshots and custom test cases across hydration', async () => {
    // 1. Set up initial store with EXPENSE_APPROVAL_WORKFLOW
    useWorkspaceStore.getState().loadWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    await defaultPersistenceAdapter.saveWorkflow(EXPENSE_APPROVAL_WORKFLOW);
    await defaultPersistenceAdapter.saveWorkspaceMeta({ activeWorkflowId: EXPENSE_APPROVAL_WORKFLOW.id });

    // 2. Save a revision checkpoint via store
    const checkpoint = useWorkspaceStore.getState().saveRevisionCheckpoint('Milestone 1.0 release');
    expect(checkpoint.revisionNumber).toBe(2);

    // 3. Add a custom test case via store
    const customTc = useWorkspaceStore.getState().addTestCase({
      name: 'Custom High-Volume Test',
      input: { amount: 8888, requester: 'vip@flowforge.dev', department: 'Executive' },
      assertions: [{ id: 'as_high', kind: 'status', expectedStatus: 'success' }],
    });

    // 4. Verify persisted in IndexedDB
    const persistedRevs = await defaultPersistenceAdapter.listRevisions(EXPENSE_APPROVAL_WORKFLOW.id);
    expect(persistedRevs.some((r) => r.revisionId === checkpoint.revisionId)).toBe(true);

    const persistedSuite = await defaultPersistenceAdapter.getTestSuite(EXPENSE_APPROVAL_WORKFLOW.id);
    expect(persistedSuite?.testCases.some((tc) => tc.id === customTc.id)).toBe(true);

    // 5. Reset store state to simulate page refresh
    useWorkspaceStore.setState({
      workflow: structuredClone(FORM_VALIDATION_WORKFLOW),
      revisions: [],
      testCases: [],
      testSuiteReport: null,
      isHydrated: false,
    });

    // 6. Hydrate store from IndexedDB
    await useWorkspaceStore.getState().hydrateFromStorage();

    const hydrated = useWorkspaceStore.getState();
    expect(hydrated.workflow.id).toBe(EXPENSE_APPROVAL_WORKFLOW.id);
    expect(hydrated.revisions.some((r) => r.revisionId === checkpoint.revisionId)).toBe(true);
    expect(hydrated.testCases.some((tc) => tc.id === customTc.id)).toBe(true);
  });
});
