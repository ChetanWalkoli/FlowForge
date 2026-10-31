/**
 * FlowForge — Workflow Testing Lab, Assertions & Branch Coverage Engine
 * Pure TypeScript module (zero React, Zustand, or DOM dependencies).
 * Implements FR-046 through FR-051.
 */

import type {
  NodeStatus,
  RunStatus,
  WorkflowDocument,
  WorkflowRunRecord,
} from '../../domain/types/workflow';
import { executeWorkflow } from '../../engine';
import { resolveDotPath } from '../../engine/context';

export type WorkflowTestAssertion =
  | {
      id: string;
      kind: 'status';
      expectedStatus: 'success' | 'failed';
    }
  | {
      id: string;
      kind: 'outputFieldEquals';
      fieldPath: string;
      expectedValue: string | number | boolean | null;
    }
  | {
      id: string;
      kind: 'branchSelected';
      conditionNodeId: string;
      expectedHandle: 'true' | 'false';
    }
  | {
      id: string;
      kind: 'nodeStatus';
      nodeId: string;
      expectedNodeStatus: NodeStatus;
    };

export interface WorkflowTestCase {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  input: Record<string, unknown>;
  assertions: WorkflowTestAssertion[];
  createdAt: string;
  updatedAt: string;
}

export interface TestAssertionResult {
  assertion: WorkflowTestAssertion;
  passed: boolean;
  actualValue: unknown;
  expectedSummary: string;
  actualSummary: string;
  message: string;
}

export interface WorkflowTestCaseResult {
  testCaseId: string;
  testCaseName: string;
  workflowId: string;
  workflowRevision: number;
  passed: boolean;
  durationMs: number;
  runRecord: WorkflowRunRecord;
  assertionResults: TestAssertionResult[];
  evaluatedAt: number;
}

export interface ConditionBranchCoverageEntry {
  nodeId: string;
  nodeName: string;
  trueCovered: boolean;
  falseCovered: boolean;
}

export interface BranchCoverageReport {
  totalConditionNodes: number;
  totalConditionBranches: number;
  coveredBranchesCount: number;
  coveragePercent: number;
  perCondition: ConditionBranchCoverageEntry[];
}

export interface WorkflowTestSuiteReport {
  workflowId: string;
  workflowRevision: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  results: WorkflowTestCaseResult[];
  coverage: BranchCoverageReport;
  completedAt: number;
}

/**
 * Evaluates a list of test assertions against a completed `WorkflowRunRecord` (FR-047, FR-049).
 */
