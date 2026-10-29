# FlowForge --- Design System

## Precision Studio

**Direction:** Dark · Minimal · Developer-focused\
**Design principle:** Clarity over decoration.\
**Product character:** A precise engineering workspace for building,
running, and debugging workflows.

------------------------------------------------------------------------

## 1. Product design intent

FlowForge should feel like a serious developer tool: calm, deliberate,
fast to scan, and engineered around understanding what a workflow does
and why a run succeeded or failed.

The interface must not look like a generic AI dashboard, a marketing
landing page stretched into an app, or a neon-heavy node editor. The
workflow itself is the main visual object. Supporting panels should
explain the workflow and its execution without competing for attention.

### Core experience goals

1.  **Build with focus** --- keep the canvas central and reduce
    surrounding chrome.
2.  **Understand every run** --- make status, timing, errors, and node
    inputs/outputs easy to inspect.
3.  **Make complexity readable** --- use consistent spacing, restrained
    color, clear hierarchy, and progressive disclosure.
4.  **Feel responsive and trustworthy** --- interactions should be
    immediate, state changes explicit, and destructive actions
    reversible where possible.
5.  **Remain practical** --- prefer proven UI patterns over decorative
    effects that add implementation or performance cost.

### Design principles

-   **Canvas first:** the workflow graph receives the most visual space.
-   **One accent, purposeful use:** lime indicates active focus or
    positive execution state, not decoration.
-   **Status colors have meaning:** success, warning, and error must
    remain distinguishable.
-   **Density with order:** developer tools may be information-dense,
    but never visually chaotic.
-   **Motion explains state:** animations should clarify selection,
    execution, and panel transitions.
-   **No fake complexity:** avoid invented metrics, decorative
    telemetry, unnecessary HUDs, and non-functional controls.

------------------------------------------------------------------------

## 2. Visual identity

### Color tokens

Use semantic tokens instead of hard-coded colors throughout components.
These values are starting points and can be tuned against actual
contrast checks.

  -----------------------------------------------------------------------
  Token                   Value                   Usage
  ----------------------- ----------------------- -----------------------
  `--bg-app`              `#0B0D0F`               Main application
                                                  background

  `--bg-panel`            `#111417`               Sidebar, inspector,
                                                  menus

  `--bg-elevated`         `#171B1F`               Cards, popovers,
                                                  elevated surfaces

  `--bg-hover`            `#1D2328`               Hovered rows and
                                                  controls

  `--bg-active`           `#232B30`               Selected non-accent
                                                  surfaces

  `--border-subtle`       `#252C31`               Quiet dividers and
                                                  panel edges

  `--border-strong`       `#384148`               Focused containers and
                                                  stronger separation

  `--text-primary`        `#F2F4F5`               Primary text

  `--text-secondary`      `#A0A9AF`               Secondary labels and
                                                  descriptions

  `--text-muted`          `#737E85`               Timestamps, helper
                                                  text, disabled labels

  `--accent`              `#C4F36B`               Primary accent, active
                                                  node, key action

  `--accent-hover`        `#D2FF83`               Hovered primary action

  `--accent-ink`          `#17200C`               Text/icons on
                                                  lime-filled controls

  `--success`             `#7ED6A5`               Successful execution

  `--warning`             `#E8B86D`               Warnings and
                                                  recoverable issues

  `--danger`              `#F07878`               Errors and destructive
                                                  actions

  `--info`                `#84B9F4`               Informational states
                                                  and secondary data

  `--node-grid`           `#1A2024`               Low-contrast canvas
                                                  grid
  -----------------------------------------------------------------------

### Color rules

-   Lime is an **interaction accent**, not a background theme. Reserve
    it for the primary action, keyboard focus, selected execution path,
    and a small number of important highlights.
-   Do not color every node by type. Use neutral node surfaces with a
    restrained icon or small category marker.
-   Use success, warning, and danger colors only when their semantic
    meaning applies.
-   Never communicate status through color alone; include a label, icon,
    or other cue.
-   Keep decorative gradients, glow, blur, and glass effects out of the
    default UI.
-   Avoid pure black and pure white as large surfaces; the selected
    tokens reduce harsh contrast while maintaining a dark appearance.

