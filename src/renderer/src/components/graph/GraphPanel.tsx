import { useCallback, useState, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useReactFlow,
  type OnSelectionChangeParams,
  type Node
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import {
  useGraphStore,
  useCurrentNodes,
  useCurrentEdges,
  useSelectedNodeIds,
  getConnectedNodeIds,
  isEdgeConnected
} from '../../store/graphStore'
import { ZoomLevelIndicator } from './ZoomLevelIndicator'

function GraphCanvas(): React.JSX.Element {
  const rawNodes = useCurrentNodes()
  const rawEdges = useCurrentEdges()
  const selectedNodeIds = useSelectedNodeIds()
  const {
    onNodesChange,
    onEdgesChange,
    onConnect,
    zoomLevel,
    layoutCurrentLevel,
    setSelectedNodeIds
  } = useGraphStore()
  const { fitView } = useReactFlow()

  // Track selected nodes for the info panel
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([])

  const onSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      setSelectedNodes(params.nodes)
      // Update store with selected node IDs for highlighting
      setSelectedNodeIds(params.nodes.map((node) => node.id))
    },
    [setSelectedNodeIds]
  )

  // Compute styled nodes with selection-based dimming (memoized to avoid infinite loops)
  const nodes = useMemo(() => {
    // No selection - return nodes as-is
    if (selectedNodeIds.size === 0) {
      return rawNodes
    }

    // Compute connected nodes (selected + predecessors + successors)
    const connectedIds = getConnectedNodeIds(selectedNodeIds, rawEdges)

    // Apply dimming to nodes not in the connected set
    return rawNodes.map((node) => {
      const isConnected = connectedIds.has(node.id)
      const isSelected = selectedNodeIds.has(node.id)

      if (isConnected) {
        // Keep full opacity, but add a highlight ring for selected nodes
        if (isSelected) {
          return {
            ...node,
            style: {
              ...node.style,
              boxShadow: '0 0 0 2px #22d3ee, 0 0 12px 2px rgba(34, 211, 238, 0.4)'
            }
          }
        }
        return node
      }

      // Dim unconnected nodes
      return {
        ...node,
        style: {
          ...node.style,
          opacity: 0.2
        }
      }
    })
  }, [rawNodes, rawEdges, selectedNodeIds])

  // Compute styled edges with selection-based dimming (memoized to avoid infinite loops)
  const edges = useMemo(() => {
    // No selection - return edges as-is
    if (selectedNodeIds.size === 0) {
      return rawEdges
    }

    // Compute connected nodes
    const connectedIds = getConnectedNodeIds(selectedNodeIds, rawEdges)

    // Apply dimming to edges not connected to the highlighted subgraph
    return rawEdges.map((edge) => {
      if (isEdgeConnected(edge, connectedIds)) {
        return edge
      }

      // Dim unconnected edges
      return {
        ...edge,
        style: {
          ...edge.style,
          opacity: 0.15
        }
      }
    })
  }, [rawEdges, selectedNodeIds])

  // Layout nodes when zoom level changes OR when nodes are loaded (e.g., from async symbol loading)
  useEffect(() => {
    const doLayout = async (): Promise<void> => {
      // Only layout if we have nodes to layout
      if (nodes.length === 0) {
        return
      }

      await layoutCurrentLevel()
      // Small delay to ensure nodes are rendered before fitting
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 })
      }, 50)
    }
    doLayout()
  }, [zoomLevel, nodes.length, layoutCurrentLevel, fitView])

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        // Selection configuration:
        // - Click = select single node (default behavior)
        // - Shift+Click = add to multi-selection (multiSelectionKeyCode)
        // - Selection box disabled (selectionKeyCode=null)
        multiSelectionKeyCode="Shift"
        selectionKeyCode={null}
        selectNodesOnDrag={false}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={20} size={1} />
      </ReactFlow>

      {/* Zoom level indicator */}
      <ZoomLevelIndicator />

      {/* Selection info panel */}
      {selectedNodes.length > 0 && (
        <div className="absolute bottom-4 left-4 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-3 backdrop-blur-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Selected ({selectedNodes.length})
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {selectedNodes.map((node) => (
              <span
                key={node.id}
                className="rounded-full bg-cyan-500/20 px-2.5 py-1 text-xs font-medium text-cyan-300"
              >
                {String(node.data?.label ?? node.id)}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export function GraphPanel(): React.JSX.Element {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <GraphCanvas />
      </ReactFlowProvider>
    </div>
  )
}
