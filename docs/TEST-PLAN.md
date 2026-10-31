# FlowForge — Comprehensive Test & Verification Plan (`docs/TEST-PLAN.md`)

## 1. Verification Gates

Every change in FlowForge must pass the four zero-warning verification gates:

```bash
npm run typecheck   # tsc -b --noEmit (strict TypeScript)
npm run lint        # eslint . --max-warnings 0
npm test            # vitest run (127 automated tests across 17 test suites)
npm run build       # tsc -b && vite build (production bundle)
```

---

## 2. Automated Test Suites (`src/tests/`)

| Suite File | Phase / Scope | Tests | Key Verification Coverage |
| :--- | :--- | :---: | :--- |
| `src/tests/domain-validation.test.ts` | Phase 0 & 3 — Domain Contracts & Static Graph Validator | 11 | Validates `EXPENSE_APPROVAL_WORKFLOW`, detects missing/duplicate triggers, missing end nodes, cycles without loop nodes, disconnected nodes, unconnected condition branches, and invalid operand references. |
| `src/tests/ui-primitives.test.tsx` | Phase 1 — Precision Studio UI Primitives | 9 | Verifies `Button`, `Input`, `StatusBadge`, `EmptyState`, `PayloadViewer` (copy & collapse), `Skeleton`, and `ToastRegion` accessibility and semantics. |
| `src/tests/app-shell-navigation.test.tsx` | Phase 2 — Three-Column Studio Shell & Command Palette | 8 | Verifies `TopBar` inline rename, collapsible `NavigationSidebar` & `ContextualInspector`, searchable `NodeLibrary`, `BottomDrawer` tab switching & issue focus, and `CommandPalette` (`Ctrl+K`) keyboard navigation. |
| `src/tests/workflow-canvas-editing.test.tsx` | Phase 3 — Visual Graph Canvas, Node Config Forms & Editing | 6 | Verifies node addition, port-validated edge connections, dynamic `NodeConfigForm` editing for Trigger/Condition/Action/Transform/End, duplicate (`Ctrl+D`), copy/paste (`Ctrl+C`/`Ctrl+V`), and bounded Undo/Redo (`Ctrl+Z`/`Ctrl+Y`). |
| `src/tests/persistence-import-templates.test.tsx` | Phase 4 — IndexedDB Persistence, Import/Export & Starter Templates | 5 | Verifies IndexedDB hydration (`EXPENSE_APPROVAL_WORKFLOW` default seed), Saved Workflows CRUD, custom template creation, versioned JSON export with secret key redaction, and safe JSON import preview without auto-execution. |
| `src/tests/execution-engine.test.ts` | Phase 5 (Tasks 1–6) — Pure Deterministic Execution Engine | 26 | Verifies safe dot-path resolution, prototype pollution guards (`__proto__`, `constructor`, `prototype`), all 9 Condition operators, all 4 Action & 4 Transform operations, diamond-safe skip propagation, nested conditionals, all 4 starter templates, fail-fast errors, `AbortSignal` cancellation, and execution budgets (`maxSteps`, `maxDurationMs`, `handlerTimeoutMs`). |
| `src/tests/workspace-runtime-persistence.test.ts` | Phase 5 (Task 7) — Zustand Runtime Integration & Run History | 7 | Verifies `executeCurrentWorkflow`, active run lifecycle, duplicate concurrent run guard, workflow-switch isolation during active run, cancellation cleanup, and IndexedDB run history persistence/pruning. |
| `src/tests/run-workflow-modal.test.tsx` | Phase 5 (Task 8) — Run Input Modal & Entry Points | 6 | Verifies `RunWorkflowModal` JSON prefill from trigger `sampleInput`, syntax & schema validation errors, custom payload override execution, `TopBar` Run/Cancel controls, and `CommandPalette` guard. |
| `src/tests/runtime-ui-integration.test.tsx` | Phase 5 (Task 9) — Canvas Runtime Overlay & TraceLab Inspector | 5 | Verifies canvas node status badges (`success`, `skipped`, `failed`), traversed vs. skipped edge styling, `ContextualInspector` node trace & Condition Explainability (`leftValue`, `operator`, `rightValue`, `result`), `BottomDrawer` Output & Logs, and TraceLab timeline event selection. |
| `src/tests/tracelab-testing-versioning.test.tsx` | Phase 6 & 7 — TraceLab Replay, Diffing, Testing Lab, Control-Flow & Versioning | 6 | Verifies `computePayloadDiff`, side-effect-free `replayRunAtEventIndex`, `compareWorkflowRuns`, topological `autoLayoutWorkflow`, immutable `createWorkflowRevisionRecord` / `compareWorkflowRevisions` / `buildRestoredWorkflowRevision` (`n + 1`), P1 handlers (`Delay`, `Retry`, `Loop`, `Merge`), and Testing Lab suite execution with 100% condition branch coverage. |
| `src/tests/indexeddb-persistence.test.ts` | Phase 7 — IndexedDB v2 Schema Upgrade & Entity Persistence | 6 | Verifies IndexedDB v1 to v2 database upgrade, `revisions` and `testSuites` object stores, corrupted record skipping, and store hydration. |
| `src/tests/runtime-pause-resume.test.ts` | Phase 6 — Interactive Pause and Resume (FR-041) | 5 | Verifies live pause, checkpoint wait, resume execution, step forward, and cancellation while paused. |
| `src/tests/subflow-node.test.ts` | Phase 7 — Subflow Node & Invocation | 5 | Verifies subflow node schema, cyclical recursion prevention, input/output field mappings, and nested execution traces. |
| `src/tests/workflow-generator.test.tsx` | Phase 7 — Plain-English Workflow Drafter (FR-063) | 8 | Verifies deterministic pattern synthesis, template suggestions, parameter extraction, and modal review before applying. |
| `src/tests/server-sync-adapter.test.ts` | Phase 7 — Server Synchronization Adapter (FR-059) | 4 | Verifies local-first persistence, offline queueing, reconnection flush, 409 conflict resolution (`revision-fork`), and network error tolerance. |
| `src/tests/phase8-quality-audit.test.tsx` | Phase 8 — Responsive Layout, Accessibility & Performance Quality Audit | 3 | Verifies mobile view switcher, ARIA landmarks and roles, and high-throughput execution (<1000ms for 50-node graph). |
| `src/tests/e2e-user-journeys.test.tsx` | Phase 9 — End-to-End User Journeys (Final Audit) | 7 | Verifies all 7 core journeys: create & execute, pause/resume, testing lab persistence, immutable revision restore, subflow invocation, plain-English drafting, and offline/online server sync flush. |