### Typography

Use a modern, highly legible sans-serif for UI and a mono font for
technical values.

-   **UI font:** Geist Sans, Inter, or the project's existing
    equivalent.
-   **Code/data font:** Geist Mono, IBM Plex Mono, or an existing
    monospace family.
-   Do not add multiple font families for decoration.
-   Use tabular numerals for durations, timestamps, counts, and
    performance values.

Recommended scale:

  ---------------------------------------------------------------------------
  Role                            Size               Weight Notes
  --------------- -------------------- -------------------- -----------------
  Page title                 20--24 px                  600 Compact, not
                                                            marketing-sized

  Panel heading              13--15 px                  600 Clear section
                                                            hierarchy

  Body/UI                    13--14 px             400--500 Main application
                                                            text

  Secondary                      12 px                  400 Descriptions and
                                                            metadata

  Compact label                  11 px                  500 Use sparingly;
                                                            maintain
                                                            readability

  Code / IDs                 12--13 px                  400 Monospace,
                                                            selectable

  Marketing                  40--56 px                  600 Only on a
  headline (if                                              separate landing
  needed)                                                   page
  ---------------------------------------------------------------------------

Prefer sentence case. Avoid excessive uppercase labels and wide letter
spacing.

### Spacing and shape

Use a consistent 4 px base unit.

-   Tight control spacing: 4--8 px
-   Standard component spacing: 8--12 px
-   Panel section spacing: 16--20 px
-   Major page spacing: 24--32 px
-   Control height: 32--36 px
-   Standard button height: 36 px
-   Input radius: 6--8 px
-   Card/panel radius: 8--10 px
-   Modal radius: 12 px
-   Border: 1 px, low contrast
-   Shadows: subtle and reserved for overlays; never use glow as a
    substitute for hierarchy

------------------------------------------------------------------------

## 3. Application shell

### Desktop layout

The primary workspace should use a stable three-part shell:

1.  **Left navigation / node library** --- narrow, collapsible, and
    task-oriented.
2.  **Central workflow canvas** --- flexible and dominant.
3.  **Right inspector** --- contextual configuration and execution
    details.

A slim top bar anchors the workspace. An optional bottom execution
drawer can expand when needed.

Suggested proportions at a 1440 px-wide viewport:

-   Left sidebar: 220--260 px, collapsible to 56 px
-   Canvas: flexible, ideally at least 560 px
-   Right inspector: 300--360 px, collapsible
-   Top bar: 52--60 px
-   Bottom run drawer: 180--280 px when expanded

Do not hard-code these widths where responsive constraints can adapt
them. Keep the canvas usable when either side panel is collapsed.

### Top bar

Include only actions relevant to the current workflow:

-   FlowForge mark and workspace navigation
-   Workflow name with clear rename affordance
-   Save/sync state (e.g. "Saved" or "Saving...")
-   Run / Test action
-   A compact overflow menu for secondary actions

Use the lime accent for the main **Run** action. Avoid adding profile
metrics, decorative status badges, or unrelated product statistics to
the top bar.

### Left sidebar

Use simple text-and-icon navigation with clear active states. The
sidebar can contain:

-   Workspace or project navigation
-   Workflow list or current workflow context
-   Node library, grouped by meaningful categories
-   Search nodes field

The node library should support search, keyboard navigation, and clear
empty states. Keep icons consistent in stroke weight. Do not use a
different saturated color for every category.

### Right inspector

The inspector changes with context:

-   Nothing selected: concise workflow overview and helpful next action.
-   Node selected: node settings, inputs, outputs, and validation.
-   Run selected: run summary, duration, status, and trace details.
-   Error selected: error message, source node, stack/details where
    available, and recovery guidance.

Use tabs only when there are genuinely different information groups.
Keep the primary action and the selected object's identity visible.

### Bottom execution drawer

The bottom drawer is for execution events, node logs, and trace
timeline. It should be resizable or collapsible and must not permanently
steal too much canvas height.

Remember the user's last panel state during the current workspace
session if the application's state model supports it; do not make
persistence a requirement for the visual design.

------------------------------------------------------------------------

## 4. Workflow canvas

