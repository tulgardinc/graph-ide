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
import { SemanticNodeDetailPanel } from './SemanticNodeDetailPanel'
import { resolveSymbolModule } from '../../store/symbolHelpers'
import type { ExtractedSymbol, ModuleNode, SemanticNode } from '../../../../preload/index.d'

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
    semanticAnalysis,
    pendingSymbolIdsToSelect,
    clearPendingSymbolIdsToSelect,
    openModuleSymbolView
  } = useGraphStore()
  const { fitView, setNodes } = useReactFlow()

  // =============================================================================
  // SELECTION STATE
  // =============================================================================
  //
  // IMPORTANT: React Flow is the source of truth for node selection.
  //
  // There are two selection-related states:
  // 1. React Flow's internal selection (node.selected property)
  //    - This is the source of truth
  //    - Managed by React Flow when user clicks nodes
  //    - Can be programmatically set via setNodes() with selected: true/false
  //    - Triggers onSelectionChange callback when changed
  //
  // 2. selectedNodeIds (Zustand store) and selectedNodes (local state)
  //    - These are DERIVED from React Flow's selection via onSelectionChange
  //    - Used for highlighting (dimming unconnected nodes) and UI (detail panel)
  //    - DO NOT set these directly - always go through React Flow's selection
  //
  // To programmatically select nodes:
  //   ✅ Use setNodes() to set node.selected = true, which triggers onSelectionChange
  //   ❌ Don't use setSelectedNodeIds() directly - this bypasses React Flow
  //
  // =============================================================================

  // Track selected nodes for the info panel (derived from React Flow's selection)
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

  // Determine if selected node is a semantic node (system, domain, module)
  const selectedSemanticNode: SemanticNode | null = useMemo(() => {
    if (selectedNodes.length === 0 || !semanticAnalysis) return null
    const firstNode = selectedNodes[0]
    const nodeId = firstNode.id

    // Check if this is a semantic node by ID prefix
    if (nodeId.startsWith('system:')) {
      return semanticAnalysis.systems.find((s) => s.id === nodeId) ?? null
    }
    if (nodeId.startsWith('domain:')) {
      return semanticAnalysis.domains.find((d) => d.id === nodeId) ?? null
    }
    if (nodeId.startsWith('module:')) {
      return semanticAnalysis.modules.find((m) => m.id === nodeId) ?? null
    }

    return null
  }, [selectedNodes, semanticAnalysis])

  // Get the first selected symbol for the detail panel (only if not a semantic node)
  const selectedSymbol: ExtractedSymbol | null = useMemo(() => {
    if (selectedNodes.length === 0) return null
    if (selectedSemanticNode) return null // If semantic node, don't show symbol panel
    const firstNode = selectedNodes[0]
    // Symbol is stored in node.data.symbol by symbolsToNodes() in graphStore
    return (firstNode.data?.symbol as ExtractedSymbol) ?? null
  }, [selectedNodes, selectedSemanticNode])

  // Get the module that the selected symbol belongs to
  const selectedSymbolModuleInfo = useMemo(() => {
    if (!selectedSymbol || !semanticAnalysis) return undefined

    const modules = semanticAnalysis.modules as ModuleNode[]
    const moduleId = resolveSymbolModule(selectedSymbol.id, modules)

    if (!moduleId) return undefined

    // Find the module to get its name
    const module = modules.find((m) => m.id === moduleId)
    if (!module) return undefined

    return {
      id: module.id,
      name: module.name
    }
  }, [selectedSymbol, semanticAnalysis])

  // Get parent info for the selected semantic node
  const semanticNodeParentInfo = useMemo(() => {
    if (!selectedSemanticNode || !semanticAnalysis) return undefined

    const parentId = selectedSemanticNode.parentId
    if (!parentId) return undefined

    // Find the parent in systems or domains
    const parentSystem = semanticAnalysis.systems.find((s) => s.id === parentId)
    if (parentSystem) {
      return { id: parentSystem.id, name: parentSystem.name, layer: 'system' }
    }

    const parentDomain = semanticAnalysis.domains.find((d) => d.id === parentId)
    if (parentDomain) {
      return { id: parentDomain.id, name: parentDomain.name, layer: 'domain' }
    }

    return undefined
  }, [selectedSemanticNode, semanticAnalysis])

  // Get children info for the selected semantic node
  const semanticNodeChildrenInfo = useMemo(() => {
    if (!selectedSemanticNode || !semanticAnalysis) return undefined

    const childIds = selectedSemanticNode.children || []
    if (childIds.length === 0) return undefined

    const children: Array<{ id: string; name: string }> = []

    for (const childId of childIds) {
      // Look in domains
      const domain = semanticAnalysis.domains.find((d) => d.id === childId)
      if (domain) {
        children.push({ id: domain.id, name: domain.name })
        continue
      }

      // Look in modules
      const module = semanticAnalysis.modules.find((m) => m.id === childId)
      if (module) {
        children.push({ id: module.id, name: module.name })
      }
    }

    return children.length > 0 ? children : undefined
  }, [selectedSemanticNode, semanticAnalysis])

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

  // Helper to programmatically select nodes through React Flow
  // This ensures selection goes through React Flow's system, triggering onSelectionChange
  const selectNodesByIds = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length === 0) return

      const nodeIdSet = new Set(nodeIds)
      // Use setNodes to mark nodes as selected - this triggers onSelectionChange
      setNodes((currentNodes) =>
        currentNodes.map((n) => ({
          ...n,
          selected: nodeIdSet.has(n.id)
        }))
      )
    },
    [setNodes]
  )

  // Handle navigation from detail panel to module (zoom level change)
  const handleNavigateToModule = useCallback(
    (moduleId: string) => {
      // Close detail panel (we're leaving symbol view)
      setDetailPanelOpen(false)
      // Clear local selection state
      setSelectedNodes([])
      // Change to module zoom level
      setZoomLevel('module')
      // Select through React Flow after nodes are rendered (source of truth for selection)
      setTimeout(() => selectNodesByIds([moduleId]), 100)
    },
    [setZoomLevel, selectNodesByIds]
  )

  // Handle navigation from semantic node to parent
  const handleNavigateToSemanticParent = useCallback(
    (parentId: string) => {
      // Determine target zoom level from parent ID
      let targetLevel: 'system' | 'domain' | 'module' = 'system'
      if (parentId.startsWith('domain:')) {
        targetLevel = 'domain'
      } else if (parentId.startsWith('module:')) {
        targetLevel = 'module'
      }

      // Close detail panel temporarily
      setDetailPanelOpen(false)
      setSelectedNodes([])

      // Change zoom level
      setZoomLevel(targetLevel)
      // Select through React Flow after nodes are rendered (source of truth for selection)
      setTimeout(() => selectNodesByIds([parentId]), 100)
    },
    [setZoomLevel, selectNodesByIds]
  )

  // Handle navigation from semantic node to child
  const handleNavigateToSemanticChild = useCallback(
    (childId: string) => {
      // Determine target zoom level from child ID
      let targetLevel: 'system' | 'domain' | 'module' = 'module'
      if (childId.startsWith('domain:')) {
        targetLevel = 'domain'
      } else if (childId.startsWith('system:')) {
        targetLevel = 'system'
      }

      // Close detail panel temporarily
      setDetailPanelOpen(false)
      setSelectedNodes([])

      // Change zoom level
      setZoomLevel(targetLevel)
      // Select through React Flow after nodes are rendered (source of truth for selection)
      setTimeout(() => selectNodesByIds([childId]), 100)
    },
    [setZoomLevel, selectNodesByIds]
  )

  // Handle double-click drill-down navigation
  // When a node is double-clicked, navigate to the lower zoom level and select all child nodes
  const handleNodeDoubleClick = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      const nodeId = node.id

      if (!semanticAnalysis) return

      // Helper to navigate and select using React Flow's selection system
      const navigateAndSelect = (targetLevel: 'domain' | 'module', childIds: string[]): void => {
        // Close detail panel
        setDetailPanelOpen(false)
        // Navigate to target level
        setZoomLevel(targetLevel)
        // Select children after a brief delay to ensure the new level's nodes are rendered
        // Use setNodes to properly select through React Flow (triggers onSelectionChange)
        setTimeout(() => {
          if (childIds.length > 0) {
            selectNodesByIds(childIds)
          }
        }, 100)
      }

      // Handle system nodes -> drill down to domain level
      if (nodeId.startsWith('system:')) {
        const system = semanticAnalysis.systems.find((s) => s.id === nodeId)
        if (system?.children.length) {
          navigateAndSelect('domain', system.children)
        }
        return
      }

      // Handle domain nodes -> drill down to module level
      if (nodeId.startsWith('domain:')) {
        const domain = semanticAnalysis.domains.find((d) => d.id === nodeId)
        if (domain?.children.length) {
          navigateAndSelect('module', domain.children)
        }
        return
      }

      // Handle module nodes -> open module-specific symbol view
      if (nodeId.startsWith('module:')) {
        // Close detail panel
        setDetailPanelOpen(false)
        // Open the module's symbol view (async - will load symbols and build the view)
        await openModuleSymbolView(nodeId)
        return
      }

      // Symbol level: no further drill-down (already at lowest level)
    },
    [semanticAnalysis, setZoomLevel, selectNodesByIds, openModuleSymbolView]
  )

  // Compute styled nodes with selection-based dimming (memoized to avoid infinite loops)
  // NOTE: Do NOT set the `selected` property here - React Flow manages selection state
  // through onNodesChange -> applyNodeChanges. The rawNodes already have `selected`
  // set correctly. We only apply visual styling (dimming, highlight ring) based on
  // selectedNodeIds (which is derived from onSelectionChange).
  const nodes = useMemo(() => {
    // No selection - return nodes with any selection styling explicitly removed
    // We need to remove boxShadow/opacity that may have been persisted to the store
    // from previous selection styling (via onNodesChange)
    if (selectedNodeIds.size === 0) {
      return rawNodes.map((node) => ({
        ...node,
        style: {
          ...node.style,
          boxShadow: undefined, // Remove selection highlight
          opacity: undefined // Reset opacity (removes dimming)
        }
      }))
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

  // Apply pending symbol selection after symbols are loaded
  // This effect watches for pendingSymbolIdsToSelect from the store (set by loadSymbols)
  // and applies the selection through React Flow's setNodes, ensuring React Flow
  // remains the source of truth for selection state
  useEffect(() => {
    if (pendingSymbolIdsToSelect.length > 0 && rawNodes.length > 0) {
      console.log(
        '[GraphPanel] Applying pending symbol selection:',
        pendingSymbolIdsToSelect.length,
        'symbols'
      )
      // Use setTimeout to ensure nodes are rendered before selecting
      setTimeout(() => {
        selectNodesByIds(pendingSymbolIdsToSelect)
        // Clear the pending selection after applying
        clearPendingSymbolIdsToSelect()
      }, 150)
    }
  }, [pendingSymbolIdsToSelect, rawNodes.length, selectNodesByIds, clearPendingSymbolIdsToSelect])

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onNodeDoubleClick={handleNodeDoubleClick}
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
        leftOffset={
          detailPanelOpen && (selectedSymbol || selectedSemanticNode) ? detailPanelWidth + 32 : 16
        }
      />

      {/* Node detail panel - shows when a symbol node is selected and panel is open */}
      {detailPanelOpen && selectedSymbol && (
        <NodeDetailPanel
          symbol={selectedSymbol}
          onClose={handleCloseDetailPanel}
          graphNodeIds={graphNodeIds}
          onNavigateToSymbol={handleNavigateToSymbol}
          onResize={setDetailPanelWidth}
          moduleInfo={selectedSymbolModuleInfo}
          onNavigateToModule={handleNavigateToModule}
        />
      )}

      {/* Semantic node detail panel - shows when a semantic node is selected */}
      {detailPanelOpen && selectedSemanticNode && (
        <SemanticNodeDetailPanel
          node={selectedSemanticNode}
          onClose={handleCloseDetailPanel}
          onResize={setDetailPanelWidth}
          parentInfo={semanticNodeParentInfo}
          onNavigateToParent={handleNavigateToSemanticParent}
          childrenInfo={semanticNodeChildrenInfo}
          onNavigateToChild={handleNavigateToSemanticChild}
        />
      )}

      {/* Selection info panel - offset when detail panel is open */}
      {selectedNodes.length > 0 && (
        <div
          className="absolute bottom-4 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-3 backdrop-blur-sm z-0 transition-[left] duration-150"
          style={{
            left:
              detailPanelOpen && (selectedSymbol || selectedSemanticNode)
                ? detailPanelWidth + 32
                : 16
          }}
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
