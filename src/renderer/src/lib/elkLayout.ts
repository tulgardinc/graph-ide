import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js'
import type { Node, Edge } from '@xyflow/react'

const elk = new ELK()

// Default node dimensions (used when node doesn't have explicit dimensions)
const DEFAULT_NODE_WIDTH = 140
const DEFAULT_NODE_HEIGHT = 50

export interface ElkLayoutOptions {
  /** Layout direction: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT' */
  direction?: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'
  /** Spacing between nodes at the same level */
  nodeSpacing?: number
  /** Spacing between different hierarchy levels */
  layerSpacing?: number
  /** Algorithm to use */
  algorithm?: 'layered' | 'force' | 'mrtree' | 'radial' | 'stress'
}

const defaultOptions: ElkLayoutOptions = {
  direction: 'DOWN',
  nodeSpacing: 50,
  layerSpacing: 80,
  algorithm: 'layered'
}

/**
 * Compute layout for nodes and edges using ELK.js
 * Returns nodes with updated positions
 */
export async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: ElkLayoutOptions = {}
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const opts = { ...defaultOptions, ...options }

  // Convert React Flow nodes to ELK nodes
  const elkNodes: ElkNode[] = nodes.map((node) => ({
    id: node.id,
    width: getNodeWidth(node),
    height: getNodeHeight(node)
  }))

  // Convert React Flow edges to ELK edges
  const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target]
  }))

  // Create the ELK graph
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': opts.algorithm ?? 'layered',
      'elk.direction': opts.direction ?? 'DOWN',
      'elk.spacing.nodeNode': String(opts.nodeSpacing ?? 50),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(opts.layerSpacing ?? 80),
      // Additional options for better layouts
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX'
    },
    children: elkNodes,
    edges: elkEdges
  }

  // Compute the layout
  const layoutedGraph = await elk.layout(elkGraph)

  // Map the computed positions back to React Flow nodes
  const layoutedNodes = nodes.map((node) => {
    const elkNode = layoutedGraph.children?.find((n) => n.id === node.id)
    if (elkNode && elkNode.x !== undefined && elkNode.y !== undefined) {
      return {
        ...node,
        position: {
          x: elkNode.x,
          y: elkNode.y
        }
      }
    }
    return node
  })

  return {
    nodes: layoutedNodes,
    edges
  }
}

/**
 * Get the width of a node, using style.width or default
 */
function getNodeWidth(node: Node): number {
  if (node.measured?.width) {
    return node.measured.width
  }
  if (node.style?.width) {
    return typeof node.style.width === 'number' ? node.style.width : parseInt(node.style.width, 10)
  }
  return DEFAULT_NODE_WIDTH
}

/**
 * Get the height of a node, using style.height or default
 */
function getNodeHeight(node: Node): number {
  if (node.measured?.height) {
    return node.measured.height
  }
  if (node.style?.height) {
    return typeof node.style.height === 'number'
      ? node.style.height
      : parseInt(node.style.height, 10)
  }
  return DEFAULT_NODE_HEIGHT
}