---

## 3. Manual Smoke & End-to-End Walkthrough Checklist

1. **First-Load Experience:**
   - Open the app in a fresh browser profile. Confirm **Expense approval** loads automatically with 5 connected nodes and a dismissible quickstart banner.
2. **Interactive Execution & Branching:**
   - Click **Run** in the TopBar. Confirm the Run Input Modal prefills `{"amount": 4250, "requester": "ada@flowforge.dev", "department": "Core Platform"}`.
   - Click **Execute Workflow**. Confirm the `true` branch (`Auto-approve expense`) highlights in emerald, the `false` branch (`Route to manual review`) is marked `Skipped`, and the Bottom Drawer displays the final output.
   - Click **Run** again, change `amount` to `15000`, and execute. Confirm the `false` branch executes and `Auto-approve expense` is marked `Skipped`.
3. **TraceLab Replay & Run Comparison:**
   - Open the **TraceLab Timeline** tab in the Bottom Drawer.
   - Use **First**, **Prev Step**, **Next Step**, and **Full Run** to scrub through the execution without re-running handlers.
   - Select the previous run in the **Compare with** dropdown and verify the branch change (`true → false`) and output diff summary.
4. **Testing Lab & Branch Coverage:**
   - Open the **Testing Lab** tab in the Bottom Drawer and click **Run Test Suite**.
   - Verify all starter scenarios pass and the **Branch Coverage** badge reaches `100% (2/2)`.
5. **Version History & Auto-Layout:**
   - Open the **Overview** tab in the right Inspector, enter a checkpoint note, and click **Save Snapshot** (`v2`).
   - Click **Auto-arrange graph** in the canvas toolbar (`LayoutGrid` icon), then click **Restore as v3** in Version History to verify non-destructive revision restoration.