The canvas is the signature surface of FlowForge. It should be spacious,
precise, and quiet enough that the graph itself is easy to understand.

### Background and navigation

-   Use a very subtle dot or line grid, low contrast against the app
    background.
-   Support pan, zoom, fit-to-view, and reset-view controls.
-   Show zoom level and canvas actions in a compact floating control
    group.
-   Use clear cursor states for pan, selection, and connection creation.
-   Avoid heavy background illustrations, star fields, 3D scenes, and
    animated ambient particles.

### Node design

Each node should have a predictable anatomy:

-   Small category icon or marker
-   Node name
-   Optional concise subtitle or operation type
-   Connection handles with clear hover and focus states
-   Optional status indicator during or after execution
-   Validation/error indicator when applicable

Node styling:

-   Neutral elevated surface
-   Subtle border
-   Small radius, not pill-shaped
-   Strong readable title
-   Secondary details muted
-   No oversized icon or decorative gradient header

Selected nodes should use a clear accent border or outline, with a
restrained lime marker. Invalid nodes should use a danger border/icon
and an explanatory message in the inspector.

### Connections

-   Use smooth, readable paths with sufficient spacing around nodes.
-   Default connections are neutral gray.
-   Selected paths may use the lime accent.
-   Execution paths may animate briefly to communicate direction, but
    the animation must be subtle and stop when the run finishes.
-   Failed paths should show an error state and remain readable without
    relying on color alone.
-   Avoid continuously animated edges when no execution is occurring.

### Canvas interaction states

Define explicit visual states for:

-   Default node
-   Hovered node
-   Selected node
-   Running node
-   Successful node
-   Failed node
-   Disabled node
-   Incomplete / invalid node
-   Selected connection
-   Connection target during drag
-   Empty canvas

Use smooth transitions around 120--180 ms for hover and selection. Never
animate position or scale in a way that makes precise graph editing feel
unstable.

### Empty canvas

Do not leave a blank, unexplained surface. Provide a quiet empty state
with:

-   A short message such as "Start with a trigger"
-   One primary action to add a node
-   Optional keyboard shortcut hint
-   No large illustration or fictional sample workflow unless the user
    explicitly chooses a template

------------------------------------------------------------------------

## 5. Execution debugger

The debugger is the strongest opportunity to distinguish FlowForge from
a simple workflow builder. It should make each run explainable.

### Run overview

Display real data only:

-   Run status
-   Start time and elapsed duration
-   Number of nodes executed, if actually available
-   Trigger or input summary
-   A concise error summary when a run fails

Do not display fabricated uptime, latency, success percentages, or
placeholder performance metrics as if they were real.

### Execution timeline

Use a compact horizontal or vertical trace that maps events to nodes and
time.

-   Make the currently inspected event obvious.
-   Allow selecting a timeline event to focus the related node.
-   Use a consistent monospace style for timestamps and durations.
-   Distinguish pending, running, completed, skipped, and failed states.
-   Provide useful empty/loading/error states.
-   For long traces, support scrolling and preserve a clear current
    selection.

### Input/output inspector

When a node is selected during a run, show:

-   Input payload
-   Output payload, if present
-   Duration, if available
-   Status and attempt number, if available
-   Error details and relevant metadata

Use a code viewer with syntax highlighting only where it improves
readability. Provide copy actions and wrapping/formatting controls for
large payloads. Do not truncate important error content without an
affordance to expand it.

### Error presentation

Errors should be direct and actionable:

1.  State what failed in plain language.
2.  Identify the affected node or operation.
3.  Show the relevant technical detail.
4.  Offer an available next action, such as retry, edit node, or copy
    details.

Avoid vague messages such as "Something went wrong" when a real error is
available. Never imply that a retry or fix succeeded before the system
confirms it.

------------------------------------------------------------------------

## 6. Components and interaction patterns

### Buttons

-   **Primary:** lime fill with dark text; one main primary action per
    major region.
-   **Secondary:** neutral surface or transparent background with a
    subtle border.
-   **Tertiary:** text or icon button for low-priority actions.
-   **Destructive:** danger color used only for destructive actions,
    with confirmation when impact is significant.