export function evaluateTestAssertions(
  runRecord: WorkflowRunRecord,
  assertions: WorkflowTestAssertion[],
): TestAssertionResult[] {
  return assertions.map((rawAssertion) => {
    const raw = rawAssertion as Record<string, unknown>;
    const kind = (raw.kind ?? raw.type) as string;

    switch (kind) {
      case 'status': {
        const expected = (raw.expectedStatus ?? raw.expected) as RunStatus;
        const actual = runRecord.status;
        const passed = actual === expected;
        return {
          assertion: rawAssertion,
          passed,
          actualValue: actual,
          expectedSummary: `run.status === "${expected}"`,
          actualSummary: `run.status === "${actual}"`,
          message: passed
            ? `Run status matched "${expected}".`
            : `Expected run status "${expected}", but received "${actual}".`,
        };
      }

      case 'outputFieldEquals': {
        const fieldPath = String(raw.fieldPath);
        const expectedVal = raw.expectedValue ?? raw.expected;
        let actual: unknown = undefined;
        try {
          if (
            runRecord.finalOutput !== null &&
            typeof runRecord.finalOutput === 'object'
          ) {
            actual = resolveDotPath(
              runRecord.finalOutput,
              fieldPath,
              {
                sourceLabel: 'finalOutput',
              },
            );
          } else if (fieldPath === '$value') {
            actual = runRecord.finalOutput;
          }
        } catch {
          actual = undefined;
        }

        const passed = Object.is(actual, expectedVal);
        const expectedStr = JSON.stringify(expectedVal);
        const actualStr =
          actual === undefined ? 'undefined' : JSON.stringify(actual);

        return {
          assertion: rawAssertion,
          passed,
          actualValue: actual,
          expectedSummary: `output.${fieldPath} === ${expectedStr}`,
          actualSummary: `output.${fieldPath} === ${actualStr}`,
          message: passed
            ? `Output field "${fieldPath}" equaled ${expectedStr}.`
            : `Expected output field "${fieldPath}" to equal ${expectedStr}, but got ${actualStr}.`,
        };
      }

      case 'branchSelected': {
        const condNodeId = String(raw.conditionNodeId);
        const expectedHandle = String(raw.expectedHandle ?? raw.expectedBranch);
        const condTrace = runRecord.nodeTraces[condNodeId];
        const actualBranch =
          condTrace?.selectedHandleId ??
          (condTrace?.conditionReason
            ? condTrace.conditionReason.result
              ? 'true'
              : 'false'
            : undefined);
        const passed = actualBranch === expectedHandle;
        return {
          assertion: rawAssertion,
          passed,
          actualValue: actualBranch ?? null,
          expectedSummary: `${condNodeId} branch === "${expectedHandle}"`,
          actualSummary: `${condNodeId} branch === "${actualBranch ?? 'none'}"`,
          message: passed
            ? `Condition "${condNodeId}" selected branch "${expectedHandle}".`
            : `Expected condition "${condNodeId}" to select "${expectedHandle}", but got "${actualBranch ?? 'not evaluated'}".`,
        };
      }

      case 'nodeStatus': {
        const nodeId = String(raw.nodeId);
        const expectedStatus = (raw.expectedNodeStatus ?? raw.expected) as NodeStatus;
        const trace = runRecord.nodeTraces[nodeId];
        const actualStatus: NodeStatus = trace?.status ?? 'pending';
        const passed = actualStatus === expectedStatus;
        return {
          assertion: rawAssertion,
          passed,
          actualValue: actualStatus,
          expectedSummary: `${nodeId}.status === "${expectedStatus}"`,
          actualSummary: `${nodeId}.status === "${actualStatus}"`,
          message: passed
            ? `Node "${nodeId}" finished with status "${expectedStatus}".`
            : `Expected node "${nodeId}" status "${expectedStatus}", but got "${actualStatus}".`,
        };
      }

      default: {
        return {
          assertion: rawAssertion,
          passed: false,
          actualValue: null,
          expectedSummary: 'Valid assertion kind',
          actualSummary: `Unknown (${kind})`,
          message: `Unknown or unhandled assertion kind "${kind}".`,
        };
      }
    }
  });
}

/**
 * Calculates condition branch coverage across a set of workflow run records (FR-050).
 */
export function calculateConditionBranchCoverage(
  workflow: WorkflowDocument,
  runRecords: WorkflowRunRecord[],
): BranchCoverageReport {
  const conditionNodes = workflow.nodes.filter((n) => n.type === 'condition');
  const perCondition: ConditionBranchCoverageEntry[] = conditionNodes.map(
    (condNode) => {
      let trueCovered = false;
      let falseCovered = false;

      for (const run of runRecords) {
        const trace = run.nodeTraces[condNode.id];
        const chosen =
          trace?.selectedHandleId ??
          (trace?.conditionReason
            ? trace.conditionReason.result
              ? 'true'
              : 'false'
            : undefined);
        if (chosen === 'true') trueCovered = true;
        if (chosen === 'false') falseCovered = true;
      }

      return {
        nodeId: condNode.id,
        nodeName: condNode.name,
        trueCovered,
        falseCovered,
      };
    },
  );

  const totalConditionNodes = conditionNodes.length;
  const totalConditionBranches = totalConditionNodes * 2;
  const coveredBranchesCount = perCondition.reduce(
    (sum, item) => sum + (item.trueCovered ? 1 : 0) + (item.falseCovered ? 1 : 0),
    0,
  );
  const coveragePercent =
    totalConditionBranches === 0
      ? 100
      : Math.round((coveredBranchesCount / totalConditionBranches) * 100);

  return {
    totalConditionNodes,
    totalConditionBranches,
    coveredBranchesCount,
    coveragePercent,
    perCondition,
  };
}

/**
 * Executes a single test case against a workflow document and evaluates all assertions (FR-048).
 */
