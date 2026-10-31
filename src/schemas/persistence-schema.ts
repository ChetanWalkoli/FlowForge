/**
 * FlowForge — Persistence Boundary Schemas for Revisions & Testing Lab Suites
 * Records read back from IndexedDB are treated as untrusted: anything that fails these
 * schemas is skipped (never crashes hydration) so corrupted rows degrade gracefully.
 */

import { z } from 'zod';
import type { WorkflowRevisionRecord } from '../domain/versioning/version-diff';
import type {
  WorkflowTestCase,
  WorkflowTestSuiteReport,
} from '../features/testing-lab/testing-lab';
import { WorkflowDocumentSchema } from './workflow-schema';

const NodeStatusSchema = z.enum([
  'pending',
  'running',
  'success',
  'failed',
  'skipped',
]);

export const WorkflowTestAssertionSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    kind: z.literal('status'),
    expectedStatus: z.enum(['success', 'failed']),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('outputFieldEquals'),
    fieldPath: z.string().min(1),
    expectedValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('branchSelected'),
    conditionNodeId: z.string().min(1),
    expectedHandle: z.enum(['true', 'false']),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('nodeStatus'),
    nodeId: z.string().min(1),
    expectedNodeStatus: NodeStatusSchema,
  }),
]);

export const WorkflowTestCaseSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  input: z.record(z.unknown()),
  assertions: z.array(WorkflowTestAssertionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Suite reports embed full run records; we validate the summary shape strictly and
 * keep the nested run records opaque (they were produced by our own engine).
 */
export const WorkflowTestSuiteReportSchema = z
  .object({
    workflowId: z.string().min(1),
    workflowRevision: z.number(),
    totalCases: z.number().int().nonnegative(),
    passedCases: z.number().int().nonnegative(),
    failedCases: z.number().int().nonnegative(),
    results: z.array(
      z
        .object({
          testCaseId: z.string().min(1),
          passed: z.boolean(),
          runRecord: z.object({ runId: z.string() }).passthrough(),
          assertionResults: z.array(z.unknown()),
        })
        .passthrough(),
    ),
    coverage: z
      .object({
        totalConditionBranches: z.number(),
        coveredBranchesCount: z.number(),
        coveragePercent: z.number(),
        perCondition: z.array(z.unknown()),
      })
      .passthrough(),
    completedAt: z.number(),
  })
  .passthrough();

export interface PersistedTestSuiteRecord {
  workflowId: string;
  testCases: WorkflowTestCase[];
  lastReport: WorkflowTestSuiteReport | null;
  updatedAt: string;
}

export const WorkflowRevisionRecordSchema = z.object({
  revisionId: z.string().min(1),
  workflowId: z.string().min(1),
  revisionNumber: z.number().int().positive(),
  status: z.enum(['draft', 'validated', 'tested', 'published']),
  note: z.string(),
  createdAt: z.string(),
  snapshot: WorkflowDocumentSchema,
});

export function parsePersistedRevision(
  raw: unknown,
): WorkflowRevisionRecord | null {
  const parsed = WorkflowRevisionRecordSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.snapshot.id !== parsed.data.workflowId) return null;
  return parsed.data as unknown as WorkflowRevisionRecord;
}

/**
 * Parses a persisted suite record. Individual invalid test cases are dropped rather than
 * discarding the whole suite; an invalid last report is reset to `null`.
 */
export function parsePersistedTestSuite(
  raw: unknown,
): PersistedTestSuiteRecord | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.workflowId !== 'string' || rec.workflowId.length === 0) {
    return null;
  }
  const workflowId = rec.workflowId;
  const rawCases = Array.isArray(rec.testCases) ? rec.testCases : [];
  const testCases: WorkflowTestCase[] = [];
  const seen = new Set<string>();
  for (const item of rawCases) {
    const parsed = WorkflowTestCaseSchema.safeParse(item);
    if (
      parsed.success &&
      parsed.data.workflowId === workflowId &&
      !seen.has(parsed.data.id)
    ) {
      seen.add(parsed.data.id);
      testCases.push(parsed.data as WorkflowTestCase);
    }
  }
  const reportCheck = WorkflowTestSuiteReportSchema.safeParse(rec.lastReport);
  const lastReport =
    reportCheck.success && reportCheck.data.workflowId === workflowId
      ? (rec.lastReport as WorkflowTestSuiteReport)
      : null;
  return {
    workflowId,
    testCases,
    lastReport,
    updatedAt:
      typeof rec.updatedAt === 'string' ? rec.updatedAt : new Date(0).toISOString(),
  };
}