Every icon-only button must have an accessible name and a tooltip.
Disabled controls must look disabled and explain the missing requirement
where useful.

### Inputs and forms

-   Dark panel surface with a visible neutral border.
-   Focus uses a clear lime outline or border, not an intense glow.
-   Labels remain visible when the input contains a value.
-   Validation appears near the relevant field.
-   Required fields, optional fields, and invalid values must be
    distinguishable.
-   Preserve user input after validation errors.

### Menus and dialogs

-   Use compact, readable menus with clear hover and keyboard focus
    states.
-   Keep destructive actions separated from ordinary actions.
-   Dialogs should have a clear title, concise explanation, and explicit
    primary/secondary actions.
-   Avoid nested modal stacks where possible.

### Notifications

Use brief toasts for transient events such as save completion or copy
confirmation. Keep persistent errors in the relevant panel so the user
can return to them. Do not use lime success toasts for every routine
interaction.

### Loading states

-   Prefer skeletons for known content structures.
-   Use a small spinner for short, indeterminate actions.
-   For workflow runs, show meaningful progress and current node status
    when the runtime exposes that information.
-   Avoid fake progress percentages.

### Search and command actions

Search should be fast, keyboard-friendly, and predictable. If a command
palette exists, keep it focused on real actions and searchable
destinations. Do not add a command palette merely as a visual flourish.

------------------------------------------------------------------------

## 7. Motion and feedback

Motion exists to clarify cause and effect.

### Timing guidelines

-   Hover/focus transitions: 120--180 ms
-   Menu/popover transitions: 140--200 ms
-   Side panel transitions: 180--240 ms
-   Canvas execution indication: brief and restrained
-   Avoid long cinematic transitions inside the working application

Use opacity and small positional changes for menus and panels. Avoid
springy overshoot, large scaling, scroll-jacking, and persistent
pulsing.

### Reduced motion

Respect `prefers-reduced-motion`. When enabled:

-   Disable animated connection flow.
-   Replace motion-based transitions with immediate state changes or
    subtle fades.
-   Preserve all information conveyed by animation using labels and
    status indicators.

### Feedback requirements

Every important action should provide a visible response:

-   Save: saving, saved, or failed state
-   Run: starting, running, completed, or failed state
-   Node validation: inline feedback
-   Copy: brief confirmation
-   Delete: confirmation when destructive
-   Connection creation: visible target and completion state

------------------------------------------------------------------------

## 8. Responsive behavior

The desktop canvas is the primary target, but the interface must remain
usable at smaller sizes.

### Large desktop: 1280 px and above

-   Three-part workspace shell.
-   Both side panels can remain open when the canvas retains enough
    width.
-   Execution drawer can be expanded.

### Small desktop / tablet: 768--1279 px

-   Sidebars become collapsible drawers.
-   Keep the canvas as the main surface.
-   Open the inspector as an overlay or a docked panel depending on
    available width.
-   Ensure controls do not overlap the graph.

### Mobile: below 768 px

A complex graph editor may not provide full editing parity on a narrow
screen. Prioritize:

-   Workflow list and workflow details
-   Run history and status
-   Execution trace and error inspection
-   Readable node details and payload inspection
-   A clear explanation when full canvas editing is unavailable

Do not simply shrink the desktop three-column layout. Use a focused
single-column flow with explicit navigation between canvas, node
details, and run trace. Preserve core viewing and debugging tasks.

------------------------------------------------------------------------

## 9. Accessibility

-   Maintain WCAG AA contrast for normal text and interactive controls.
-   Ensure keyboard access to navigation, node selection, inspector
    tabs, menus, dialogs, and execution trace.
-   Provide visible focus indicators that do not depend on hover.
-   Do not rely on color alone for node status or execution outcomes.
-   Give icons and icon-only buttons accessible names.
-   Use semantic headings, labels, buttons, and status announcements.
-   Ensure code and payload viewers support keyboard navigation and text
    selection.
-   Keep targets comfortably usable; aim for at least 36 px controls in
    the dense desktop UI and larger touch targets on mobile.
-   Respect reduced-motion settings.
-   Test the canvas interaction model with keyboard-only navigation and
    assistive technology; provide an accessible alternative for graph
    operations where feasible.

