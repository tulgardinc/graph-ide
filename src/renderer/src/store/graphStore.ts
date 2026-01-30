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
import type { ProjectSymbols, ExtractedSymbol, SemanticAnalysis } from '../../../preload/index.d'

// Import from split files
import { type ZoomLevel, LAYOUT_OPTIONS } from './types'
import { symbolsToNodes, dependencyEdgesToFlowEdges } from './symbolHelpers'

// Re-export types and helpers for consumers
export { type ZoomLevel, ZOOM_LEVELS, ZOOM_LEVEL_LABELS, LAYOUT_OPTIONS } from './types'
export { getConnectedNodeIds, isEdgeConnected } from './selectionHelpers'

// =============================================================================
// SEMANTIC NODE STYLING
// =============================================================================

function createSemanticNode(
  id: string,
  label: string,
  layer: 'system' | 'domain' | 'module',
  description?: string
): Node {
  const styles: Record<string, React.CSSProperties> = {
    system: {
      background: '#1e293b',
      color: '#f1f5f9',
      border: '2px solid #3b82f6',
      borderRadius: '12px',
      padding: '16px',
      fontWeight: 600,
      width: 160
    },
    domain: {
      background: '#14532d',
      color: '#86efac',
      border: '2px solid #10b981',
      borderRadius: '10px',
      padding: '14px',
      fontWeight: 500,
      width: 150
    },
    module: {
      background: '#1e1b4b',
      color: '#a5b4fc',
      border: '2px solid #8b5cf6',
      borderRadius: '8px',
      padding: '12px',
      fontWeight: 500,
      width: 140
    }
  }

  const icons: Record<string, string> = {
    system: '🏗️',
    domain: '📦',
    module: '🧩'
  }

  return {
    id,
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: `${icons[layer]} ${label}`, description },
    style: styles[layer]
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

  // React Flow handlers
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect

  // Actions
  setZoomLevel: (level: ZoomLevel) => void
  setSelectedNodeIds: (ids: string[]) => void
  layoutCurrentLevel: () => Promise<void>
  loadSymbols: () => Promise<void>
  resetSymbols: () => void
  loadSemanticAnalysis: (forceRefresh?: boolean) => Promise<void>
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useGraphStore = create<GraphState>((set, get) => ({
  zoomLevel: 'system',

  nodesByLevel: {
    system: [],
    layer: [],
    construct: [],
    symbol: []
  },

  edgesByLevel: {
    system: [],
    layer: [],
    construct: [],
    symbol: []
  },

  layoutedLevels: new Set<ZoomLevel>(),
  selectedNodeIds: new Set<string>(),

  projectSymbols: null,
  symbolsLoading: false,
  symbolsError: null,

  semanticAnalysis: null,
  semanticLoading: false,
  semanticError: null,
  semanticProgress: null,
  semanticCurrentTool: null,

  setSelectedNodeIds: (ids: string[]) => {
    set({ selectedNodeIds: new Set(ids) })
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

      // Convert semantic nodes to React Flow nodes
      const systemNodes = analysis.systems.map((s) =>
        createSemanticNode(s.id, s.name, 'system', s.description)
      )
      const domainNodes = analysis.domains.map((d) =>
        createSemanticNode(d.id, d.name, 'domain', d.description)
      )
      const moduleNodes = analysis.modules.map((m) =>
        createSemanticNode(m.id, m.name, 'module', m.description)
      )

      // Create edges from semantic edges
      const semanticEdges = (analysis.edges || []).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'default',
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
            LAYOUT_OPTIONS.layer
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
            LAYOUT_OPTIONS.construct
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
        nodesByLevel: {
          ...currentState.nodesByLevel,
          system: layoutedSystemNodes,
          layer: layoutedDomainNodes,
          construct: layoutedModuleNodes
        },
        edgesByLevel: {
          ...currentState.edgesByLevel,
          system: systemEdges,
          layer: domainEdges,
          construct: moduleEdges
        },
  

  loadSymbols: async () => {
    const { projectSymbols, symbolsLoading } = get()

    if (symbolsLoading || projectSymbols !== null) return

    set({ symbolsLoading: true, symbolsError: null })

    try {
      const projectPath = await window.api.getProjectPath()
      if (!projectPath) {
        set({ symbolsLoading: false, symbolsError: 'No project path set.' })
        return
      }

      const result = await window.api.scanProject()
      const allSymbols: ExtractedSymbol[] = result.files.flatMap((file) => file.symbols)
      const symbolNodesList = symbolsToNodes(allSymbols)

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
      set({
        projectSymbols: result,
        symbolsLoading: false,
        nodesByLevel: { ...currentState.nodesByLevel, symbol: layoutedSymbolNodes },
        edgesByLevel: { ...currentState.edgesByLevel, symbol: symbolEdgesList },
        layoutedLevels: new Set([...currentState.layoutedLevels, 'symbol'])
      })
    } catch (error) {
      set({
        symbolsLoading: false,
        symbolsError: error instanceof Error ? error.message : String(error)
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
      nodesByLevel: { system: [], layer: [], construct: [], symbol: [] },
      edgesByLevel: { system: [], layer: [], construct: [], symbol: [] },
      layoutedLevels: new Set([...layoutedLevels].filter((l) => l !== 'symbol'))
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
