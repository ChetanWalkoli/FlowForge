# FlowForge — Product Requirements Document

**Document version:** 1.0  
**Status:** Implementation blueprint  
**Product type:** Visual programming and workflow automation platform  
**Primary differentiator:** TraceLab — explainable execution, replay, and workflow testing

---

## 1. Product summary

FlowForge is a visual programming tool that lets users design, validate, execute, test, debug, and version automated workflows without manually writing all the control-flow logic.

Users compose a workflow from typed nodes on a canvas, connect node ports, configure each node, and run the workflow against input data. The runtime evaluates the graph and emits structured execution events. TraceLab presents those events as an inspectable timeline, highlights the executed path, and explains condition decisions.

FlowForge is not merely a diagram editor. A workflow is a versioned, validated program with defined inputs, outputs, execution semantics, tests, and recorded runs.

### 1.1 Product vision

Make program logic easier to build and understand visually while preserving the correctness, debuggability, and testability expected from software.

### 1.2 Product principles

1. **Correctness before complexity:** execution semantics and validation come before advanced visual effects.
2. **Editor/runtime separation:** React renders and edits workflows; a framework-independent runtime executes them.
3. **Explainability by default:** every run should be inspectable, with branch decisions and node inputs/outputs.
4. **Safe by design:** imported workflows are untrusted data; arbitrary code is never evaluated.
5. **Incremental extensibility:** nodes, handlers, storage, and execution policies have explicit interfaces.
6. **Useful local-first MVP:** users can create and run workflows without accounts or a backend.
7. **Testable behavior:** domain logic and runtime behavior must be covered by automated tests.

---

## 2. Problem statement

Traditional programming requires users to express control flow and data flow through code. Basic flowchart tools visualize logic but do not necessarily execute it, test it against multiple inputs, or explain failures.

FlowForge addresses this gap by combining:
- A node-based visual editor.
- A typed workflow data model.
- A deterministic local execution runtime.
- Validation and linting.
- Execution tracing and debugging.
- Test cases and branch coverage.
- Workflow persistence and version history.

### 2.1 Target users

**Primary:**
- Students learning programming and control flow.
- Developers prototyping logic and data-processing flows.
- Technical users who want to understand an automation before running it.

**Secondary, later:**
- Small teams documenting and testing internal processes.
- Developers building reusable workflow templates or custom node types.

### 2.2 Jobs to be done

- “I want to construct conditional logic without writing every branch by hand.”
- “I want to know why a workflow chose a particular path.”
- “I want to test the same workflow against many inputs.”
- “I want to save, compare, and restore changes to a workflow.”
- “I want to share a reproducible example of a workflow and its results.”

### 2.3 Non-goals for the initial release

- A production replacement for mature automation platforms.
- Arbitrary JavaScript/Python execution supplied by users.
- Guaranteed exactly-once execution of external side effects.
- Real-time multi-user collaboration.
- Unrestricted integrations with external services.
- A distributed workflow orchestration cluster.
- AI-generated workflows as a prerequisite for using the editor.

---

## 3. Product scope

### 3.1 MVP: must-have

- Dark, clean, responsive editor shell.
- Drag-and-drop node library and custom node components.
- Connect nodes through input/output handles.
- Configure, move, delete, duplicate, and multi-select nodes.
- Zoom, pan, minimap, fit-to-view, and keyboard shortcuts.
- Undo/redo for graph and configuration changes.
- Workflow graph schema and node configuration validation.
- Trigger, Condition, Action, Transform, and End nodes.
- Local execution engine with data propagation and true/false branching.
- Run status, execution path highlighting, and per-node input/output inspection.
- Workflow linting with clickable issues.
- Save/load using IndexedDB.
- Versioned JSON import/export with strict validation.
- Starter templates.
- Unit and component tests.
- README and architecture documentation.

### 3.2 Release 2: advanced local product

- TraceLab timeline, pause/resume, step-through playback.
- Execution history and replay from recorded traces.
- Test suites with expected outputs and pass/fail summaries.
- Branch coverage reporting.
- Controlled loops with iteration limits.
- Retries, timeouts, cancellation, and failure policies.
- Parallel branches with explicit synchronization.
- Automatic graph layout.
- Immutable workflow revisions and graph/config diffs.

### 3.3 Release 3: full-stack extension

- Node.js API and PostgreSQL persistence.
- Authentication and per-user workflow ownership.
- Server-side execution using isolated workers.
- Published workflow lifecycle and deployment configuration.
- Custom node registry.
- Shareable read-only workflow links.
- AI-assisted workflow drafting with validation and user approval.
- Collaboration and scheduling only after core correctness is proven.

