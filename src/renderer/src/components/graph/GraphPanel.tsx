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
import { NodeDetailPanel } from './NodeDetailPanel'
import { resolveSymbolConstruct } from '../../store/symbolHelpers'
import type { ExtractedSymbol, ModuleNode } from '../../../../preload/index.d'

// Default panel width matches the defaultSize in NodeDetailPanel
const DEFAULT_DETAIL_PANEL_WIDTH = 400

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
    setSelectedNodeIds,
    setZoomLevel,
    semanticAnalysis
  } = useGraphStore()
  const { fitView } = useReactFlow()

  // Track selected nodes for the info panel
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([])
  // Track if detail panel is open (user can close it even when node is selected)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  // Track detail panel width for positioning other elements
  const [detailPanelWidth, setDetailPanelWidth] = useState(DEFAULT_DETAIL_PANEL_WIDTH)

  const onSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      setSelectedNodes(params.nodes)
      // Update store with selected node IDs for highlighting
      setSelectedNodeIds(params.nodes.map((node) => node.id))
      // Open detail panel when a node is selected
      if (params.nodes.length > 0) {
        setDetailPanelOpen(true)
      }
    },
    [setSelectedNodeIds]
  )

  // Get the first selected symbol for the detail panel
  const selectedSymbol: ExtractedSymbol | null = useMemo(() => {
    if (selectedNodes.length === 0) return null
    const firstNode = selectedNodes[0]
    // Symbol is stored in node.data.symbol by symbolsToNodes() in graphStore
    return (firstNode.data?.symbol as ExtractedSymbol) ?? null
  }, [selectedNodes])

  // Get the construct (module) that the selected symbol belongs to
  const selectedSymbolConstructInfo = useMemo(() => {
    if (!selectedSymbol || !semanticAnalysis) return undefined

    const modules = semanticAnalysis.modules as ModuleNode[]
    const constructId = resolveSymbolConstruct(selectedSymbol.id, modules)

    if (!constructId) return undefined

    // Find the module to get its name
    const module = modules.find((m) => m.id === constructId)
    if (!module) return undefined

    return {
      id: module.id,
      name: module.name
    }
  }, [selectedSymbol, semanticAnalysis])

  // Create a Set of all node IDs in the graph (for checking navigability)
  const graphNodeIds = useMemo(() => {
    return new Set(rawNodes.map((node) => node.id))
  }, [rawNodes])

  // Handle navigation from detail panel (when clicking on a type badge)
  const handleNavigateToSymbol = useCallback(
    (symbolId: string) => {
      // Select the node in the graph
      setSelectedNodeIds([symbolId])
      // Update local state
      const targetNode = rawNodes.find((node) => node.id === symbolId)
      if (targetNode) {
        setSelectedNodes([targetNode])
      }
    },
    [rawNodes, setSelectedNodeIds]
  )

  // Close detail panel handler
  const handleCloseDetailPanel = useCallback(() => {
    setDetailPanelOpen(false)
  }, [])

  // Handle navigation from detail panel to construct (zoom level change)
  const handleNavigateToConstruct = useCallback(
    (constructId: string) => {
      // Close detail panel (we're leaving symbol view)
      setDetailPanelOpen(false)
      // Clear local selection state
      setSelectedNodes([])
      // Change to construct zoom level
      setZoomLevel('construct')
      // Select the construct node (will be highlighted after zoom change)
      setSelectedNodeIds([constructId])
    },
    [setZoomLevel, setSelectedNodeIds]
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

      {/* Zoom level indicator - offset when detail panel is open */}
      <ZoomLevelIndicator
        leftOffset={detailPanelOpen && selectedSymbol ? detailPanelWidth + 32 : 16}
      />

      {/* Node detail panel - shows when a symbol node is selected and panel is open */}
      {detailPanelOpen && selectedSymbol && (
        <NodeDetailPanel
          symbol={selectedSymbol}
          onClose={handleCloseDetailPanel}
          graphNodeIds={graphNodeIds}
          onNavigateToSymbol={handleNavigateToSymbol}
          onResize={setDetailPanelWidth}
          constructInfo={selectedSymbolConstructInfo}
          onNavigateToConstruct={handleNavigateToConstruct}
        />
      )}

      {/* Selection info panel - offset when detail panel is open */}
      {selectedNodes.length > 0 && (
        <div
          className="absolute bottom-4 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-3 backdrop-blur-sm z-0 transition-[left] duration-150"
          style={{ left: detailPanelOpen && selectedSymbol ? detailPanelWidth + 32 : 16 }}
        >
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
