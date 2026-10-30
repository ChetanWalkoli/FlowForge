/**
 * FlowForge — Graph Adjacency Indexer and Deterministic Execution Scheduler
 * Implements graph indexing, handle-selective traversal, and diamond-safe branch skip propagation.
 * Pure TypeScript module with zero React, Zustand, DOM, or IndexedDB dependencies.
 * Never uses eval() or new Function().
 */

import { NODE_REGISTRY } from '../domain/registry/node-registry';
import type {
  ExecutionContext,
  WorkflowDocument,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRunRecord,
} from '../domain/types/workflow';
import {
  EngineExecutionError,
  resolveSourcePayload,
  toStructuredExecutionError,
} from './context';
import {
  executeNodeHandler,
  type NodeHandlerInput,
  type NodeHandlerResult,
} from './handlers';
import type { TraceRecorder } from './trace';

export const DEFAULT_MAX_STEPS = 500;
export const DEFAULT_MAX_DURATION_MS = 30_000;
export const DEFAULT_HANDLER_TIMEOUT_MS = 5_000;

export interface NormalizedWorkflowEdge extends WorkflowEdge {
  resolvedSourceHandle: string;
  resolvedTargetHandle: string;
}

export interface GraphExecutionIndex {
  nodeMap: Map<string, WorkflowNode>;
  edgeMap: Map<string, NormalizedWorkflowEdge>;
  outgoingEdgesByNode: Map<string, NormalizedWorkflowEdge[]>;
  incomingEdgesByNode: Map<string, NormalizedWorkflowEdge[]>;
  outgoingEdgesByNodeAndHandle: Map<string, NormalizedWorkflowEdge[]>;
  triggerNode: WorkflowNode;
  endNodes: WorkflowNode[];
  reachableNodeIds: Set<string>;
  disconnectedNodes: WorkflowNode[];
}

export type NodeHandlerRunner = (
  params: NodeHandlerInput,
) => Promise<NodeHandlerResult> | NodeHandlerResult;

export interface SchedulerOptions {
  signal?: AbortSignal;
  maxSteps?: number;
  maxDurationMs?: number;
  handlerTimeoutMs?: number;
  now?: () => number;
  onBeforeNodeStep?: (node: WorkflowNode) => Promise<void> | void;
  nodeRunner?: NodeHandlerRunner;
}

type EdgeDisposition = 'pending' | 'activated' | 'skipped';
type NodeScheduleState = 'pending' | 'queued' | 'executed' | 'skipped';

/**
 * Builds and validates the graph adjacency index for deterministic execution scheduling.
 * Throws `EngineExecutionError` if node IDs, Trigger/End requirements, edge references,
 * port handles, or acyclicity invariants are violated.
 */
