# FlowForge — Workflow Document Format Specification

**Format Identifier:** `flowforge.workflow`  
**Current Format Version:** `1`

---

## 1. Document Envelope

Every serialized FlowForge workflow document adheres to the following versioned JSON envelope:

```json
{
  "format": "flowforge.workflow",
  "formatVersion": 1,
  "id": "wf_expense_approval",
  "name": "Expense approval",
  "description": "Route expenses based on amount threshold",
  "revision": 1,
  "status": "validated",
  "nodes": [],
  "edges": [],
  "createdAt": "2026-10-30T00:00:00.000Z",
  "updatedAt": "2026-10-30T00:00:00.000Z"
}
```

### Envelope Constraints
- `format`: Must literally equal `"flowforge.workflow"`.
- `formatVersion`: Positive integer (`1`).
- `id`: Non-empty string identifier (`1..128` characters).
- `name`: Non-empty human-readable workflow title (`1..120` characters).
- `description`: Optional string (`0..1000` characters).
- `revision`: Positive integer (`>= 1`), incremented on revision checkpoints.
- `status`: Optional lifecycle state (`"draft" | "validated" | "tested" | "published"`).
- `nodes`: Array of `WorkflowNode` items (max `500` in standard import limits).
- `edges`: Array of `WorkflowEdge` items (max `1000` in standard import limits).
- `createdAt`, `updatedAt`: Valid ISO-8601 datetime strings.

---

## 2. Node Structure & Typed Configurations

Every node in `nodes` shares a common base shape:

```ts
type WorkflowNode = {
  id: string;
  type: NodeType; // "trigger" | "condition" | "action" | "transform" | "end" | "delay" | "retry" | "loop" | "merge"
  name: string;
  version: number;
  position: { x: number; y: number };
  config: NodeConfig;
};
```

### 2.1 Trigger Node (`type: "trigger"`)
- **Ports:** 0 inputs, 1 output (`id: "next"`, `dataType: "object"`).
- **Config Schema:**
  ```json
  {
    "label": "Expense submitted",
    "inputSchema": {
      "amount": "number",
      "requester": "string",
      "department": "string"
    },
    "sampleInput": {
      "amount": 4500,
      "requester": "ada@example.com",
      "department": "Engineering"
    }
  }
  ```

### 2.2 Condition Node (`type: "condition"`)
- **Ports:** 1 input (`id: "in"`, `dataType: "any"`), 2 outputs (`id: "true"`, `id: "false"`, `dataType: "any"`).
- **Supported Operators:**
  - `equals`, `notEquals`
  - `greaterThan`, `greaterThanOrEqual`
  - `lessThan`, `lessThanOrEqual`
  - `isEmpty`, `isNotEmpty`
  - `contains`
- **Config Schema:**
  ```json
  {
    "description": "Check if expense is within auto-approval limit",
    "left": {
      "source": "trigger",
      "path": "amount"
    },
    "operator": "lessThanOrEqual",
    "right": {
      "kind": "literal",
      "value": 10000
    }
  }
  ```
  - Note: `left.source` can be `"trigger"` (resolving from initial trigger input) or a specific upstream `nodeId` (resolving from `context.nodeOutputs[nodeId]`).
  - For unary operators (`isEmpty`, `isNotEmpty`), `right` is optional.

### 2.3 Action Node (`type: "action"`)
- **Ports:** 1 input (`id: "in"`, `dataType: "any"`), 1 output (`id: "next"`, `dataType: "any"`).
- **Supported Action Kinds:**
  - `setValue`: Sets a named key/value in the output and variables context.
  - `buildObject`: Constructs an object from literal values or upstream references.
  - `appendLog`: Appends a formatted diagnostic message to the node output log list.
  - `returnResult`: Produces a structured status/payload object for downstream consumption.
- **Config Schema:**
  ```json
  {
    "actionType": "buildObject",
    "label": "Auto-approve expense",
    "fields": {
      "approved": { "kind": "literal", "value": true },
      "tier": { "kind": "literal", "value": "automatic" },
      "amount": { "kind": "ref", "source": "trigger", "path": "amount" },
      "requester": { "kind": "ref", "source": "trigger", "path": "requester" }
    }
  }
  ```

### 2.4 Transform Node (`type: "transform"`)
- **Ports:** 1 input (`id: "in"`, `dataType: "any"`), 1 output (`id: "next"`, `dataType: "any"`).
- **Supported Transform Operations:**
  - `selectField`: Extracts a single value by source & dot-path.
  - `renameFields`: Maps input object keys to new key names.
  - `constructObject`: Assembles a new object from field mappings.
  - `convertType`: Converts a field to `"string" | "number" | "boolean"` with explicit failure if conversion is invalid (e.g., `NaN`).

### 2.5 End Node (`type: "end"`)
- **Ports:** 1 input (`id: "in"`, `dataType: "any"`), 0 outputs.
- **Config Schema:**
  ```json
  {
    "label": "Workflow complete",
    "outputSource": "upstream",
    "requiredFields": ["approved", "tier"]
  }
  ```

---

## 3. Edge Structure

```ts
type WorkflowEdge = {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
  label?: string;
};
```

- `source` and `target` must reference existing node IDs in `nodes`.
- Self-loops (`source === target`) are rejected.
- `sourceHandle` must match a defined output port on the source node (`"next"`, `"true"`, `"false"`, etc.).
- `targetHandle` must match a defined input port on the target node (`"in"`).

