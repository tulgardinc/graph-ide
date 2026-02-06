import { create } from 'zustand'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge
} from '@xyflow/react'
import { getLayoutedElements } from '../lib/elkLayout'
import { buildColorMap, type ColorMap, type ColorMapEntry } from '../lib/colorUtils'
import type { ProjectSymbols, ExtractedSymbol, SemanticAnalysis } from '../../../preload/index.d'

// Import from split files
import { type ZoomLevel, LAYOUT_OPTIONS } from './types'
import { symbolsToNodes, dependencyEdgesToFlowEdges, getSymbolsForModule } from './symbolHelpers'

// Re-export types and helpers for consumers
export {
  type ZoomLevel,
  ZOOM_LEVELS,
  ALL_ZOOM_LEVELS,
  ZOOM_LEVEL_LABELS,
  LAYOUT_OPTIONS
} from './types'
export { getConnectedNodeIds, isEdgeConnected } from './selectionHelpers'

// =============================================================================
// SEMANTIC NODE STYLING
// =============================================================================

/** Base styling per layer (sizes, padding, etc.) - colors come from ColorMap */
const LAYER_BASE_STYLES: Record<string, React.CSSProperties> = {
  system: {
    borderRadius: '12px',
    padding: '16px',
    fontWeight: 600,
    width: 160
  },
  domain: {
    borderRadius: '10px',
    padding: '14px',
    fontWeight: 500,
    width: 150
  },
  module: {
    borderRadius: '8px',
    padding: '12px',
    fontWeight: 500,
    width: 140
  }
}

/**
 * Create a semantic node with unique colors from the color map
 *
 * @param id - Node ID (e.g., "system:frontend")
 * @param label - Display label
 * @param layer - Semantic layer type
 * @param colors - Colors from the color map (background, text, border)
 * @param summary - Optional summary
 */