---

## 4. Success criteria

The project is successful when a new user can create a workflow, run it with different inputs, understand the selected branches, test expected outcomes, and recover saved work.

### 4.1 MVP acceptance criteria

1. User can create a Trigger → Condition → two Action branches → End workflow.
2. Compatible ports connect; incompatible ports are rejected with a clear reason.
3. Invalid configuration is shown before execution.
4. A valid input executes the expected branch and produces a result.
5. The runtime can be tested without rendering React.
6. Each executed node has a trace event with status, input, output, and timing metadata.
7. User can inspect why a condition returned true or false.
8. User can save, reload, export, and import a workflow.
9. Malformed or oversized imported JSON is rejected safely.
10. Undo/redo correctly handles node, edge, position, and configuration changes.
11. Validation issues focus the corresponding node.
12. Automated tests cover branch selection, invalid graphs, errors, and persistence serialization.

### 4.2 Quality targets

These are initial engineering targets, not guarantees:
- No uncaught runtime exceptions for validated sample workflows.
- Fast interactions on a typical modern laptop for graphs of a few hundred nodes.
- Unit tests for all core node handlers and graph validation rules.
- Integration tests for complete workflows and persistence.
- End-to-end test for creating, executing, saving, and reopening a workflow.
- Keyboard access for core editor actions and visible focus states.
- Reduced-motion support for execution animation.
- No secrets or credentials stored in workflow exports by default.

---

## 5. Core user journeys

### Journey A: Create and run a workflow
1. Open FlowForge.
2. Create a blank workflow or choose a template.
3. Drag a Trigger, Condition, Action, and End node onto the canvas.
4. Connect ports.
5. Configure the trigger input and condition.
6. Run with a sample input.
7. Watch the executed path.
8. Inspect condition values and final output.
9. Save the workflow.

### Journey B: Diagnose a failed workflow
1. Open execution history.
2. Select a failed run.
3. View the node timeline.
4. Select the failed node.
5. Inspect input, configuration, error, and preceding events.
6. Fix the configuration.
7. Run again and compare results.

### Journey C: Test a workflow
1. Open the Testing Lab.
2. Create multiple test cases.
3. Define input values and expected outputs or branch paths.
4. Run the suite.
5. Review pass/fail status and uncovered branches.
6. Save results against the workflow revision.

### Journey D: Import a workflow
1. Select Import.
2. Choose a JSON file.
3. Validate format, version, node types, configuration schemas, edge references, and size limits.
4. Show an error report if invalid.
5. Preview and confirm import.
6. Store the workflow as a new local workflow; never execute it automatically on import.

---

## 6. Functional requirements

Priority meanings:
- **P0:** required for MVP.
- **P1:** required for the advanced local release.
- **P2:** future extension.

### 6.1 Editor and canvas

**FR-001 (P0):** Display a canvas with a node library, top toolbar, inspector, and execution panel.  
**FR-002 (P0):** Allow drag-and-drop node creation.  
**FR-003 (P0):** Support custom nodes with labeled input/output handles.  
**FR-004 (P0):** Allow nodes and edges to be selected, moved, deleted, and duplicated.  
**FR-005 (P0):** Support zoom, pan, fit view, and minimap.  
**FR-006 (P0):** Support multi-select and copy/paste while assigning new IDs to pasted nodes and edges.  
**FR-007 (P0):** Provide undo/redo with bounded history and meaningful grouping of edits.  
**FR-008 (P0):** Provide keyboard shortcuts and a searchable command palette.  
**FR-009 (P1):** Automatically arrange a graph while preserving logical edge connections.  
**FR-010 (P1):** Support graph outline/search for large workflows.

### 6.2 Node library and schemas

**FR-011 (P0):** Provide Trigger, Condition, Action, Transform, and End node types.  
**FR-012 (P0):** Every node has a stable ID, type, display name, position, version, and typed configuration.  
**FR-013 (P0):** Every node type defines input/output ports and a configuration schema.  
**FR-014 (P0):** The inspector renders fields based on node type and displays validation errors.  
**FR-015 (P0):** Port compatibility is checked before an edge is accepted.  
**FR-016 (P1):** Add Delay, Retry, Merge, Loop, and Subflow nodes.  
**FR-017 (P1):** Custom node registration requires a schema, ports, handler, and metadata.

### 6.3 Workflow validation

