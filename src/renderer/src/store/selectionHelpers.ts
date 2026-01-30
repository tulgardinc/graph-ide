import type { Edge } from '@xyflow/react'

// =============================================================================
// SELECTION HIGHLIGHTING HELPERS
// =============================================================================

/**
 * Compute the set of connected node IDs (all transitive predecessors + successors)
 * for the selected nodes. Traverses the entire dependency chain.
 * - Predecessors: all nodes in the chain that eventually point TO the selected nodes
 * - Successors: all nodes in the chain that selected nodes eventually point TO
 */
export function getConnectedNodeIds(selectedIds: Set<string>, edges: Edge[]): Set<string> {
  // Start with selected nodes themselves
  const connected = new Set(selectedIds)

  // Build adjacency maps for efficient traversal
  const predecessorMap = new Map<string, string[]>() // target -> sources (who points to me)
  const successorMap = new Map<string, string[]>() // source -> targets (who I point to)

  for (const edge of edges) {
    // Build predecessor map (target -> sources)
    if (!predecessorMap.has(edge.target)) {
      predecessorMap.set(edge.target, [])
    }
    predecessorMap.get(edge.target)!.push(edge.source)

    // Build successor map (source -> targets)
    if (!successorMap.has(edge.source)) {
      successorMap.set(edge.source, [])
    }
    successorMap.get(edge.source)!.push(edge.target)
  }

  // BFS to find all transitive predecessors (nodes that eventually reach selected)
  const predecessorQueue = [...selectedIds]
  while (predecessorQueue.length > 0) {
    const nodeId = predecessorQueue.shift()!
    const preds = predecessorMap.get(nodeId) || []
    for (const pred of preds) {
      if (!connected.has(pred)) {
        connected.add(pred)
        predecessorQueue.push(pred)
      }
    }
  }

  // BFS to find all transitive successors (nodes that selected eventually reach)
  const successorQueue = [...selectedIds]
  while (successorQueue.length > 0) {
    const nodeId = successorQueue.shift()!
    const succs = successorMap.get(nodeId) || []
    for (const succ of succs) {
      if (!connected.has(succ)) {
        connected.add(succ)
        successorQueue.push(succ)
      }
    }
  }

  return connected
}

/**
 * Check if an edge is connected to the selected/highlighted nodes
 */
export function isEdgeConnected(edge: Edge, connectedNodeIds: Set<string>): boolean {
  return connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target)
}