------------------------------------------------------------------------

## 10. Implementation guidance

This document defines the visual system and interaction intent, not a
requirement to replace the current stack.

### Component architecture

Build reusable components around clear responsibilities:

-   `AppShell`
-   `TopBar`
-   `NavigationSidebar`
-   `NodeLibrary`
-   `WorkflowCanvas`
-   `WorkflowNode`
-   `ConnectionEdge`
-   `CanvasControls`
-   `NodeInspector`
-   `RunInspector`
-   `ExecutionTimeline`
-   `PayloadViewer`
-   `StatusBadge`
-   `ConfirmDialog`
-   `ToastRegion`
-   `EmptyState`

Keep workflow data and execution state separate from visual component
state. The canvas should render from the workflow model; the debugger
should render from real execution events. Avoid coupling application
logic to CSS classes or animation progress.

### Styling

-   Define color, spacing, typography, radius, and motion tokens
    centrally.
-   Prefer the project's existing styling approach; do not introduce a
    new CSS framework solely for this redesign.
-   Use CSS variables for semantic colors and theme values.
-   Keep component styles modular and avoid global selectors that leak
    into unrelated areas.
-   Use icons from one consistent icon family.
-   Keep third-party UI dependencies limited to components that provide
    meaningful behavior or accessibility.

### Performance

-   Avoid expensive blur and backdrop-filter effects across large areas.
-   Animate only properties that can be rendered efficiently.
-   Keep canvas rendering responsive with large graphs.
-   Virtualize long node lists, execution logs, and event traces when
    necessary.
-   Lazy-load heavy payload viewers or advanced inspectors if they are
    not initially visible.
-   Avoid loading multiple font families and unnecessary decorative
    assets.

### Design implementation sequence

1.  Establish design tokens and base typography.
2.  Build the application shell and panel sizing behavior.
3.  Implement node, edge, selection, and validation states.
4.  Add the inspector and node configuration patterns.
5.  Add execution timeline and payload inspection.
6.  Add loading, empty, error, and success states.
7.  Implement responsive panel behavior and mobile trace inspection.
8.  Audit keyboard navigation, contrast, and reduced motion.
9.  Test with realistic small and large workflows, including failure
    cases.

------------------------------------------------------------------------

## 11. Do / Don't checklist

### Do

-   Keep the canvas visually dominant.
-   Use lime as a restrained, meaningful accent.
-   Make node selection and execution status unmistakable.
-   Use real workflow and runtime data.
-   Keep logs and payloads readable and copyable.
-   Provide actionable error messages.
-   Prefer consistent spacing and strong alignment.
-   Use motion only when it explains state.
-   Design empty, loading, error, and success states.
-   Make panels collapsible and adapt the layout to available space.

### Don't

-   Copy the exact visual language of n8n, Node-RED, or other workflow
    editors.
-   Turn every node into a colorful card.
-   Use neon gradients, glowing borders, glassmorphism, or 3D effects as
    the default style.
-   Fill the interface with decorative metrics or fake telemetry.
-   Add a terminal, HUD, ambient sound, or animated background unless it
    solves a real user problem.
-   Make every action a bright primary button.
-   Animate connections continuously when the workflow is idle.
-   Hide important errors behind transient notifications.
-   Shrink the desktop canvas into an unusable mobile layout.
-   sacrifice contrast or accessibility for visual minimalism.

------------------------------------------------------------------------

## 12. Definition of done

The Precision Studio design is ready when:

-   The workflow canvas is the clear focal point.
-   The application uses a consistent token-based dark theme.
-   Lime accent use is restrained and semantically meaningful.
-   Nodes have clear default, hover, selected, running, success, and
    failure states.
-   Users can inspect a run and understand which node failed and why.
-   Inputs, outputs, logs, and error details remain readable.
-   Loading, empty, validation, and error states are designed.
-   The interface works with collapsed panels and smaller viewports.
-   Keyboard focus, contrast, and reduced motion have been checked.
-   No decorative metric or control is presented as functional unless it
    is backed by real behavior.

**Final direction:** Precision Studio should feel quiet when a workflow
is idle, precise when a developer is editing, and exceptionally clear
when something fails.