**FR-018 (P0):** Validate graph structure, node IDs, edge references, node configuration, and required connections.  
**FR-019 (P0):** Detect unreachable nodes, disconnected actions, missing condition branches, invalid ports, and unsupported cycles.  
**FR-020 (P0):** Report issues with severity, message, affected node/edge IDs, and remediation guidance.  
**FR-021 (P0):** Selecting an issue focuses the related node or edge.  
**FR-022 (P1):** Distinguish errors that block execution from warnings that permit execution.  
**FR-023 (P1):** Validate bounded loops, timeout settings, and parallel branch structure.

### 6.4 Execution runtime

**FR-024 (P0):** Validate a workflow before execution.  
**FR-025 (P0):** Execute a valid acyclic workflow from a defined trigger/input.  
**FR-026 (P0):** Pass structured values between nodes through execution context.  
**FR-027 (P0):** Conditions select a named output handle such as `true` or `false`.  
**FR-028 (P0):** Do not execute unselected condition branches.  
**FR-029 (P0):** Emit structured events for node start, node completion, branch selection, skip, and failure.  
**FR-030 (P0):** Support success, failed, skipped, pending, and running statuses.  
**FR-031 (P0):** Capture node inputs, outputs, timestamps, and error details in the trace.  
**FR-032 (P1):** Support cancellation, maximum steps, execution time limits, and handler timeouts.  
**FR-033 (P1):** Support retries with bounded attempts and configured delay.  
**FR-034 (P1):** Support controlled loops with maximum iteration limits.  
**FR-035 (P1):** Support parallel branches and explicit synchronization semantics.  
**FR-036 (P1):** Support error policies such as fail-fast and configured error branches.

### 6.5 TraceLab and execution history

**FR-037 (P0):** Highlight active nodes and traversed edges during a run.  
**FR-038 (P0):** Show the selected node's input, output, configuration, status, and error.  
**FR-039 (P0):** Explain condition evaluation with left value, operator, right value, and result.  
**FR-040 (P1):** Provide a timeline with per-node duration and status.  
**FR-041 (P1):** Allow pause/resume and step-through execution using a scheduler that can safely wait between steps.  
**FR-042 (P1):** Persist completed run metadata and trace events locally.  
**FR-043 (P1):** Replay a recorded trace for inspection without re-executing side effects.  
**FR-044 (P1):** Compare two runs, including branch path, outputs, failures, and duration.  
**FR-045 (P1):** Mark external or nondeterministic operations and record resolved results when replayability is required.

### 6.6 Testing Lab

**FR-046 (P1):** Let users define named test cases with inputs and expected results.  
**FR-047 (P1):** Support assertions on final output, selected branches, and node outcomes.  
**FR-048 (P1):** Run a suite against a specific workflow revision.  
**FR-049 (P1):** Show pass/fail results and failure explanations.  
**FR-050 (P1):** Calculate branch coverage for supported condition nodes.  
**FR-051 (P1):** Preserve test results with the workflow revision they tested.

### 6.7 Persistence and versioning

**FR-052 (P0):** Save workflows to IndexedDB with a clear saved/unsaved state.  
**FR-053 (P0):** Recover from reloads and handle storage errors gracefully.  
**FR-054 (P0):** Export a versioned JSON document.  
**FR-055 (P0):** Validate and preview JSON imports before committing them.  
**FR-056 (P1):** Save immutable revisions with timestamps and optional descriptions.  
**FR-057 (P1):** Compare revisions by node, edge, position, and configuration changes.  
**FR-058 (P1):** Restore a previous revision as a new revision instead of silently overwriting history.  
**FR-059 (P2):** Sync workflows and revisions to a server with ownership checks.

### 6.8 Templates and onboarding

**FR-060 (P0):** Provide editable templates for form validation, expense approval, data filtering, and notification flow.  
**FR-061 (P0):** Show a short onboarding hint for adding, connecting, configuring, and running nodes.  
**FR-062 (P1):** Let users save their own workflows as templates.  
**FR-063 (P2):** Let users draft workflows from natural language; generated output must be validated and reviewed before application.

### 6.9 Backend and accounts (future)

**FR-064 (P2):** Provide authenticated workflow CRUD endpoints.  
**FR-065 (P2):** Persist workflows, revisions, test suites, runs, and trace events in PostgreSQL.  
**FR-066 (P2):** Run long jobs in a worker process with cancellation and execution limits.  
**FR-067 (P2):** Enforce workflow ownership and authorization on every resource endpoint.  
**FR-068 (P2):** Support shareable read-only links with revocation and safe access controls.  
**FR-069 (P2):** Add collaboration only after conflict resolution and synchronization behavior are specified.

