/**
 * FlowForge — Automatic Graph Layout Engine
 * Pure TypeScript topological rank layout (FR-009).
 * Arranges nodes left-to-right by control-flow depth and orders conditional branches
 * ('true' above 'false') without altering any node configurations or edge connections.
 */

import type { WorkflowDocument, WorkflowNode } from '../types/workflow';

export interface AutoLayoutOptions {
  startX?: number;
  centerY?: number;
  columnGap?: number;
  rowGap?: number;
}

/**
 * Computes deterministic, readable canvas coordinates for all nodes in a workflow document.
 */
export function autoLayoutWorkflow(
  workflow: WorkflowDocument,
  options: AutoLayoutOptions = {},
): WorkflowDocument {
  const startX = options.startX ?? 80;
  const centerY = options.centerY ?? 200;
  const columnGap = options.columnGap ?? 280;
  const rowGap = options.rowGap ?? 180;

  const cloned = structuredClone(workflow);
  if (cloned.nodes.length === 0) {
    return cloned;
  }

  const nodeMap = new Map<string, WorkflowNode>();
  const outgoing = new Map<string, Array<{ target: string; handle: string }>>();
  const incomingCount = new Map<string, number>();

  for (const node of cloned.nodes) {
    nodeMap.set(node.id, node);
    outgoing.set(node.id, []);
    incomingCount.set(node.id, 0);
  }

  for (const edge of cloned.edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    outgoing.get(edge.source)!.push({
      target: edge.target,
      handle: edge.sourceHandle ?? 'next',
    });
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  // Assign layers via bounded BFS from triggers / roots
  const layerByNode = new Map<string, number>();
  const branchBiasByNode = new Map<string, number>();

  const roots = cloned.nodes.filter(
    (n) => n.type === 'trigger' || (incomingCount.get(n.id) ?? 0) === 0,
  );
  if (roots.length === 0 && cloned.nodes.length > 0) {
    roots.push(cloned.nodes[0]);
  }

  const queue: Array<{ id: string; depth: number; bias: number }> = roots.map(
    (r, idx) => ({
      id: r.id,
      depth: 0,
      bias: idx,
    }),
  );

  const maxDepthCap = cloned.nodes.length;
  const visitCounts = new Map<string, number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const visits = (visitCounts.get(current.id) ?? 0) + 1;
    if (visits > maxDepthCap) continue;
    visitCounts.set(current.id, visits);

    const prevLayer = layerByNode.get(current.id);
    if (prevLayer === undefined || current.depth > prevLayer) {
      layerByNode.set(current.id, Math.min(current.depth, maxDepthCap));
    }
    if (!branchBiasByNode.has(current.id)) {
      branchBiasByNode.set(current.id, current.bias);
    }

    const outs = outgoing.get(current.id) ?? [];
    for (let i = 0; i < outs.length; i++) {
      const out = outs[i];
      const handleOffset =
        out.handle === 'true' ? -1 : out.handle === 'false' ? 1 : i * 0.5;
      queue.push({
        id: out.target,
        depth: Math.min(current.depth + 1, maxDepthCap),
        bias: current.bias + handleOffset,
      });
    }
  }

  // Group nodes by assigned layer; any unvisited nodes go into layer 0 at the bottom
  const layers = new Map<number, WorkflowNode[]>();
  for (const node of cloned.nodes) {
    const rank = layerByNode.get(node.id) ?? 0;
    const list = layers.get(rank) ?? [];
    list.push(node);
    layers.set(rank, list);
  }

  const sortedRanks = Array.from(layers.keys()).sort((a, b) => a - b);

  sortedRanks.forEach((rank, colIndex) => {
    const nodesInLayer = layers.get(rank)!;
    nodesInLayer.sort((a, b) => {
      const biasA = branchBiasByNode.get(a.id) ?? 0;
      const biasB = branchBiasByNode.get(b.id) ?? 0;
      if (biasA !== biasB) return biasA - biasB;
      if (a.position.y !== b.position.y) return a.position.y - b.position.y;
      return a.id.localeCompare(b.id);
    });

    const count = nodesInLayer.length;
    nodesInLayer.forEach((node, rowIndex) => {
      const x = Math.round(startX + colIndex * columnGap);
      const rawY = Math.round(
        centerY + (rowIndex - (count - 1) / 2) * rowGap,
      );
      const y = Math.max(40, rawY);
      node.position = { x, y };
    });
  });

  cloned.updatedAt = new Date().toISOString();
  return cloned;
}

