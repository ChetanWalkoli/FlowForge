# FlowForge — Precision Studio Visual Workflow Automation & TraceLab Debugger

FlowForge is a local-first, visual programming and workflow automation builder engineered around the **Precision Studio** design system (`#0B0D0F` deep carbon canvas, `#3B82F6` electric sapphire focus accents, `Inter` + `JetBrains Mono` typography) and **TraceLab**, an interactive execution timeline, payload differ, and scenario testing debugger.

---

## Core Capabilities

### 1. Visual Graph Editor (`@xyflow/react`)
- **Typed Node System:** 10 strongly-typed node specifications (`Trigger`, `Condition`, `Action`, `Transform`, `End`, `Delay`, `Retry`, `Loop`, `Merge`, `Subflow`) with typed input/output ports and category accent bars.
- **Interactive Graph Authoring:** Drag-and-drop or click-to-add from the searchable Node Library, port-validated edge connections, multi-select, duplicate (`Ctrl+D`), copy/paste (`Ctrl+C` / `Ctrl+V`), bounded 50-step Undo/Redo (`Ctrl+Z` / `Ctrl+Y`), and one-click deterministic **Auto-arrange graph** topological layout.
- **Command Palette (`Ctrl+K`):** Keyboard-first access to every node type, starter template, execution action, test suite runner, layout toggle, plain-English drafting, and persistence operation.

### 2. Real-Time Static Graph & Schema Validator
- Runs automatically on edits and before every execution.
- Detects missing/multiple Trigger nodes, missing End nodes, disconnected/unreachable nodes, cycles without bounded loop nodes, unconnected Condition branches (`true` / `false`), invalid dot-paths, and incomplete node configurations.
- Provides clickable remediation links in both the **Bottom Drawer** and **Contextual Inspector** that focus the offending node or edge on the canvas.

### 3. Pure Deterministic Execution Engine (`src/engine/`)
- **Zero-UI Pure TypeScript Runtime:** Completely decoupled from React, Zustand, and the DOM. Never uses `eval()` or `new Function()`.
- **Diamond-Safe Convergence Scheduling:** Propagates branch skips only when all incoming paths to a convergence node are skipped, ensuring shared `End` or `Merge` nodes execute accurately when either conditional branch succeeds.
- **Execution Safety & Budgets:** Enforces `maxSteps`, `maxDurationMs`, per-handler `handlerTimeoutMs`, `AbortSignal` cancellation, and prototype-pollution guards (`__proto__`, `constructor`, `prototype` rejection).

### 4. TraceLab Execution Debugger & Replay (`src/features/trace-lab/`)
- **Chronological Event Timeline:** Records `run.started`, `node.started`, `branch.selected`, `node.completed`, `node.skipped`, `node.failed`, `run.completed`, `run.failed`, and `run.cancelled`.
- **Condition Explainability:** Displays the exact left operand path, resolved runtime value, comparison operator, right operand, boolean result, and selected branch (`true` or `false`).
- **Step-by-Step Trace Replay:** Scrub or step (`First`, `Prev Step`, `Next Step`, `Full Run`) through recorded trace events to reconstruct canvas node statuses, traversed edges, and inspector payloads at any point in time without re-running handlers.
- **Input → Output Payload Diffing & Run Comparison:** Highlights added (`+`), modified (`~`), and removed (`-`) payload keys per node and compares any two historical runs side-by-side (status, duration delta, branch differences, and final output diff).

### 5. Workflow Testing Lab & Branch Coverage (`src/features/testing-lab/`)
- **Scenario Test Suite Runner:** Define named test cases with custom JSON trigger inputs and assertions (`status`, `outputFieldEquals`, `branchSelected`, `nodeStatus`).
- **Condition Branch Coverage:** Computes and displays real-time condition branch coverage (`true` and `false` paths exercised across all Condition nodes) with one-click **Inspect in TraceLab** links for any test run.
- **Persistent Test Suites:** Test cases and suite reports persist across reloads in IndexedDB per workflow.