---

## 7. Node definitions for the MVP

### 7.1 Trigger node

Purpose: defines the workflow's entry point and input schema.

Example configuration:
```json
{
  "label": "Expense submitted",
  "inputSchema": {
    "amount": "number",
    "requester": "string"
  }
}
```

Requirements:
- One trigger per executable workflow in the MVP.
- Defines sample input fields.
- Produces the initial execution input.
- Cannot have incoming control-flow edges.

### 7.2 Condition node

Purpose: evaluate a safe, explicit comparison.

Example configuration:
```json
{
  "left": { "source": "trigger", "path": "amount" },
  "operator": "lessThanOrEqual",
  "right": { "kind": "literal", "value": 10000 }
}
```

MVP operators:
- equals / not equals
- greater than / greater than or equal
- less than / less than or equal
- is empty / is not empty
- contains, where the operand types support it

Requirements:
- Exactly two named outputs: `true` and `false`.
- Missing or incompatible operands produce validation errors.
- The trace records both resolved operands, operator, and Boolean result.
- Avoid arbitrary expression execution.

### 7.3 Action node

Purpose: perform a controlled operation.

MVP actions:
- Set result/value.
- Build an output object.
- Append a log message.
- Return a final result.

Requirements:
- Action types come from a registry.
- Configuration is validated with Zod.
- No arbitrary code execution.
- Outputs are serializable.

### 7.4 Transform node

Purpose: map or transform structured data using a constrained set of operations.

MVP operations:
- Select a field by path.
- Rename/map fields.
- Construct an object from configured values.
- Convert supported primitive types with explicit error handling.

### 7.5 End node

Purpose: mark a workflow's successful terminal result.

Requirements:
- Exposes final output.
- Validates required output mapping if configured.
- The runtime ends successfully when the selected path reaches an End node.

---

## 8. Workflow data model

Use a versioned JSON format. Keep the editor representation separate from runtime records.

Illustrative document:
```json
{
  "format": "flowforge.workflow",
  "formatVersion": 1,
  "id": "workflow_example",
  "name": "Expense approval",
  "description": "Route expenses based on amount",
  "revision": 1,
  "nodes": [
    {
      "id": "trigger_1",
      "type": "trigger",
      "version": 1,
      "position": { "x": 120, "y": 180 },
      "config": { "label": "Expense submitted" }
    },
    {
      "id": "condition_1",
      "type": "condition",
      "version": 1,
      "position": { "x": 380, "y": 180 },
      "config": {
        "left": { "source": "trigger_1", "path": "amount" },
        "operator": "lessThanOrEqual",
        "right": { "kind": "literal", "value": 10000 }
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "trigger_1",
      "sourceHandle": "next",
      "target": "condition_1",
      "targetHandle": "in"
    }
  ],
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp"
}
```

This is illustrative, not a complete valid workflow: the full document must include all required nodes and edges.

### 8.1 Domain type guidance

```ts
type NodeStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

type PortDataType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "any";

type WorkflowNode = {
  id: string;
  type: string;
  version: number;
  position: { x: number; y: number };
  config: Record<string, unknown>;
};

type WorkflowEdge = {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
};
```

Use stricter discriminated unions for actual node configurations. `Record<string, unknown>` is acceptable at a generic boundary but should not replace typed node-specific configuration inside the engine.

### 8.2 Execution context

The runtime should expose a controlled context, not global mutable state:
```ts
type ExecutionContext = {
  input: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  variables: Record<string, unknown>;
};
```

Define how output paths are resolved, how missing values behave, and whether a node can read outputs from nodes that have not executed. Missing data should produce an explicit error rather than silently becoming a misleading value.

### 8.3 Execution event

```ts
type ExecutionEvent =
  | { type: "run.started"; runId: string; timestamp: number }
  | { type: "node.started"; nodeId: string; timestamp: number }
  | {
      type: "node.completed";
      nodeId: string;
      output: unknown;
      durationMs: number;
      timestamp: number;
    }
  | {
      type: "branch.selected";
      nodeId: string;
      handleId: string;
      reason: unknown;
      timestamp: number;
    }
  | {
      type: "node.failed";
      nodeId: string;
      error: { code: string; message: string };
      timestamp: number;
    }
  | { type: "node.skipped"; nodeId: string; reason: string; timestamp: number }
  | { type: "run.completed"; runId: string; timestamp: number }
  | { type: "run.failed"; runId: string; timestamp: number }
  | { type: "run.cancelled"; runId: string; timestamp: number };
```

