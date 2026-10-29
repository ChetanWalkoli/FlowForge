# FlowForge — Execution Semantics Specification

**Document version:** 1.0  
**Scope:** Runtime evaluation, branching, context resolution, error propagation, and TraceLab event contract

---

## 1. Execution Lifecycle

1. **Static Validation Gate:** Before any node executes, the workflow document is validated against both Zod schemas and structural graph rules. If any `error`-severity issue exists, execution is blocked immediately.
2. **Input Schema Validation:** The supplied runtime input payload is validated against the Trigger node's configured `inputSchema` (verifying required keys and primitive types).
3. **Graph Indexing:** The engine builds fast adjacency maps (`outgoingEdgesByNodeAndHandle`, `incomingEdgesByNode`, `nodeMap`) from the validated workflow.
4. **Run Initialization:** A unique `runId` is assigned, `ExecutionContext` is initialized with `{ input, nodeOutputs: {}, variables: {}, logs: [] }`, and `{ type: "run.started", runId, timestamp }` is emitted.
5. **Step Evaluation Loop:**
   - Pull the next eligible node from the scheduler queue.
   - Check `AbortSignal` for user cancellation and check the step counter against `maxSteps` (default `500`).
   - Emit `{ type: "node.started", nodeId, input, timestamp }`.
   - Invoke the registered pure handler for `node.type`.
   - Record the node's output in `context.nodeOutputs[node.id]` and emit `{ type: "node.completed", nodeId, input, output, durationMs, timestamp }`.
   - If the node is a `condition` (or returns explicit `nextHandleIds`), emit `{ type: "branch.selected", nodeId, handleId, reason, timestamp }` and mark nodes exclusively reachable via unselected handles as `skipped` (`{ type: "node.skipped", nodeId, reason, timestamp }`).
   - Enqueue downstream target nodes connected to the selected output handle(s).
6. **Termination:**
   - When an `End` node completes (and no remaining active branches are pending), emit `{ type: "run.completed", runId, output, durationMs, timestamp }`.
   - If any handler throws or returns a validation/runtime error, emit `{ type: "node.failed", nodeId, error, timestamp }` followed by `{ type: "run.failed", runId, error, timestamp }`.
   - If cancelled via `AbortSignal` or step pause controller, emit `{ type: "run.cancelled", runId, timestamp }`.

---

## 2. Data Resolution Rules

- **Source Resolution:**
  - `source: "trigger"` resolves against `context.input` (which is also stored as the Trigger node's output).
  - `source: "<nodeId>"` resolves against `context.nodeOutputs[nodeId]`. If `<nodeId>` matches the workflow's trigger node ID, it resolves against the trigger output.
  - `source: "upstream"` resolves against the immediate predecessor node's output that activated the current node.
- **Path Resolution:**
  - Dot-separated paths (e.g., `"user.profile.amount"`) traverse nested plain objects safely.
  - Prototype properties (`__proto__`, `constructor`, `prototype`) are strictly blocked to prevent prototype pollution or unintended property access.
- **Missing Data Policy:**
  - Referencing a node that has not executed or does not exist produces an explicit runtime error (`ERR_MISSING_SOURCE_NODE`), except for `isEmpty` / `isNotEmpty` operators which evaluate missing fields deterministically when inspecting optional fields on an executed object.
  - In arithmetic/relational comparisons (`greaterThan`, `lessThanOrEqual`, etc.), `undefined` or incompatible operand types fail with a clear, actionable `ERR_OPERAND_TYPE_MISMATCH` error identifying the exact path and actual value.

---

## 3. Condition Branching Contract

A `Condition` node has two output handles: `"true"` and `"false"`.
When evaluated, the condition handler computes a structured `ConditionEvaluationReason`:

```ts
type ConditionEvaluationReason = {
  leftSource: string;
  leftPath: string;
  leftValue: unknown;
  operator: ConditionOperator;
  rightValue: unknown;
  result: boolean;
  explanation: string;
};
```

- Exactly one handle (`"true"` if `result === true`, `"false"` if `result === false`) is selected.
- Downstream nodes that have **no active incoming path** because their only incoming branches were not selected are marked `skipped` with reason `"Branch not selected (<conditionNodeId>:<unselectedHandle>)"`.

---

## 4. Replay vs. Re-Execution

- **Trace Replay:** Steps through a recorded `ExecutionTrace` (`events[]`, `nodeTraces{}`) to restore canvas highlights, timeline cursor, and inspector payloads at any point in time **without invoking any node handlers**.
- **Re-Execution:** Starts a brand-new run with a new `runId` and fresh timestamps using the recorded input payload.