### 6. Local-First Persistence, Versioning & JSON Import/Export
- **IndexedDB Storage (v2 Schema):** Persists workflows, revisions, test suites, custom templates, workspace metadata, and historical execution runs per workflow with automatic fallback and corrupted-record tolerance.
- **Immutable Revisions & Structural Diffs:** Save numbered revision checkpoints (`v1`, `v2`, ...), inspect structural diffs (added/modified/removed nodes and edges), and restore any historical snapshot non-destructively as new revision `n + 1`.
- **Safe JSON Import/Export:** Exports versioned `flowforge.workflow` (`formatVersion: 1`) JSON documents (automatically redacting sensitive key patterns) and validates imported JSON before loading without auto-executing.
- **Server Synchronization Boundary (`FR-059`):** Local-first synchronization adapter with offline queueing, network auto-detection, and `revision-fork` conflict resolution.

### 7. Plain-English Workflow Generation (`FR-063`)
- **Deterministic Pattern Synthesis:** Draft workflows from natural language requirements without mock AI claims or hallucinations.
- **Safe Review & Preview Modal:** Inspect synthesized pattern, node configs, and edge connections with options to replace or append to canvas after explicit user confirmation.

---

## Starter Workflow Templates

1. **Expense Approval:** Routes employee expense claims by amount (`> 1000`) to VP Review or Auto-Approve.
2. **Registration Form Validation:** Validates incoming user registration fields, checking that email is non-empty before constructing a verified user profile.
3. **Telemetry Priority Filter:** Filters incoming service telemetry events by latency threshold and normalizes high-latency records for investigation.
4. **Alert Dispatch & Notification Flow:** Evaluates alert severity (`equals "critical"`), routes urgent notifications to Slack, and writes audit logs.

---

## Quick Start & Commands

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Run TypeScript strict typecheck
npm run typecheck

# Run ESLint
npm run lint

# Run automated unit & integration test suite (Vitest + Testing Library)
npm test

# Build production bundle
npm run build
```

---

## Architecture Overview

```text
src/
├── domain/
│   ├── fixtures/        # Expense Approval & 4 starter workflow templates
│   ├── graph/           # Deterministic topological auto-layout (auto-layout.ts)
│   ├── registry/        # Typed node specifications & default configs (node-registry.ts)
│   ├── types/           # Canonical workflow, node, port, trace & validation contracts
│   ├── validation/      # Static graph & configuration validator (graph-validator.ts)
│   └── versioning/      # Immutable revision records & structural diffs (version-diff.ts)
├── engine/
│   ├── context.ts       # Safe dot-path resolution & prototype-pollution guards
│   ├── trace.ts         # Chronological event recorder & immutable snapshot cloning
│   ├── handlers/        # Pure handlers for all 9 node types
│   ├── scheduler.ts     # Adjacency indexer & diamond-safe deterministic scheduler
│   ├── executor.ts      # Top-level workflow executor with budgets & cancellation
│   └── index.ts         # Public runtime API
├── features/
│   ├── trace-lab/       # Replay state reconstruction, payload diff & run comparison
│   └── testing-lab/     # Scenario test runner, assertions & branch coverage calculator
├── persistence/
│   ├── indexeddb/       # IndexedDB adapter with in-memory fallback
│   └── import-export.ts # Versioned JSON serialization, secret stripping & import validation
├── store/
│   └── workspace-store.ts # Zustand editor, runtime, TraceLab, Testing Lab & revision store
└── components/
    ├── shell/           # AppShell, TopBar, NavigationSidebar, BottomDrawer, CommandPalette, Modals
    ├── canvas/          # WorkflowCanvas (@xyflow/react) & CanvasControls
    ├── nodes/           # Custom WorkflowNode cards with runtime status & branch badges
    ├── edges/           # Custom ConnectionEdge with traversed/skipped/failed styling
    ├── panels/          # ContextualInspector, NodeConfigForm, NodeLibrary
    └── ui/              # Precision Studio UI primitives (Button, StatusBadge, PayloadViewer, etc.)
```