Use a shared event contract between the runtime and TraceLab. Avoid making the runtime depend on React or DOM APIs.

---

## 9. Execution semantics

### 9.1 MVP algorithm

1. Parse and validate the workflow document.
2. Validate the supplied input against the trigger schema.
3. Build node and adjacency indexes.
4. Determine the trigger node.
5. Execute the current node using a registered handler.
6. Record input, output, status, timing, and emitted events.
7. Resolve the handler's selected output handle.
8. Follow only eligible outgoing edges.
9. Mark unreachable branches as skipped where the execution model can establish that safely.
10. Stop at End, failure, cancellation, or a configured safety limit.

### 9.2 Branching

A Condition handler must return an explicit selected handle:
```ts
type NodeResult = {
  output?: unknown;
  nextHandleIds?: string[];
};
```

For a condition, `nextHandleIds` contains either `["true"]` or `["false"]`, never both. The scheduler follows only edges connected to the selected handle.

### 9.3 Cycles and loops

- MVP: reject cycles during validation.
- Advanced release: permit cycles only through an explicit Loop construct.
- Every loop must have a maximum iteration count and execution-step budget.
- Do not treat arbitrary cycles as implicit loops.

### 9.4 Parallel execution

Do not add parallel branches until their semantics are defined:
- Are branches allowed to share mutable variables?
- How are outputs merged?
- What happens if one branch fails?
- Does cancellation stop all branches?
- Are retries branch-local or run-wide?

Prefer isolated branch contexts and an explicit Merge/Synchronize node. Avoid nondeterministic mutation of shared execution state.

### 9.5 Retry and timeout behavior

- Retry only configured, retryable failures.
- Use bounded attempt counts and backoff.
- Record each attempt separately in the trace.
- A timeout must stop waiting for the handler, but do not claim it can undo a side effect already performed by an external system.
- Distinguish execution timeout, handler timeout, and user cancellation.

### 9.6 Replay

Replay initially means **replaying the recorded trace for inspection**, not automatically re-executing the workflow. Re-execution may repeat external side effects and should be a separate, explicit operation. For deterministic replay of nondeterministic operations, record resolved values and relevant environment/configuration.

---

## 10. Technical architecture

### 10.1 Recommended stack

**Frontend**
- React + TypeScript + Vite
- `@xyflow/react`
- Zustand
- SCSS
- Zod
- Lucide React

**Testing**
- Vitest
- React Testing Library
- `@testing-library/user-event`
- Playwright for browser-level workflows

**Local persistence**
- IndexedDB, optionally wrapped by `idb`

**Advanced backend**
- Node.js + TypeScript
- Express or Fastify
- PostgreSQL
- Prisma or Drizzle
- Worker process or queue for long-running executions

Choose one backend framework and one ORM. Do not introduce both Express and Fastify or multiple ORMs.

### 10.2 Architecture boundaries

**Editor UI**
- Renders graph and panels.
- Sends domain commands.
- Displays validation and execution events.
- Does not implement business execution semantics.

**Domain layer**
- Defines workflow, node, edge, port, version, and run types.
- Owns graph algorithms and validation.
- Does not import React components.

**Execution engine**
- Uses a handler registry and scheduler.
- Accepts a validated workflow plus input.
- Produces results and structured events.
- Does not import React, Zustand, or browser UI components.

**Persistence**
- Serializes and loads workflow documents, revisions, tests, and runs.
- Validates data at boundaries.
- Has replaceable local and server adapters.

**TraceLab**
- Subscribes to runtime events and displays recorded traces.
- Does not decide which nodes execute.

### 10.3 Suggested directory structure

```text
flowforge/
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── WORKFLOW-FORMAT.md
│   ├── EXECUTION-SEMANTICS.md
│   └── TEST-PLAN.md
├── src/
│   ├── app/
│   ├── components/
│   │   ├── canvas/
│   │   ├── nodes/
│   │   ├── edges/
│   │   ├── panels/
│   │   └── toolbar/
│   ├── domain/
│   │   ├── types/
│   │   ├── graph/
│   │   ├── validation/
│   │   └── versioning/
│   ├── engine/
│   │   ├── executor.ts
│   │   ├── scheduler.ts
│   │   ├── context.ts
│   │   ├── trace.ts
│   │   └── handlers/
│   ├── features/
│   │   ├── workflows/
│   │   ├── templates/
│   │   ├── trace-lab/
│   │   ├── testing-lab/
│   │   └── versions/
│   ├── persistence/
│   │   ├── indexeddb/
│   │   └── adapters/
│   ├── store/
│   │   ├── editor-store.ts
│   │   ├── workflow-store.ts
│   │   └── execution-store.ts
│   ├── schemas/
│   ├── styles/
│   ├── utils/
│   └── tests/
├── package.json
└── README.md
```