export async function runSingleWorkflowTestCase(
  workflow: WorkflowDocument,
  testCase: WorkflowTestCase,
): Promise<WorkflowTestCaseResult> {
  const started = Date.now();
  const runRecord = await executeWorkflow(workflow, {
    input: structuredClone(testCase.input),
  });
  const assertionResults = evaluateTestAssertions(
    runRecord,
    testCase.assertions,
  );
  const passed =
    assertionResults.length > 0
      ? assertionResults.every((r) => r.passed)
      : runRecord.status === 'success';

  return {
    testCaseId: testCase.id,
    testCaseName: testCase.name,
    workflowId: workflow.id,
    workflowRevision: workflow.revision,
    passed,
    durationMs: runRecord.durationMs ?? Math.max(0, Date.now() - started),
    runRecord,
    assertionResults,
    evaluatedAt: Date.now(),
  };
}

/**
 * Runs an entire test suite against a workflow revision and computes branch coverage (FR-048, FR-050, FR-051).
 */
export async function runWorkflowTestSuite(
  workflow: WorkflowDocument,
  testCases: WorkflowTestCase[],
): Promise<WorkflowTestSuiteReport> {
  const results: WorkflowTestCaseResult[] = [];
  for (const tc of testCases) {
    const res = await runSingleWorkflowTestCase(workflow, tc);
    results.push(res);
  }

  const passedCases = results.filter((r) => r.passed).length;
  const failedCases = results.length - passedCases;
  const coverage = calculateConditionBranchCoverage(
    workflow,
    results.map((r) => r.runRecord),
  );

  return {
    workflowId: workflow.id,
    workflowRevision: workflow.revision,
    totalCases: results.length,
    passedCases,
    failedCases,
    results,
    coverage,
    completedAt: Date.now(),
  };
}

/**
 * Generates curated default test suites for the 4 starter templates (covering both true & false
 * conditional branches) or a sensible default test case for any custom workflow (FR-046, FR-060).
 */
