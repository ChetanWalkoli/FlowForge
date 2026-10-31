/**
 * FlowForge — Static Graph Validation & Port Compatibility Rules
 * Pure domain module (no React or UI imports).
 */

import {
  arePortTypesCompatible,
  getNodeSpecification,
  NODE_REGISTRY,
} from '../registry/node-registry';
import type {
  ValidationIssue,
  ValidationReport,
  WorkflowDocument,
  WorkflowEdge,
  WorkflowNode,
} from '../types/workflow';
import { WorkflowDocumentSchema } from '../../schemas/workflow-schema';

export interface ConnectionValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Checks whether a proposed edge connection between two nodes/handles is valid.
 */
export function validateConnection(
  nodes: WorkflowNode[],
  existingEdges: WorkflowEdge[],
  connection: {
    source: string;
    sourceHandle: string | null;
    target: string;
    targetHandle: string | null;
  },
): ConnectionValidationResult {
  const { source, sourceHandle, target, targetHandle } = connection;

  if (source === target) {
    return {
      valid: false,
      reason: 'Self-connections on the same node are not allowed.',
    };
  }

  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);

  if (!sourceNode || !targetNode) {
    return {
      valid: false,
      reason: 'Source or target node does not exist in workflow.',
    };
  }

  if (targetNode.type === 'trigger') {
    return {
      valid: false,
      reason: 'Trigger nodes are entry points and cannot receive incoming connections.',
    };
  }

  if (sourceNode.type === 'end') {
    return {
      valid: false,
      reason: 'End nodes are terminal and cannot have outgoing connections.',
    };
  }

  const sourceSpec = getNodeSpecification(sourceNode.type);
  const targetSpec = getNodeSpecification(targetNode.type);

  const resolvedSourceHandle =
    sourceHandle ?? sourceSpec.outputs[0]?.id ?? null;
  const resolvedTargetHandle =
    targetHandle ?? targetSpec.inputs[0]?.id ?? null;

  const sourcePort = sourceSpec.outputs.find(
    (p) => p.id === resolvedSourceHandle,
  );
  if (!sourcePort) {
    return {
      valid: false,
      reason: `Node "${sourceNode.name}" does not have output port "${resolvedSourceHandle ?? 'default'}".`,
    };
  }

  const targetPort = targetSpec.inputs.find(
    (p) => p.id === resolvedTargetHandle,
  );
  if (!targetPort) {
    return {
      valid: false,
      reason: `Node "${targetNode.name}" does not have input port "${resolvedTargetHandle ?? 'default'}".`,
    };
  }

  if (!arePortTypesCompatible(sourcePort.dataType, targetPort.dataType)) {
    return {
      valid: false,
      reason: `Incompatible port types: cannot connect "${sourcePort.dataType}" output to "${targetPort.dataType}" input.`,
    };
  }

  const duplicateEdge = existingEdges.some(
    (e) =>
      e.source === source &&
      (e.sourceHandle ?? sourceSpec.outputs[0]?.id ?? null) ===
        resolvedSourceHandle &&
      e.target === target &&
      (e.targetHandle ?? targetSpec.inputs[0]?.id ?? null) ===
        resolvedTargetHandle,
  );

  if (duplicateEdge) {
    return {
      valid: false,
      reason: 'A connection between these exact ports already exists.',
    };
  }

  return { valid: true };
}

/**
 * Validates the entire workflow graph for structural integrity, schema compliance,
 * reachability, cycles, and required branch connections.
 */