Add backend folders only when Phase 8 begins. Keep modules cohesive; the directory structure should follow actual implementation, not create empty abstractions in advance.

---

## 11. UX and visual design requirements

### 11.1 Design direction

- Dark, clean, professional developer-tool aesthetic.
- Neutral surfaces with restrained semantic colors.
- Clear hierarchy and compact but readable typography.
- Canvas receives the most visual space.
- Avoid excessive gradients, glassmorphism, neon effects, decorative 3D, and oversized dashboards.
- Use animation to communicate execution state, not as decoration.
- Respect reduced-motion settings.

### 11.2 Main layout

**Top toolbar**
- Workflow name and save state.
- Undo/redo.
- Zoom controls and fit view.
- Validate and Run.
- Import/export.
- Workflow revision/status.

**Left sidebar**
- Searchable node library.
- Categories: Triggers, Logic, Data, Actions, Flow Control.
- Templates entry point.

**Center**
- Workflow canvas.
- Grid, connection handles, selection, minimap, execution highlighting.

**Right inspector**
- Selected node configuration.
- Input/output schema.
- Inline validation.
- Node documentation.

**Bottom drawer**
- Validation issues.
- Execution output and logs.
- TraceLab timeline.
- Test results.

Panels should be collapsible and resizable where practical. Do not force every advanced panel to remain visible simultaneously.

### 11.3 Accessibility

- Keyboard shortcuts must not prevent normal text editing in inputs.
- Focus states must be visible.
- Controls must have accessible names.
- Do not use color alone to indicate success or failure.
- Support reduced motion.
- Keep text contrast readable.

---

## 12. Phase-wise implementation plan

Each phase has a goal, tasks, dependencies, and a definition of done. Do not move to the next phase while the current phase's critical acceptance tests fail.

### Phase 0 — Planning and repository foundation

**Goal:** Establish contracts before building a large UI.

Tasks:
1. Create the repository and Vite React TypeScript project.
2. Add formatting, linting, type checking, and test scripts.
3. Write `ARCHITECTURE.md`, `WORKFLOW-FORMAT.md`, and `EXECUTION-SEMANTICS.md`.
4. Define node types, port types, graph validation rules, and execution statuses.
5. Create a sample expense-approval workflow as JSON.
6. Define initial test cases and acceptance criteria.

Definition of done:
- The app starts cleanly.
- TypeScript and test commands run.
- Workflow schema and sample fixtures are committed.
- Architecture boundaries are documented.

### Phase 1 — Editor shell and graph interactions

**Goal:** Make graph editing reliable before adding real execution.

Tasks:
1. Build the dark application shell.
2. Add React Flow canvas and custom node renderers.
3. Add node library and drag/drop creation.
4. Add custom edge styling and typed handles.
5. Add node selection, movement, deletion, and duplication.
6. Add zoom, pan, minimap, fit view, and selection.
7. Add inspector forms for each node type.
8. Add keyboard shortcuts and command palette basics.

Definition of done:
- Users can build and edit a graph.
- New nodes receive unique IDs.
- Edges reference valid node IDs.
- Node configuration updates the domain model.
- Core canvas interactions have component tests.

### Phase 2 — Domain model, validation, persistence

**Goal:** Treat a workflow as a valid, versioned document rather than a temporary canvas state.

Tasks:
1. Implement workflow/node/edge TypeScript types.
2. Implement Zod schemas for workflow documents and node configurations.
3. Implement port compatibility rules.
4. Detect missing nodes, broken edge references, unreachable nodes, missing required ports, and cycles.
5. Add a validation panel with issue severity and node focus.
6. Add IndexedDB workflow CRUD.
7. Add autosave with visible save/error states.
8. Add versioned JSON import/export and import preview.
9. Implement undo/redo using command grouping or snapshots.
10. Add starter templates.

Definition of done:
- Invalid graphs are blocked from execution.
- Workflows survive browser reloads.
- Imported data is validated and never auto-executed.
- Undo/redo restores graph and configuration changes.
- Persistence and serialization have automated tests.

### Phase 3 — Execution engine

**Goal:** Execute workflows correctly without depending on React.