function createSemanticNode(
  id: string,
  label: string,
  layer: 'system' | 'domain' | 'module',
  colors: ColorMapEntry,
  summary?: string
): Node {
  return {
    id,
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label, summary, layer },
    style: {
      ...LAYER_BASE_STYLES[layer],
      background: colors.background,
      color: colors.text,
      border: `2px solid ${colors.border}`
    }
  }
}

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface GraphState {
  // Zoom level
  zoomLevel: ZoomLevel

  // Nodes and edges per zoom level
  nodesByLevel: Record<ZoomLevel, Node[]>
  edgesByLevel: Record<ZoomLevel, Edge[]>

  // Track which levels have been laid out
  layoutedLevels: Set<ZoomLevel>

  // Selection state for highlighting
  selectedNodeIds: Set<string>

  // Active module for symbol view (null when not in symbol view)
  // When set, symbol view shows only symbols from this module
  activeModuleId: string | null

  // Pending module selection for drill-down navigation
  // When drilling from module to symbol, we need to wait for symbols to load
  // before we can determine which symbols belong to the module
  pendingModuleSelectionForSymbols: string | null

  // Pending symbol IDs to select after drill-down navigation
  // This is populated by loadSymbols() and should be consumed by GraphPanel
  // to apply selection through React Flow (which is the source of truth for selection)
  pendingSymbolIdsToSelect: string[]

  // Project symbols from tree-sitter
  projectSymbols: ProjectSymbols | null
  symbolsLoading: boolean
  symbolsError: string | null

  // Semantic analysis from LLM
  semanticAnalysis: SemanticAnalysis | null
  semanticLoading: boolean
  semanticError: string | null
  semanticProgress: string | null
  semanticCurrentTool: { name: string; description: string } | null

  // Color map for visual hierarchy (nodeId → colors)
  colorMap: ColorMap

  // React Flow handlers
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect

  // Actions
  setZoomLevel: (level: ZoomLevel) => void
  setSelectedNodeIds: (ids: string[]) => void
  setPendingModuleSelectionForSymbols: (moduleId: string | null) => void
  clearPendingSymbolIdsToSelect: () => void
  layoutCurrentLevel: () => Promise<void>
  loadSymbols: () => Promise<void>
  resetSymbols: () => void
  loadSemanticAnalysis: (forceRefresh?: boolean) => Promise<void>
  openModuleSymbolView: (moduleId: string) => Promise<void>
  closeSymbolView: () => void
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useGraphStore = create<GraphState>((set, get) => ({
  zoomLevel: 'system',

  nodesByLevel: {
    system: [],
    domain: [],
    module: [],
    symbol: []
  },

  edgesByLevel: {
    system: [],
    domain: [],
    module: [],
    symbol: []
  },

  layoutedLevels: new Set<ZoomLevel>(),
  selectedNodeIds: new Set<string>(),
  activeModuleId: null,
  pendingModuleSelectionForSymbols: null,
  pendingSymbolIdsToSelect: [],

  projectSymbols: null,
  symbolsLoading: false,
  symbolsError: null,

  semanticAnalysis: null,
  semanticLoading: false,
  semanticError: null,
  semanticProgress: null,
  semanticCurrentTool: null,

  colorMap: new Map(),

  setSelectedNodeIds: (ids: string[]) => {
    set({ selectedNodeIds: new Set(ids) })
  },

  setPendingModuleSelectionForSymbols: (moduleId: string | null) => {
    set({ pendingModuleSelectionForSymbols: moduleId })
  },

  clearPendingSymbolIdsToSelect: () => {
    set({ pendingSymbolIdsToSelect: [] })
  },

  setZoomLevel: (level) => {
    set({ zoomLevel: level })
    if (level === 'symbol') {
      get().loadSymbols()
    }
  },

  loadSemanticAnalysis: async (forceRefresh = false) => {
    const { semanticLoading, semanticAnalysis } = get()

    // Skip if already loading
    if (semanticLoading) return

    // Skip if we have analysis and not forcing refresh
    if (semanticAnalysis && !forceRefresh) return

    set({
      semanticLoading: true,
      semanticError: null,
      semanticProgress: 'Starting analysis...',
      semanticCurrentTool: null
    })

    // Subscribe to progress events
    const unsubProgress = window.api.onSemanticProgress((status) => {
      set({ semanticProgress: status })
    })

    // Subscribe to tool events
    const unsubToolStart = window.api.onSemanticToolStart((data) => {
      console.log(`[GraphStore] Tool started: ${data.toolName} - ${data.description}`)
      set({ semanticCurrentTool: { name: data.toolName, description: data.description } })
    })

    const unsubToolEnd = window.api.onSemanticToolEnd((data) => {
      console.log(`[GraphStore] Tool ended: ${data.toolName}`)
      set({ semanticCurrentTool: null })
    })
    try {
      console.log('[GraphStore] Loading semantic analysis...')
      const result = await window.api.semanticAnalyze(forceRefresh)

      if (!result.success || !result.analysis) {
        throw new Error(result.error || 'Analysis failed')
      }

      const analysis = result.analysis
      console.log('[GraphStore] Semantic analysis loaded:', {
        systems: analysis.systems.length,
        domains: analysis.domains.length,
        modules: analysis.modules.length
      })

      // Populate children arrays from parentId relationships
      // (LLM only sets parentId, doesn't populate children arrays)
      for (const domain of analysis.domains) {
        if (domain.parentId) {
          const parentSystem = analysis.systems.find((s) => s.id === domain.parentId)
          if (parentSystem && !parentSystem.children.includes(domain.id)) {
            parentSystem.children.push(domain.id)
          }
        }
      }
      for (const module of analysis.modules) {
        if (module.parentId) {
          const parentDomain = analysis.domains.find((d) => d.id === module.parentId)
          if (parentDomain && !parentDomain.children.includes(module.id)) {
            parentDomain.children.push(module.id)
          }
        }
      }
      console.log('[GraphStore] Populated children arrays for drill-down navigation')

      // Build color map for unique colors with parent-child border inheritance
      const colorMap = buildColorMap(analysis.systems, analysis.domains, analysis.modules)
      console.log('[GraphStore] Built color map for', colorMap.size, 'nodes')

      // Convert semantic nodes to React Flow nodes with dynamic colors
      const systemNodes = analysis.systems.map((s) => {
        const colors = colorMap.get(s.id)!
        return createSemanticNode(s.id, s.name, 'system', colors, s.summary)
      })
      const domainNodes = analysis.domains.map((d) => {
        const colors = colorMap.get(d.id)!
        return createSemanticNode(d.id, d.name, 'domain', colors, d.summary)
      })
      const moduleNodes = analysis.modules.map((m) => {
        const colors = colorMap.get(m.id)!
        return createSemanticNode(m.id, m.name, 'module', colors, m.summary)
      })

      // Create edges from semantic edges (may be empty for partial results)
      const semanticEdges = (analysis.edges || []).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'default' as const,
        animated: edge.type === 'communicates-with',
        style: {
          stroke: edge.type === 'depends-on' ? '#3b82f6' : '#10b981',
          strokeWidth: 1.5,
          strokeDasharray: edge.type === 'communicates-with' ? '6,3' : undefined
        },
        markerEnd: {
          type: 'arrowclosed' as const,
          color: edge.type === 'depends-on' ? '#3b82f6' : '#10b981',
          width: 12,
          height: 12
        }
      }))

      // Filter edges by layer BEFORE running layout
      const systemEdges = semanticEdges.filter(
        (e) => e.source.startsWith('system:') || e.target.startsWith('system:')
      )
      const domainEdges = semanticEdges.filter(
        (e) => e.source.startsWith('domain:') || e.target.startsWith('domain:')
      )
      const moduleEdges = semanticEdges.filter(
        (e) => e.source.startsWith('module:') || e.target.startsWith('module:')
      )

      // Layout system nodes WITH edges for proper graph-aware positioning
      let layoutedSystemNodes = systemNodes
      if (systemNodes.length > 0) {
        try {
          const { nodes } = await getLayoutedElements(
            systemNodes,
            systemEdges,
            LAYOUT_OPTIONS.system
          )
          layoutedSystemNodes = nodes
        } catch (e) {
          console.error('[GraphStore] System layout failed:', e)
        }
      }

      // Layout domain nodes WITH edges
      let layoutedDomainNodes = domainNodes
      if (domainNodes.length > 0) {
        try {
          const { nodes } = await getLayoutedElements(
            domainNodes,
            domainEdges,
            LAYOUT_OPTIONS.domain
          )
          layoutedDomainNodes = nodes
        } catch (e) {
          console.error('[GraphStore] Domain layout failed:', e)
        }
      }

      // Layout module nodes WITH edges
      let layoutedModuleNodes = moduleNodes
      if (moduleNodes.length > 0) {
        try {
          const { nodes } = await getLayoutedElements(
            moduleNodes,
            moduleEdges,
            LAYOUT_OPTIONS.module
          )
          layoutedModuleNodes = nodes
        } catch (e) {
          console.error('[GraphStore] Module layout failed:', e)
        }
      }

      const currentState = get()
      set({
        semanticAnalysis: analysis,
        semanticLoading: false,
        semanticError: null,
        semanticProgress: null,
        colorMap, // Store for symbol border coloring
        nodesByLevel: {
          ...currentState.nodesByLevel,
          system: layoutedSystemNodes,
          domain: layoutedDomainNodes,
          module: layoutedModuleNodes
        },
        edgesByLevel: {
          ...currentState.edgesByLevel,
          system: systemEdges,
          domain: domainEdges,
          module: moduleEdges
        },
        layoutedLevels: new Set([...currentState.layoutedLevels, 'system', 'domain', 'module'])
      })

      console.log('[GraphStore] Semantic nodes loaded into graph')
    } catch (error) {
      console.error('[GraphStore] Failed to load semantic analysis:', error)
      set({
        semanticLoading: false,
        semanticError: error instanceof Error ? error.message : String(error),
        semanticProgress: null
      })
    } finally {
      unsubProgress()
      unsubToolStart()
      unsubToolEnd()
      set({ semanticCurrentTool: null })
    }
  },

  loadSymbols: async () => {
    const {
      projectSymbols,
      symbolsLoading,
      semanticAnalysis,
      colorMap,
      pendingModuleSelectionForSymbols
    } = get()

    // If symbols are already loaded, handle pending module selection immediately
    // This handles the case where user drills into symbols a second time
    if (projectSymbols !== null) {
      if (pendingModuleSelectionForSymbols && semanticAnalysis?.modules) {
        const symbolIds = getSymbolsForModule(
          pendingModuleSelectionForSymbols,
          semanticAnalysis.modules,
          projectSymbols
        )
        console.log(
          '[GraphStore] Symbols already loaded, applying pending selection:',
          pendingModuleSelectionForSymbols,
          '->',
          symbolIds.length,
          'symbols'
        )
        set({
          pendingSymbolIdsToSelect: symbolIds,
          pendingModuleSelectionForSymbols: null
        })
      }
      return
    }

    if (symbolsLoading) return

    set({ symbolsLoading: true, symbolsError: null })

    try {
      const projectPath = await window.api.getProjectPath()
      if (!projectPath) {
        set({ symbolsLoading: false, symbolsError: 'No project path set.' })
        return
      }

      const result = await window.api.scanProject()
      const allSymbols: ExtractedSymbol[] = result.files.flatMap((file) => file.symbols)

      // Pass modules and colorMap for construct-based border coloring
      const modules = semanticAnalysis?.modules
      const symbolNodesList = symbolsToNodes(allSymbols, modules, modules ? colorMap : undefined)

      const validNodeIds = new Set(symbolNodesList.map((node) => node.id))
      const callEdges = result.callEdges || []
      const validCallEdges = callEdges.filter(
        (edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
      )
      const symbolEdgesList = dependencyEdgesToFlowEdges(validCallEdges)

      // Run ELK layout
      let layoutedSymbolNodes = symbolNodesList
      if (symbolNodesList.length > 0) {
        try {
          const { nodes } = await getLayoutedElements(
            symbolNodesList,
            symbolEdgesList,
            LAYOUT_OPTIONS.symbol
          )
          layoutedSymbolNodes = nodes
        } catch (e) {
          console.error('[GraphStore] Symbol layout failed:', e)
        }
      }

      const currentState = get()
      const pendingModuleId = currentState.pendingModuleSelectionForSymbols

      // Check if we have a pending module selection from drill-down navigation
      let symbolIdsToSelect: string[] = []
      if (pendingModuleId && modules) {
        // Now that we have projectSymbols, we can compute which symbols belong to the module
        symbolIdsToSelect = getSymbolsForModule(pendingModuleId, modules, result)
        console.log(
          '[GraphStore] Pending module selection:',
          pendingModuleId,
          '->',
          symbolIdsToSelect.length,
          'symbols'
        )
      }

      // Complete semantic analysis with symbol data (steps 4-5)
      // This computes module and domain dependencies from symbol call edges
      let updatedAnalysis = semanticAnalysis
      try {
        console.log('[GraphStore] Completing semantic analysis with symbol data...')
        const completeResult = await window.api.semanticCompleteWithSymbols(result)
        if (completeResult.success && completeResult.analysis) {
          updatedAnalysis = completeResult.analysis
          console.log('[GraphStore] Semantic analysis completed with dependencies:', {
            systems: updatedAnalysis.systems.length,
            domains: updatedAnalysis.domains.length,
            modules: updatedAnalysis.modules.length,
            edges: updatedAnalysis.edges.length
          })

          // Rebuild semantic nodes and edges with the completed analysis
          const newColorMap = buildColorMap(
            updatedAnalysis.systems,
            updatedAnalysis.domains,
            updatedAnalysis.modules
          )

          // Create new semantic nodes
          const systemNodes = updatedAnalysis.systems.map((s) => {
            const colors = newColorMap.get(s.id)!
            return createSemanticNode(s.id, s.name, 'system', colors, s.summary)
          })
          const domainNodes = updatedAnalysis.domains.map((d) => {
            const colors = newColorMap.get(d.id)!
            return createSemanticNode(d.id, d.name, 'domain', colors, d.summary)
          })
          const moduleNodes = updatedAnalysis.modules.map((m) => {
            const colors = newColorMap.get(m.id)!
            return createSemanticNode(m.id, m.name, 'module', colors, m.summary)
          })

          // Create edges from semantic edges
          const semanticEdges = (updatedAnalysis.edges || []).map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: 'default' as const,
            animated: edge.type === 'communicates-with',
            style: {
              stroke: edge.type === 'depends-on' ? '#3b82f6' : '#10b981',
              strokeWidth: 1.5,
              strokeDasharray: edge.type === 'communicates-with' ? '6,3' : undefined
            },
            markerEnd: {
              type: 'arrowclosed' as const,
              color: edge.type === 'depends-on' ? '#3b82f6' : '#10b981',
              width: 12,
              height: 12
            }
          }))

          // Filter edges by layer
          const systemEdges = semanticEdges.filter(
            (e) => e.source.startsWith('system:') || e.target.startsWith('system:')
          )
          const domainEdges = semanticEdges.filter(
            (e) => e.source.startsWith('domain:') || e.target.startsWith('domain:')
          )
          const moduleEdges = semanticEdges.filter(
            (e) => e.source.startsWith('module:') || e.target.startsWith('module:')
          )

          // Layout nodes with edges
          let layoutedSystemNodes = systemNodes
          let layoutedDomainNodes = domainNodes
          let layoutedModuleNodes = moduleNodes

          if (systemNodes.length > 0) {
            try {
              const { nodes } = await getLayoutedElements(
                systemNodes,
                systemEdges,
                LAYOUT_OPTIONS.system
              )
              layoutedSystemNodes = nodes
            } catch (e) {
              console.error('[GraphStore] System layout failed:', e)
            }
          }

          if (domainNodes.length > 0) {
            try {
              const { nodes } = await getLayoutedElements(
                domainNodes,
                domainEdges,
                LAYOUT_OPTIONS.domain
              )
              layoutedDomainNodes = nodes
            } catch (e) {
              console.error('[GraphStore] Domain layout failed:', e)
            }
          }

          if (moduleNodes.length > 0) {
            try {
              const { nodes } = await getLayoutedElements(
                moduleNodes,
                moduleEdges,
                LAYOUT_OPTIONS.module
              )
              layoutedModuleNodes = nodes
            } catch (e) {
              console.error('[GraphStore] Module layout failed:', e)
            }
          }

          // Update state with completed analysis
          set({
            semanticAnalysis: updatedAnalysis,
            colorMap: newColorMap,
            nodesByLevel: {
              ...currentState.nodesByLevel,
              system: layoutedSystemNodes,
              domain: layoutedDomainNodes,
              module: layoutedModuleNodes,
              symbol: layoutedSymbolNodes
            },
            edgesByLevel: {
              ...currentState.edgesByLevel,
              system: systemEdges,
              domain: domainEdges,
              module: moduleEdges,
              symbol: symbolEdgesList
            },
            layoutedLevels: new Set([
              ...currentState.layoutedLevels,
              'system',
              'domain',
              'module',
              'symbol'
            ]),
            projectSymbols: result,
            symbolsLoading: false,
            pendingModuleSelectionForSymbols: null,
            pendingSymbolIdsToSelect: symbolIdsToSelect
          })
        } else {
          // Complete analysis failed, but we still have symbols
          console.warn('[GraphStore] Failed to complete semantic analysis:', completeResult.error)
          set({
            projectSymbols: result,
            symbolsLoading: false,
            nodesByLevel: { ...currentState.nodesByLevel, symbol: layoutedSymbolNodes },
            edgesByLevel: { ...currentState.edgesByLevel, symbol: symbolEdgesList },
            layoutedLevels: new Set([...currentState.layoutedLevels, 'symbol']),
            pendingModuleSelectionForSymbols: null,
            pendingSymbolIdsToSelect: symbolIdsToSelect
          })
        }
      } catch (completeError) {
        console.error('[GraphStore] Error completing semantic analysis:', completeError)
        // Still set the symbols even if completion failed
        set({
          projectSymbols: result,
          symbolsLoading: false,
          nodesByLevel: { ...currentState.nodesByLevel, symbol: layoutedSymbolNodes },
          edgesByLevel: { ...currentState.edgesByLevel, symbol: symbolEdgesList },
          layoutedLevels: new Set([...currentState.layoutedLevels, 'symbol']),
          pendingModuleSelectionForSymbols: null,
          pendingSymbolIdsToSelect: symbolIdsToSelect
        })
      }
    } catch (error) {
      set({
        symbolsLoading: false,
        symbolsError: error instanceof Error ? error.message : String(error),
        pendingModuleSelectionForSymbols: null // Clear on error too
      })
    }
  },

  layoutCurrentLevel: async () => {
    const { zoomLevel, nodesByLevel, edgesByLevel, layoutedLevels } = get()
    if (layoutedLevels.has(zoomLevel)) return

    try {
      const { nodes: layoutedNodes } = await getLayoutedElements(
        nodesByLevel[zoomLevel],
        edgesByLevel[zoomLevel],
        LAYOUT_OPTIONS[zoomLevel]
      )
      set({
        nodesByLevel: { ...nodesByLevel, [zoomLevel]: layoutedNodes },
        layoutedLevels: new Set([...layoutedLevels, zoomLevel])
      })
    } catch (error) {
      console.error('Failed to layout nodes:', error)
    }
  },

  onNodesChange: (changes) => {
    const { zoomLevel, nodesByLevel } = get()
    set({
      nodesByLevel: {
        ...nodesByLevel,
        [zoomLevel]: applyNodeChanges(changes, nodesByLevel[zoomLevel])
      }
    })
  },

  onEdgesChange: (changes) => {
    const { zoomLevel, edgesByLevel } = get()
    set({
      edgesByLevel: {
        ...edgesByLevel,
        [zoomLevel]: applyEdgeChanges(changes, edgesByLevel[zoomLevel])
      }
    })
  },

  onConnect: (connection) => {
    const { zoomLevel, edgesByLevel } = get()
    set({
      edgesByLevel: {
        ...edgesByLevel,
        [zoomLevel]: addEdge(
          { ...connection, style: { stroke: '#475569', strokeWidth: 1 } },
          edgesByLevel[zoomLevel]
        )
      }
    })
  },

  resetSymbols: () => {
    const { layoutedLevels } = get()
    set({
      projectSymbols: null,
      symbolsLoading: false,
      symbolsError: null,
      nodesByLevel: { system: [], domain: [], module: [], symbol: [] },
      edgesByLevel: { system: [], domain: [], module: [], symbol: [] },
      layoutedLevels: new Set([...layoutedLevels].filter((l) => l !== 'symbol'))
    })
  },

  openModuleSymbolView: async (moduleId: string) => {
    const { projectSymbols, semanticAnalysis, colorMap } = get()

    set({
      activeModuleId: moduleId,
      zoomLevel: 'symbol',
      symbolsLoading: true,
      symbolsError: null
    })

    try {
      // Load symbols if not already loaded
      let symbols = projectSymbols
      if (!symbols) {
        const projectPath = await window.api.getProjectPath()
        if (!projectPath) {
          set({ symbolsLoading: false, symbolsError: 'No project path set.' })
          return
        }
        symbols = await window.api.scanProject()
      }

      const modules = semanticAnalysis?.modules
      if (!modules) {
        set({ symbolsLoading: false, symbolsError: 'No semantic analysis available.' })
        return
      }

      // Import the helper function
      const { buildModuleSymbolView } = await import('./symbolHelpers')

      // Build the module-specific symbol view
      const { nodes, edges } = buildModuleSymbolView(
        moduleId,
        symbols,
        modules,
        colorMap,
        get().nodesByLevel.module
      )

      // Layout the nodes
      let layoutedNodes = nodes
      if (nodes.length > 0) {
        try {
          const { nodes: laidOut } = await getLayoutedElements(nodes, edges, LAYOUT_OPTIONS.symbol)
          layoutedNodes = laidOut
        } catch (e) {
          console.error('[GraphStore] Symbol layout failed:', e)
        }
      }

      const currentState = get()
      set({
        projectSymbols: symbols,
        symbolsLoading: false,
        nodesByLevel: { ...currentState.nodesByLevel, symbol: layoutedNodes },
        edgesByLevel: { ...currentState.edgesByLevel, symbol: edges },
        layoutedLevels: new Set([...currentState.layoutedLevels, 'symbol'])
      })
    } catch (error) {
      console.error('[GraphStore] Failed to open module symbol view:', error)
      set({
        symbolsLoading: false,
        symbolsError: error instanceof Error ? error.message : String(error),
        activeModuleId: null,
        zoomLevel: 'module'
      })
    }
  },

  closeSymbolView: () => {
    set({
      activeModuleId: null,
      zoomLevel: 'module',
      selectedNodeIds: new Set()
    })
  }
}))

// =============================================================================
// SELECTORS
// =============================================================================

export const useCurrentNodes = (): Node[] => {
  return useGraphStore((state) => state.nodesByLevel[state.zoomLevel])
}

export const useCurrentEdges = (): Edge[] => {
  return useGraphStore((state) => state.edgesByLevel[state.zoomLevel])
}

export const useSelectedNodeIds = (): Set<string> => {
  return useGraphStore((state) => state.selectedNodeIds)
}