export function validateWorkflow(
  workflow: WorkflowDocument,
  options?: { allowLoops?: boolean },
): ValidationReport {
  const issues: ValidationIssue[] = [];
  let issueSeq = 1;

  const pushIssue = (
    item: Omit<ValidationIssue, 'id'>,
  ): void => {
    issues.push({
      id: `val_${issueSeq++}`,
      ...item,
    });
  };

  // 1. Schema validation
  const schemaResult = WorkflowDocumentSchema.safeParse(workflow);
  if (!schemaResult.success) {
    for (const zIssue of schemaResult.error.issues) {
      const pathParts = zIssue.path;
      let nodeId: string | undefined;
      if (pathParts[0] === 'nodes' && typeof pathParts[1] === 'number') {
        nodeId = workflow.nodes[pathParts[1]]?.id;
      }
      pushIssue({
        code: 'SCHEMA_INVALID',
        severity: 'error',
        message: zIssue.message,
        remediation: 'Complete or fix the highlighted field in the Node Inspector.',
        nodeId,
        fieldPath: pathParts.join('.'),
      });
    }
  }

  const nodes = workflow.nodes;
  const edges = workflow.edges;

  // 2. Check duplicate node IDs
  const nodeMap = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    if (nodeMap.has(node.id)) {
      pushIssue({
        code: 'DUPLICATE_NODE_ID',
        severity: 'error',
        message: `Duplicate node ID "${node.id}" found.`,
        remediation: 'Remove or recreate the duplicate node so every node has a unique ID.',
        nodeId: node.id,
      });
    }
    nodeMap.set(node.id, node);
  }

  // 3. Trigger node requirements
  const triggerNodes = nodes.filter((n) => n.type === 'trigger');
  if (triggerNodes.length === 0) {
    pushIssue({
      code: 'MISSING_TRIGGER',
      severity: 'error',
      message: 'Workflow must have a Trigger node as its entry point.',
      remediation: 'Add a Trigger node from the Node Library to start the workflow.',
    });
  } else if (triggerNodes.length > 1) {
    for (const extraTrigger of triggerNodes.slice(1)) {
      pushIssue({
        code: 'MULTIPLE_TRIGGERS',
        severity: 'error',
        message: `Multiple Trigger nodes found ("${extraTrigger.name}"). MVP workflows require a single Trigger entry point.`,
        remediation: 'Keep only one Trigger node in the workflow.',
        nodeId: extraTrigger.id,
      });
    }
  }

  // 4. End node requirements
  const endNodes = nodes.filter((n) => n.type === 'end');
  if (endNodes.length === 0) {
    pushIssue({
      code: 'MISSING_END_NODE',
      severity: 'error',
      message: 'Workflow must have at least one End node to mark completion.',
      remediation: 'Add an End node and connect your terminal action branch(es) to it.',
    });
  }

  // 5. Edge reference & port validation
  const outgoingByNode = new Map<string, WorkflowEdge[]>();
  const incomingByNode = new Map<string, WorkflowEdge[]>();

  for (const node of nodes) {
    outgoingByNode.set(node.id, []);
    incomingByNode.set(node.id, []);
  }

  for (const edge of edges) {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);

    if (!srcNode || !tgtNode) {
      pushIssue({
        code: 'BROKEN_EDGE_REFERENCE',
        severity: 'error',
        message: `Edge "${edge.id}" references a missing node (${!srcNode ? edge.source : edge.target}).`,
        remediation: 'Delete the broken connection and reconnect valid nodes.',
        edgeId: edge.id,
      });
      continue;
    }

    const connCheck = validateConnection(
      nodes,
      edges.filter((e) => e.id !== edge.id),
      edge,
    );
    if (!connCheck.valid) {
      pushIssue({
        code: 'INVALID_CONNECTION',
        severity: 'error',
        message: connCheck.reason ?? 'Invalid connection between ports.',
        remediation: 'Reconnect compatible input and output ports.',
        edgeId: edge.id,
        nodeId: srcNode.id,
      });
    }

    outgoingByNode.get(srcNode.id)?.push(edge);
    incomingByNode.get(tgtNode.id)?.push(edge);
  }

  // 6. Check Condition branches and disconnected nodes
  for (const node of nodes) {
    const spec = NODE_REGISTRY[node.type];
    if (!spec) {
      pushIssue({
        code: 'UNKNOWN_NODE_TYPE',
        severity: 'error',
        message: `Unknown node type "${String(node.type)}" on node "${node.id}".`,
        remediation: 'Replace this node with a registered FlowForge node type.',
        nodeId: node.id,
      });
      continue;
    }

    const incoming = incomingByNode.get(node.id) ?? [];
    const outgoing = outgoingByNode.get(node.id) ?? [];

    if (node.type !== 'trigger' && incoming.length === 0) {
      pushIssue({
        code: 'DISCONNECTED_NODE_INPUT',
        severity: 'error',
        message: `Node "${node.name}" has no incoming connection.`,
        remediation: `Connect an upstream node's output handle to "${node.name}".`,
        nodeId: node.id,
      });
    }

    if (node.type !== 'end' && outgoing.length === 0) {
      pushIssue({
        code: 'DEAD_END_NODE',
        severity: 'warning',
        message: `Node "${node.name}" has no outgoing connection to an End node or downstream step.`,
        remediation: `Connect "${node.name}" to the next step or an End node.`,
        nodeId: node.id,
      });
    }

    if (node.type === 'condition') {
      const hasTrueBranch = outgoing.some((e) => e.sourceHandle === 'true');
      const hasFalseBranch = outgoing.some((e) => e.sourceHandle === 'false');

      if (!hasTrueBranch && !hasFalseBranch) {
        pushIssue({
          code: 'MISSING_CONDITION_BRANCHES',
          severity: 'error',
          message: `Condition "${node.name}" has neither "true" nor "false" output branches connected.`,
          remediation: 'Connect at least one branch ("true" and/or "false") from the Condition node.',
          nodeId: node.id,
        });
      } else if (!hasTrueBranch || !hasFalseBranch) {
        const missingBranch = !hasTrueBranch ? 'true' : 'false';
        pushIssue({
          code: 'INCOMPLETE_CONDITION_BRANCH',
          severity: 'warning',
          message: `Condition "${node.name}" is missing a connection on its "${missingBranch}" branch.`,
          remediation: `Connect the "${missingBranch}" handle so both outcomes are explicitly handled.`,
          nodeId: node.id,
        });
      }
    }

    if (node.type === 'subflow') {
      if (!node.config.targetWorkflowId || node.config.targetWorkflowId.trim() === '') {
        pushIssue({
          code: 'SUBFLOW_TARGET_MISSING',
          severity: 'warning',
          message: `Subflow "${node.name}" has no target workflow selected.`,
          remediation: 'Select a target workflow in the contextual inspector.',
          nodeId: node.id,
        });
      } else if (node.config.targetWorkflowId === workflow.id) {
        pushIssue({
          code: 'SUBFLOW_CIRCULAR_REFERENCE',
          severity: 'error',
          message: `Subflow "${node.name}" references its parent workflow (direct recursive loop).`,
          remediation: 'Select a different child workflow to prevent infinite recursion.',
          nodeId: node.id,
        });
      }
    }
  }

  // 7. Reachability from Trigger
  if (triggerNodes.length >= 1) {
    const visited = new Set<string>();
    const queue: string[] = [triggerNodes[0].id];
    while (queue.length > 0) {
      const currId = queue.shift()!;
      if (visited.has(currId)) continue;
      visited.add(currId);
      const outs = outgoingByNode.get(currId) ?? [];
      for (const edge of outs) {
        if (!visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        pushIssue({
          code: 'UNREACHABLE_NODE',
          severity: 'error',
          message: `Node "${node.name}" is unreachable from the Trigger node.`,
          remediation: 'Connect a path from the Trigger node to this node or remove it.',
          nodeId: node.id,
        });
      }
    }
  }

  // 8. Cycle detection (DFS 3-color marking)
  const color = new Map<string, 0 | 1 | 2>(); // 0 = unvisited, 1 = visiting, 2 = visited
  for (const node of nodes) {
    color.set(node.id, 0);
  }

  const cycleReportedFor = new Set<string>();

  const dfsCycle = (u: string): void => {
    color.set(u, 1);
    const outs = outgoingByNode.get(u) ?? [];
    for (const edge of outs) {
      const v = edge.target;
      const vColor = color.get(v) ?? 0;
      if (vColor === 1) {
        const targetNode = nodeMap.get(v);
        const isPermittedLoop =
          options?.allowLoops === true && targetNode?.type === 'loop';
        if (!isPermittedLoop && !cycleReportedFor.has(v)) {
          cycleReportedFor.add(v);
          pushIssue({
            code: 'CYCLE_DETECTED',
            severity: 'error',
            message: `Unsupported cycle detected involving node "${targetNode?.name ?? v}".`,
            remediation:
              'Remove the backward edge creating the cycle. Workflows must be acyclic unless using an explicit bounded Loop construct.',
            nodeId: v,
            edgeId: edge.id,
          });
        }
      } else if (vColor === 0) {
        dfsCycle(v);
      }
    }
    color.set(u, 2);
  };

  for (const node of nodes) {
    if ((color.get(node.id) ?? 0) === 0) {
      dfsCycle(node.id);
    }
  }

  const errorsCount = issues.filter((i) => i.severity === 'error').length;
  const warningsCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    valid: errorsCount === 0 && warningsCount === 0,
    canExecute: errorsCount === 0,
    issues,
    errorsCount,
    warningsCount,
  };
}