export function buildGraphExecutionIndex(
  workflow: Pick<WorkflowDocument, 'id' | 'name' | 'nodes' | 'edges'>,
): GraphExecutionIndex {
  const nodeMap = new Map<string, WorkflowNode>();
  const edgeMap = new Map<string, NormalizedWorkflowEdge>();
  const outgoingEdgesByNode = new Map<string, NormalizedWorkflowEdge[]>();
  const incomingEdgesByNode = new Map<string, NormalizedWorkflowEdge[]>();
  const outgoingEdgesByNodeAndHandle = new Map<string, NormalizedWorkflowEdge[]>();

  // 1. Index nodes and check for duplicate IDs or unknown node types
  for (const node of workflow.nodes) {
    if (nodeMap.has(node.id)) {
      throw new EngineExecutionError({
        code: 'ERR_DUPLICATE_NODE_ID',
        message: `Workflow contains duplicate node ID "${node.id}".`,
        nodeId: node.id,
        remediation: 'Ensure every node in the workflow has a unique ID.',
      });
    }

    const spec = NODE_REGISTRY[node.type];
    if (!spec) {
      throw new EngineExecutionError({
        code: 'ERR_UNKNOWN_NODE_TYPE',
        message: `Node "${node.id}" has unknown node type "${String(node.type)}".`,
        nodeId: node.id,
        remediation: 'Replace the node with a supported FlowForge node type.',
      });
    }

    nodeMap.set(node.id, node);
    outgoingEdgesByNode.set(node.id, []);
    incomingEdgesByNode.set(node.id, []);
  }

  // 2. Validate Trigger and End nodes
  const triggerNodes = workflow.nodes.filter((n) => n.type === 'trigger');
  if (triggerNodes.length === 0) {
    throw new EngineExecutionError({
      code: 'ERR_MISSING_TRIGGER',
      message: 'Workflow cannot execute because it has no Trigger node.',
      remediation: 'Add a Trigger node as the workflow entry point.',
    });
  }
  if (triggerNodes.length > 1) {
    throw new EngineExecutionError({
      code: 'ERR_MULTIPLE_TRIGGERS',
      message: `Workflow has ${triggerNodes.length} Trigger nodes; MVP execution requires a single Trigger entry point.`,
      nodeId: triggerNodes[1].id,
      remediation: 'Keep only one Trigger node in the workflow.',
    });
  }

  const endNodes = workflow.nodes.filter((n) => n.type === 'end');
  if (endNodes.length === 0) {
    throw new EngineExecutionError({
      code: 'ERR_MISSING_END_NODE',
      message: 'Workflow cannot execute because it has no End node.',
      remediation: 'Add at least one End node to terminate the workflow.',
    });
  }

  const triggerNode = triggerNodes[0];

  // 3. Validate and index edges in deterministic declaration order
  for (const edge of workflow.edges) {
    if (edgeMap.has(edge.id)) {
      throw new EngineExecutionError({
        code: 'ERR_DUPLICATE_EDGE_ID',
        message: `Workflow contains duplicate edge ID "${edge.id}".`,
        remediation: 'Ensure every edge in the workflow has a unique ID.',
      });
    }

    if (edge.source === edge.target) {
      throw new EngineExecutionError({
        code: 'ERR_SELF_LOOP_EDGE',
        message: `Edge "${edge.id}" connects node "${edge.source}" to itself.`,
        nodeId: edge.source,
        remediation: 'Remove the self-connecting edge.',
      });
    }

    const sourceNode = nodeMap.get(edge.source);
    if (!sourceNode) {
      throw new EngineExecutionError({
        code: 'ERR_BROKEN_EDGE_REFERENCE',
        message: `Edge "${edge.id}" references missing source node "${edge.source}".`,
        remediation: 'Remove or reconnect the broken edge.',
      });
    }

    const targetNode = nodeMap.get(edge.target);
    if (!targetNode) {
      throw new EngineExecutionError({
        code: 'ERR_BROKEN_EDGE_REFERENCE',
        message: `Edge "${edge.id}" references missing target node "${edge.target}".`,
        remediation: 'Remove or reconnect the broken edge.',
      });
    }

    if (targetNode.type === 'trigger') {
      throw new EngineExecutionError({
        code: 'ERR_INVALID_EDGE_HANDLE',
        message: `Edge "${edge.id}" cannot connect into Trigger node "${targetNode.name}".`,
        nodeId: targetNode.id,
        remediation: 'Trigger nodes cannot have incoming edges.',
      });
    }

    if (sourceNode.type === 'end') {
      throw new EngineExecutionError({
        code: 'ERR_INVALID_EDGE_HANDLE',
        message: `Edge "${edge.id}" cannot originate from End node "${sourceNode.name}".`,
        nodeId: sourceNode.id,
        remediation: 'End nodes are terminal and cannot have outgoing edges.',
      });
    }

    const sourceSpec = NODE_REGISTRY[sourceNode.type];
    const targetSpec = NODE_REGISTRY[targetNode.type];

    const resolvedSourceHandle =
      edge.sourceHandle ?? sourceSpec.outputs[0]?.id ?? '';
    const resolvedTargetHandle =
      edge.targetHandle ?? targetSpec.inputs[0]?.id ?? '';

    const validSourcePort = sourceSpec.outputs.some(
      (p) => p.id === resolvedSourceHandle,
    );
    if (!validSourcePort) {
      throw new EngineExecutionError({
        code: 'ERR_INVALID_EDGE_HANDLE',
        message: `Edge "${edge.id}" references invalid output handle "${resolvedSourceHandle}" on node "${sourceNode.name}" (${sourceNode.type}).`,
        nodeId: sourceNode.id,
        remediation: `Use a valid output port for ${sourceNode.type}: ${sourceSpec.outputs.map((p) => p.id).join(', ')}.`,
      });
    }

    const validTargetPort = targetSpec.inputs.some(
      (p) => p.id === resolvedTargetHandle,
    );
    if (!validTargetPort) {
      throw new EngineExecutionError({
        code: 'ERR_INVALID_EDGE_HANDLE',
        message: `Edge "${edge.id}" references invalid input handle "${resolvedTargetHandle}" on node "${targetNode.name}" (${targetNode.type}).`,
        nodeId: targetNode.id,
        remediation: `Use a valid input port for ${targetNode.type}: ${targetSpec.inputs.map((p) => p.id).join(', ')}.`,
      });
    }

    const normalizedEdge: NormalizedWorkflowEdge = {
      ...edge,
      resolvedSourceHandle,
      resolvedTargetHandle,
    };

    edgeMap.set(edge.id, normalizedEdge);
    outgoingEdgesByNode.get(sourceNode.id)!.push(normalizedEdge);
    incomingEdgesByNode.get(targetNode.id)!.push(normalizedEdge);

    const handleKey = `${sourceNode.id}::${resolvedSourceHandle}`;
    const handleList = outgoingEdgesByNodeAndHandle.get(handleKey) ?? [];
    handleList.push(normalizedEdge);
    outgoingEdgesByNodeAndHandle.set(handleKey, handleList);
  }

  // 4. Detect cycles via 3-color DFS
  const visitColor = new Map<string, 0 | 1 | 2>();
  for (const node of workflow.nodes) {
    visitColor.set(node.id, 0);
  }

  const detectCycleDfs = (u: string): void => {
    visitColor.set(u, 1);
    const outgoing = outgoingEdgesByNode.get(u) ?? [];
    for (const edge of outgoing) {
      const v = edge.target;
      const color = visitColor.get(v) ?? 0;
      if (color === 1) {
        const targetNode = nodeMap.get(v);
        throw new EngineExecutionError({
          code: 'ERR_CYCLE_DETECTED',
          message: `Unsupported cycle detected involving node "${targetNode?.name ?? v}" (${v}).`,
          nodeId: v,
          remediation:
            'Remove the backward edge creating the cycle before executing.',
        });
      }
      if (color === 0) {
        detectCycleDfs(v);
      }
    }
    visitColor.set(u, 2);
  };

  for (const node of workflow.nodes) {
    if ((visitColor.get(node.id) ?? 0) === 0) {
      detectCycleDfs(node.id);
    }
  }

  // 5. Compute reachability from Trigger via BFS
  const reachableNodeIds = new Set<string>();
  const bfsQueue: string[] = [triggerNode.id];
  while (bfsQueue.length > 0) {
    const currId = bfsQueue.shift()!;
    if (reachableNodeIds.has(currId)) continue;
    reachableNodeIds.add(currId);
    const outgoing = outgoingEdgesByNode.get(currId) ?? [];
    for (const edge of outgoing) {
      if (!reachableNodeIds.has(edge.target)) {
        bfsQueue.push(edge.target);
      }
    }
  }

  const disconnectedNodes = workflow.nodes.filter(
    (n) => !reachableNodeIds.has(n.id),
  );

  return {
    nodeMap,
    edgeMap,
    outgoingEdgesByNode,
    incomingEdgesByNode,
    outgoingEdgesByNodeAndHandle,
    triggerNode,
    endNodes,
    reachableNodeIds,
    disconnectedNodes,
  };
}