export function getDefaultTestCasesForWorkflow(
  workflow: WorkflowDocument,
): WorkflowTestCase[] {
  const now = '2026-10-30T00:00:00.000Z';

  if (workflow.id === 'wf_expense_approval') {
    return [
      {
        id: 'tc_expense_low_approve',
        workflowId: workflow.id,
        name: 'Low-value expense auto-approval (<= $10k)',
        description:
          'Verifies that expenses at or below $10,000 take the true branch and auto-approve.',
        input: {
          amount: 4250,
          requester: 'ada@flowforge.dev',
          department: 'Core Platform',
        },
        assertions: [
          { id: 'a1', kind: 'status', expectedStatus: 'success' },
          {
            id: 'a2',
            kind: 'branchSelected',
            conditionNodeId: 'condition_1',
            expectedHandle: 'true',
          },
          {
            id: 'a3',
            kind: 'outputFieldEquals',
            fieldPath: 'decision',
            expectedValue: 'approved',
          },
          {
            id: 'a4',
            kind: 'nodeStatus',
            nodeId: 'action_review',
            expectedNodeStatus: 'skipped',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tc_expense_high_review',
        workflowId: workflow.id,
        name: 'High-value expense manual review (> $10k)',
        description:
          'Verifies that expenses above $10,000 take the false branch and route to manual review.',
        input: {
          amount: 18500,
          requester: 'grace@flowforge.dev',
          department: 'Infrastructure',
        },
        assertions: [
          { id: 'b1', kind: 'status', expectedStatus: 'success' },
          {
            id: 'b2',
            kind: 'branchSelected',
            conditionNodeId: 'condition_1',
            expectedHandle: 'false',
          },
          {
            id: 'b3',
            kind: 'outputFieldEquals',
            fieldPath: 'decision',
            expectedValue: 'manual_review',
          },
          {
            id: 'b4',
            kind: 'nodeStatus',
            nodeId: 'action_approve',
            expectedNodeStatus: 'skipped',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  if (workflow.id === 'wf_form_validation') {
    return [
      {
        id: 'tc_form_valid_email',
        workflowId: workflow.id,
        name: 'Valid registration with email present',
        input: {
          email: 'grace@flowforge.dev',
          fullName: 'Grace Hopper',
          role: 'developer',
        },
        assertions: [
          { id: 'f1', kind: 'status', expectedStatus: 'success' },
          {
            id: 'f2',
            kind: 'branchSelected',
            conditionNodeId: 'cond_email',
            expectedHandle: 'true',
          },
          {
            id: 'f3',
            kind: 'outputFieldEquals',
            fieldPath: 'valid',
            expectedValue: true,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tc_form_missing_email',
        workflowId: workflow.id,
        name: 'Rejected registration when email is empty',
        input: {
          email: '',
          fullName: 'Anonymous User',
          role: 'guest',
        },
        assertions: [
          { id: 'f4', kind: 'status', expectedStatus: 'success' },
          {
            id: 'f5',
            kind: 'branchSelected',
            conditionNodeId: 'cond_email',
            expectedHandle: 'false',
          },
          {
            id: 'f6',
            kind: 'outputFieldEquals',
            fieldPath: 'valid',
            expectedValue: false,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  if (workflow.id === 'wf_data_filtering') {
    return [
      {
        id: 'tc_telemetry_breach',
        workflowId: workflow.id,
        name: 'SLA breach latency (> 500ms)',
        input: {
          service: 'checkout-api',
          latencyMs: 820,
          region: 'us-east',
        },
        assertions: [
          { id: 'd1', kind: 'status', expectedStatus: 'success' },
          {
            id: 'd2',
            kind: 'branchSelected',
            conditionNodeId: 'cond_latency',
            expectedHandle: 'true',
          },
          {
            id: 'd3',
            kind: 'outputFieldEquals',
            fieldPath: 'classification',
            expectedValue: 'sla_breach',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tc_telemetry_normal',
        workflowId: workflow.id,
        name: 'Healthy latency sample (<= 500ms)',
        input: {
          service: 'checkout-api',
          latencyMs: 140,
          region: 'us-east',
        },
        assertions: [
          { id: 'd4', kind: 'status', expectedStatus: 'success' },
          {
            id: 'd5',
            kind: 'branchSelected',
            conditionNodeId: 'cond_latency',
            expectedHandle: 'false',
          },
          {
            id: 'd6',
            kind: 'outputFieldEquals',
            fieldPath: 'classification',
            expectedValue: 'normal',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  if (workflow.id === 'wf_notification_flow') {
    return [
      {
        id: 'tc_notify_critical',
        workflowId: workflow.id,
        name: 'Critical incident dispatches urgent page',
        input: {
          severity: 'critical',
          summary: 'Database replica lag elevated',
          owner: 'oncall-sre',
        },
        assertions: [
          { id: 'n1', kind: 'status', expectedStatus: 'success' },
          {
            id: 'n2',
            kind: 'branchSelected',
            conditionNodeId: 'cond_severity',
            expectedHandle: 'true',
          },
          {
            id: 'n3',
            kind: 'outputFieldEquals',
            fieldPath: 'channel',
            expectedValue: 'pager_immediate',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tc_notify_standard',
        workflowId: workflow.id,
        name: 'Non-critical incident queues daily digest',
        input: {
          severity: 'minor',
          summary: 'Disk usage above 70%',
          owner: 'platform-ops',
        },
        assertions: [
          { id: 'n4', kind: 'status', expectedStatus: 'success' },
          {
            id: 'n5',
            kind: 'branchSelected',
            conditionNodeId: 'cond_severity',
            expectedHandle: 'false',
          },
          {
            id: 'n6',
            kind: 'outputFieldEquals',
            fieldPath: 'channel',
            expectedValue: 'email_digest',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  const triggerNode = workflow.nodes.find((n) => n.type === 'trigger');
  const sampleInput =
    triggerNode?.type === 'trigger' && triggerNode.config.sampleInput
      ? structuredClone(triggerNode.config.sampleInput)
      : {};

  return [
    {
      id: `tc_default_${workflow.id}`,
      workflowId: workflow.id,
      name: 'Default sample input test',
      description: 'Runs the workflow with its Trigger sample payload.',
      input: sampleInput,
      assertions: [{ id: 'def_1', kind: 'status', expectedStatus: 'success' }],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