Tasks:
1. Define the handler registry interface.
2. Implement execution context and data resolution.
3. Implement Trigger, Condition, Action, Transform, and End handlers.
4. Build adjacency indexes and the scheduler.
5. Implement explicit condition handles (`true`/`false`).
6. Record per-node status, input, output, timing, and errors.
7. Implement fail-fast errors and maximum-step limits.
8. Add cancellation for local runs.
9. Add deterministic fixtures for testing.
10. Test missing data, type mismatch, invalid config, no matching edge, and handler failure.

Definition of done:
- Runtime tests run without mounting React.
- Expense approval routes low and high amounts correctly.
- Only the selected branch executes.
- Errors include node ID and actionable message.
- Execution is bounded and cannot loop indefinitely.

### Phase 4 — TraceLab and explainability

**Goal:** Turn runtime output into an understandable debugging experience.

Tasks:
1. Define a stable execution-event schema.
2. Connect runtime events to the UI through an adapter.
3. Animate active nodes and traversed edges.
4. Show pending, running, success, skipped, failed, and cancelled states.
5. Add input/output inspector with JSON display.
6. Show condition operands, operator, and result.
7. Add run timeline and duration details.
8. Add pause/resume and step-through control.
9. Persist completed run metadata and trace events.
10. Add replay of recorded traces without re-running side effects.

Definition of done:
- Users can identify the exact path taken.
- Users can inspect the data at each executed node.
- Condition explanations match runtime behavior.
- Replay does not invoke handlers or repeat side effects.
- Reduced-motion mode remains understandable.

### Phase 5 — Testing Lab

**Goal:** Make workflows testable like software.

Tasks:
1. Define test suite and test case schemas.
2. Let users create named inputs and expected outputs.
3. Support assertions on outputs, branch paths, and node status.
4. Execute tests against a fixed workflow revision.
5. Display pass/fail status and failure diffs.
6. Calculate condition branch coverage.
7. Save test results linked to revision IDs.
8. Add regression tests for known bugs.

Definition of done:
- Multiple cases can run against the same workflow.
- Failures identify the mismatched expectation.
- Branch coverage accurately reports tested condition outcomes.
- Test results are reproducible from saved inputs and workflow revision.

### Phase 6 — Advanced execution control

**Goal:** Add complex control flow only after basic execution is stable.

Tasks:
1. Add Delay and bounded Retry nodes.
2. Add handler timeouts and cancellation behavior.
3. Add explicit Loop node with iteration limits.
4. Define isolated contexts for parallel branches.
5. Add Merge/Synchronize node.
6. Define branch failure and cancellation policies.
7. Add execution budgets and concurrency limits.
8. Add automatic layout using Dagre or ELK.
9. Expand tests to cover retries, timeouts, loops, and parallel failure.

Definition of done:
- Every control-flow construct has documented semantics.
- Infinite or runaway execution is bounded.
- Parallel results merge deterministically according to the defined policy.
- Retries and failures are visible in TraceLab.

### Phase 7 — Workflow versioning

**Goal:** Make workflow changes safe and inspectable.

Tasks:
1. Define immutable revision records.
2. Save a revision on explicit checkpoint/publish actions.
3. Compare nodes, edges, and configurations between revisions.
4. Show additions, removals, and modifications.
5. Restore an old revision by creating a new revision from it.
6. Associate test results and execution runs with a revision.
7. Add Draft, Validated, Tested, and Published states.

Definition of done:
- Old revisions cannot be silently overwritten.
- Diff output identifies meaningful changes.
- Restoring a version preserves the revision history.
- Test results clearly identify the revision they cover.

### Phase 8 — Full-stack backend

**Goal:** Add multi-user persistence and server-side execution when local workflows are reliable.

Tasks:
1. Add a Node.js TypeScript API.
2. Add PostgreSQL schema for users, workflows, revisions, tests, runs, and trace events.
3. Add authentication and authorization.
4. Add workflow CRUD and revision endpoints.
5. Validate all API inputs and ownership.
6. Add worker-based execution for longer jobs.
7. Add cancellation, job status polling, and bounded concurrency.
8. Add database migrations and integration tests.
9. Add structured logs and operational error reporting.
10. Deploy frontend, API, database, and worker separately where appropriate.

Definition of done:
- Users can only access workflows they own or have permission to access.
- Server-side workflows are validated before execution.
- Long jobs do not rely on an HTTP request staying open.
- Worker failures are observable and recoverable.
- Secrets are not exposed in client bundles or workflow exports.

### Phase 9 — AI and sharing extensions

**Goal:** Add convenience without weakening correctness.