/**
 * Executes a validated workflow graph deterministically using handle-selective routing
 * and diamond-safe branch skip propagation.
 */
export async function runWorkflowSchedule(
  workflow: Pick<WorkflowDocument, 'id' | 'name' | 'revision' | 'nodes' | 'edges'>,
  context: ExecutionContext,
  recorder: TraceRecorder,
  options: SchedulerOptions = {},
): Promise<WorkflowRunRecord> {
  const now = options.now ?? (() => Date.now());
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const handlerTimeoutMs =
    options.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;
  const runner: NodeHandlerRunner = options.nodeRunner ?? executeNodeHandler;
  const signal = options.signal;

  let index: GraphExecutionIndex;
  try {
    index = buildGraphExecutionIndex(workflow);
  } catch (err) {
    const structuredError = toStructuredExecutionError(err);
    recorder.recordRunStarted(now());
    recorder.recordRunFailed(structuredError, now());
    return recorder.getSnapshot();
  }

  const runStartTime = now();
  recorder.recordRunStarted(runStartTime);

  if (signal?.aborted) {
    recorder.recordRunCancelled(now());
    return recorder.getSnapshot();
  }

  const edgeDisposition = new Map<string, EdgeDisposition>();
  const edgeSkipReason = new Map<string, string>();
  const nodeState = new Map<string, NodeScheduleState>();
  const activatingUpstreamByNode = new Map<string, string | null>();

  for (const edge of index.edgeMap.values()) {
    edgeDisposition.set(edge.id, 'pending');
  }
  for (const node of workflow.nodes) {
    nodeState.set(node.id, 'pending');
  }

  // Mark disconnected nodes (unreachable from Trigger) and their outgoing edges as skipped upfront
  // so they never execute and never block a reachable node's incoming edge resolution.
  for (const disconnected of index.disconnectedNodes) {
    nodeState.set(disconnected.id, 'skipped');
    const skipReason = `Disconnected from Trigger (${index.triggerNode.id})`;
    recorder.recordNodeSkipped(disconnected, skipReason, now());

    const outs = index.outgoingEdgesByNode.get(disconnected.id) ?? [];
    for (const edge of outs) {
      edgeDisposition.set(edge.id, 'skipped');
      edgeSkipReason.set(edge.id, skipReason);
    }
  }

  const executionQueue: string[] = [];
  const enqueueNode = (nodeId: string, upstreamNodeId: string | null) => {
    const currentState = nodeState.get(nodeId);
    if (currentState !== 'pending') return;
    nodeState.set(nodeId, 'queued');
    activatingUpstreamByNode.set(nodeId, upstreamNodeId);
    executionQueue.push(nodeId);
  };

  /**
   * Diamond-Safe Readiness & Skip Propagation:
   * Evaluates candidate target nodes in BFS order whenever incoming edge dispositions change.
   * - A node is still waiting if ANY of its incoming edges is `'pending'`.
   * - Once ALL incoming edges to a node are resolved (`'activated'` or `'skipped'`):
   *   - If AT LEAST ONE incoming edge is `'activated'`, the node is enqueued for execution once.
   *   - If ALL incoming edges are `'skipped'`, the node is marked `'skipped'` and all of its
   *     outgoing edges are marked `'skipped'`, propagating further downstream.
   */
  const resolveDownstreamCandidates = (initialCandidateNodeIds: string[]) => {
    const candidateQueue = [...initialCandidateNodeIds];

    while (candidateQueue.length > 0) {
      const targetId = candidateQueue.shift()!;
      if (nodeState.get(targetId) !== 'pending') {
        continue;
      }

      const incomingEdges = index.incomingEdgesByNode.get(targetId) ?? [];
      if (incomingEdges.length === 0) {
        continue;
      }

      const hasPendingIncoming = incomingEdges.some(
        (e) => edgeDisposition.get(e.id) === 'pending',
      );
      if (hasPendingIncoming) {
        // Still waiting on at least one active/pending upstream branch (diamond convergence protection)
        continue;
      }

      const activatedEdges = incomingEdges.filter(
        (e) => edgeDisposition.get(e.id) === 'activated',
      );

      if (activatedEdges.length > 0) {
        // Use the most recently activated incoming edge's source as the immediate upstream node
        const winningEdge = activatedEdges[activatedEdges.length - 1];
        enqueueNode(targetId, winningEdge.source);
      } else {
        // Every incoming edge to targetId is 'skipped' -> mark targetId as 'skipped'
        const targetNode = index.nodeMap.get(targetId)!;
        const primarySkipReason =
          edgeSkipReason.get(incomingEdges[0].id) ??
          `All incoming branches to "${targetNode.name}" were skipped`;

        nodeState.set(targetId, 'skipped');
        recorder.recordNodeSkipped(targetNode, primarySkipReason, now());

        // Propagate 'skipped' disposition to all outgoing edges of targetNode
        const outgoingEdges = index.outgoingEdgesByNode.get(targetId) ?? [];
        for (const outEdge of outgoingEdges) {
          if (edgeDisposition.get(outEdge.id) === 'pending') {
            edgeDisposition.set(outEdge.id, 'skipped');
            edgeSkipReason.set(outEdge.id, primarySkipReason);
            candidateQueue.push(outEdge.target);
          }
        }
      }
    }
  };

  // Seed execution queue with the single Trigger node
  enqueueNode(index.triggerNode.id, null);

  let stepsExecuted = 0;
  let reachedEndNode = false;
  let finalWorkflowOutput: unknown = undefined;

  while (executionQueue.length > 0) {
    if (signal?.aborted) {
      recorder.recordRunCancelled(now());
      return recorder.getSnapshot();
    }

    const currentTimestamp = now();
    if (currentTimestamp - runStartTime > maxDurationMs) {
      const timeoutError = {
        code: 'ERR_EXECUTION_TIMEOUT',
        message: `Workflow execution exceeded maximum time limit of ${maxDurationMs}ms.`,
        remediation:
          'Simplify the workflow or increase the maximum execution duration limit.',
      };
      recorder.recordRunFailed(timeoutError, currentTimestamp);
      return recorder.getSnapshot();
    }

    if (stepsExecuted >= maxSteps) {
      const budgetError = {
        code: 'ERR_MAX_STEPS_EXCEEDED',
        message: `Workflow execution exceeded the maximum step budget of ${maxSteps} steps.`,
        remediation:
          'Verify the workflow does not contain runaway branches or increase maxSteps.',
      };
      recorder.recordRunFailed(budgetError, currentTimestamp);
      return recorder.getSnapshot();
    }

    const currentNodeId = executionQueue.shift()!;
    const currentNode = index.nodeMap.get(currentNodeId)!;
    const upstreamNodeId = activatingUpstreamByNode.get(currentNodeId) ?? null;

    if (options.onBeforeNodeStep) {
      await options.onBeforeNodeStep(currentNode);
      if (signal?.aborted) {
        recorder.recordRunCancelled(now());
        return recorder.getSnapshot();
      }
    }

    stepsExecuted += 1;

    let nodeInputPayload: unknown = undefined;
    const stepStartTime = now();

    try {
      // Resolve input payload for trace visibility inside the try block
      nodeInputPayload =
        currentNode.type === 'trigger'
          ? structuredClone(context.input)
          : structuredClone(
              resolveSourcePayload(context, 'upstream', {
                triggerNodeId: index.triggerNode.id,
                currentNodeId: currentNode.id,
                upstreamNodeId,
              }),
            );

      recorder.recordNodeStarted(
        currentNode,
        nodeInputPayload,
        1,
        stepStartTime,
      );

      const rawOutcome = runner({
        node: currentNode,
        context,
        triggerNodeId: index.triggerNode.id,
        upstreamNodeId,
        now,
      });

      let handlerResult: NodeHandlerResult;
      if (rawOutcome instanceof Promise) {
        handlerResult = await new Promise<NodeHandlerResult>(
          (resolve, reject) => {
            let settled = false;

            const cleanup = () => {
              globalThis.clearTimeout(timer);
              if (signal) {
                signal.removeEventListener('abort', onAbort);
              }
            };

            const onAbort = () => {
              if (settled) return;
              settled = true;
              cleanup();
              resolve({ output: undefined, nextHandleIds: [] });
            };

            const timer = globalThis.setTimeout(() => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(
                new EngineExecutionError({
                  code: 'ERR_HANDLER_TIMEOUT',
                  message: `Node "${currentNode.name}" (${currentNode.id}) exceeded handler timeout limit of ${handlerTimeoutMs}ms.`,
                  nodeId: currentNode.id,
                  remediation:
                    'Reduce node handler latency or increase handlerTimeoutMs.',
                }),
              );
            }, handlerTimeoutMs);

            if (signal) {
              signal.addEventListener('abort', onAbort, { once: true });
            }

            rawOutcome.then(
              (res) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(res);
              },
              (err) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(err);
              },
            );
          },
        );
      } else {
        handlerResult = rawOutcome;
      }

      if (signal?.aborted) {
        recorder.recordRunCancelled(now());
        return recorder.getSnapshot();
      }

      const stepEndTime = now();
      if (stepEndTime - stepStartTime > handlerTimeoutMs) {
        throw new EngineExecutionError({
          code: 'ERR_HANDLER_TIMEOUT',
          message: `Node "${currentNode.name}" (${currentNode.id}) exceeded handler timeout limit of ${handlerTimeoutMs}ms.`,
          nodeId: currentNode.id,
          remediation:
            'Reduce node handler duration or increase handlerTimeoutMs.',
        });
      }

      if (stepEndTime - runStartTime > maxDurationMs) {
        throw new EngineExecutionError({
          code: 'ERR_EXECUTION_TIMEOUT',
          message: `Workflow execution exceeded maximum time limit of ${maxDurationMs}ms.`,
          nodeId: currentNode.id,
          remediation:
            'Simplify the workflow or increase the maximum execution duration limit.',
        });
      }

      nodeState.set(currentNode.id, 'executed');
      context.nodeOutputs[currentNode.id] = structuredClone(
        handlerResult.output,
      );

      recorder.recordNodeCompleted(
        currentNode,
        nodeInputPayload,
        handlerResult.output,
        1,
        stepEndTime,
      );

      if (handlerResult.conditionReason) {
        const chosenHandle = handlerResult.nextHandleIds[0] ?? 'false';
        recorder.recordBranchSelected(
          currentNode.id,
          chosenHandle,
          handlerResult.conditionReason,
          now(),
        );
      }

      if (handlerResult.isTerminal || currentNode.type === 'end') {
        reachedEndNode = true;
        finalWorkflowOutput = structuredClone(handlerResult.output);
        continue;
      }

      // Evaluate outgoing edges against handler's selected output handles
      const selectedHandleSet = new Set(handlerResult.nextHandleIds);
      const outgoingEdges =
        index.outgoingEdgesByNode.get(currentNode.id) ?? [];
      const affectedTargetIds: string[] = [];

      for (const edge of outgoingEdges) {
        if (selectedHandleSet.has(edge.resolvedSourceHandle)) {
          edgeDisposition.set(edge.id, 'activated');
          recorder.recordEdgeTraversed(edge.id);
          affectedTargetIds.push(edge.target);
        } else {
          const skipMsg = `Branch not selected (${currentNode.id}:${edge.resolvedSourceHandle})`;
          edgeDisposition.set(edge.id, 'skipped');
          edgeSkipReason.set(edge.id, skipMsg);
          affectedTargetIds.push(edge.target);
        }
      }

      resolveDownstreamCandidates(affectedTargetIds);
    } catch (err) {
      const structuredError = toStructuredExecutionError(err, currentNode.id);
      recorder.recordNodeFailed(
        currentNode,
        nodeInputPayload,
        structuredError,
        1,
        now(),
      );
      recorder.recordRunFailed(structuredError, now());
      return recorder.getSnapshot();
    }
  }

  if (!reachedEndNode) {
    const noEndError = {
      code: 'ERR_END_NOT_REACHED',
      message:
        'Workflow execution finished active branches without reaching an End node.',
      remediation:
        'Connect all active Condition and Action branches to an End node.',
    };
    recorder.recordRunFailed(noEndError, now());
    return recorder.getSnapshot();
  }

  recorder.recordRunCompleted(finalWorkflowOutput, now());
  return recorder.getSnapshot();
}