Tasks:
1. Define a constrained workflow-generation JSON schema.
2. Generate proposals only from registered node types and supported operators.
3. Validate every generated proposal.
4. Show the proposed graph and validation issues before applying it.
5. Ask for clarification when requirements are ambiguous.
6. Add read-only sharing with explicit access controls.
7. Consider collaboration only after synchronization and conflict handling are designed.

Definition of done:
- AI output is always treated as untrusted input.
- Invalid proposals cannot be silently applied or executed.
- Users can inspect and edit generated workflows.
- Shared workflows have clear permissions and revocation.

---

## 13. Testing strategy

### Unit tests
- Port compatibility.
- Graph reachability and cycle detection.
- Node configuration schemas.
- Condition operators and missing values.
- Data-path resolution.
- Handler output contracts.
- Version diff logic.
- Import schema and version migration.

### Runtime integration tests
- Trigger → Condition → Action → End.
- True and false branch behavior.
- Failed handler and error propagation.
- Cancellation and maximum-step limits.
- Retry attempt count.
- Loop termination.
- Parallel branch merge behavior.
- Trace completeness.

### UI component tests
- Add and remove nodes.
- Connect and reject invalid edges.
- Edit node configuration.
- Undo/redo graph changes.
- Click validation issue and focus node.
- Show input/output inspector.

### End-to-end tests
1. Create an expense workflow.
2. Configure a threshold.
3. Run with a low amount and verify approval.
4. Run with a high amount and verify manual review.
5. Inspect the condition trace.
6. Save and reload the workflow.
7. Export, import, and verify the graph.
8. Run the test suite and verify results.

---

## 14. Security and reliability requirements

- Treat imported JSON, AI-generated definitions, and shared workflow documents as untrusted.
- Validate format version, size, node count, edge count, configuration schema, and references.
- Never use `eval` or `new Function` for workflow execution.
- Use a registry of explicitly supported node handlers.
- Apply execution-step, time, retry, and concurrency limits.
- Keep secrets out of exported workflow definitions and client-side code.
- Require explicit authorization for backend workflow and run endpoints.
- Treat external actions as potentially non-idempotent.
- Do not promise exactly-once side effects without a design that actually provides them.
- Record errors in a safe, structured format; avoid logging credentials or sensitive payloads.
- Use database transactions for related revision and run metadata where needed.
- Ensure cancellation semantics are documented and tested.

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope becomes too large | Complete phase acceptance criteria before starting the next phase. |
| UI is polished but runtime is fake | Build runtime tests independently from React. |
| Undo/redo becomes unreliable | Centralize graph mutations and group related edits. |
| Replay repeats external side effects | Replay stored traces separately from execution. |
| Cycles cause infinite runs | Reject cycles in MVP; use bounded explicit Loop nodes later. |
| Parallel branches are nondeterministic | Define isolation, merge, and failure semantics first. |
| Imported workflow is malicious or malformed | Validate schemas, references, size, and node types before use. |
| Backend is added too early | Start local-first; add API/database after core behavior works. |
| AI generation produces invalid graphs | Generate constrained definitions, validate, preview, and require approval. |
| Large workflows become slow | Profile first; then optimize rendering, graph indexing, and layout. |

---

## 16. Definition of done for the portfolio release

FlowForge is ready for a portfolio release when:

- The deployed editor is usable and stable.
- At least four useful templates work end to end.
- The runtime executes real workflows with correct branching.
- TraceLab explains decisions and failures.
- The Testing Lab runs multiple cases and reports expected versus actual results.
- Workflow import/export and persistence are reliable.
- Version history and comparison work if included in the release claim.
- Unit, integration, and end-to-end tests run in CI.
- The README includes screenshots, a short demo, setup instructions, architecture, limitations, and future plans.
- No feature is advertised as implemented unless it is demonstrably working.

### Suggested README demo sequence

1. Open the expense-approval template.
2. Inspect the graph and node configuration.
3. Run a low-value expense.
4. Show the selected true branch and trace values.
5. Run a high-value expense.
6. Show the false branch and compare outputs.
7. Run the Testing Lab.
8. Show a validation error and fix it.
9. Save, reload, and compare a workflow revision.

---

## 17. Immediate next steps

1. Create the repository and establish the development scripts.
2. Implement the workflow JSON schema and TypeScript domain types.
3. Write tests for the graph validator and Condition handler.
4. Build the smallest vertical slice: Trigger → Condition → Action → End.
5. Connect that vertical slice to the canvas.
6. Add TraceLab only after the runtime emits structured events.
7. Expand by phase rather than building every panel at once.

**Guiding rule:** every phase must produce a working, testable product increment. Prioritize correctness, explainability, and a clear demo over feature count.
