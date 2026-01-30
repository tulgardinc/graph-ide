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
import { getLayoutedElements, type ElkLayoutOptions } from '../lib/elkLayout'
import type {
  ProjectSymbols,
  ExtractedSymbol,
  SymbolKind,
  CallEdge
} from '../../../preload/index.d'

// =============================================================================
// TYPES
// =============================================================================

export type ZoomLevel = 'system' | 'layer' | 'construct' | 'symbol'

export const ZOOM_LEVELS: ZoomLevel[] = ['system', 'layer', 'construct', 'symbol']

export const ZOOM_LEVEL_LABELS: Record<ZoomLevel, string> = {
  system: 'System',
  layer: 'Layer',
  construct: 'Construct',
  symbol: 'Symbol'
}

// Layout options per zoom level
const LAYOUT_OPTIONS: Record<ZoomLevel, ElkLayoutOptions> = {
  system: { direction: 'RIGHT', nodeSpacing: 80, layerSpacing: 120 },
  layer: { direction: 'DOWN', nodeSpacing: 40, layerSpacing: 80 },
  construct: { direction: 'DOWN', nodeSpacing: 50, layerSpacing: 100 },
  symbol: { direction: 'DOWN', nodeSpacing: 20, layerSpacing: 40 }
}

// =============================================================================
// SYMBOL TO NODE CONVERSION
// =============================================================================

/**
 * Get visual styling for a symbol based on its kind
 */
function getSymbolStyle(kind: SymbolKind, exported: boolean): React.CSSProperties {
  const baseStyle: React.CSSProperties = {
    borderRadius: '6px',
    padding: '8px 12px',
    fontFamily: 'monospace',
    fontSize: '12px'
  }

  const kindStyles: Record<SymbolKind, React.CSSProperties> = {
    function: {
      background: '#0f172a',
      color: '#5eead4',
      border: exported ? '2px solid #14b8a6' : '1px solid #14b8a6'
    },
    class: {
      background: '#1e1b4b',
      color: '#a5b4fc',
      border: exported ? '2px solid #8b5cf6' : '1px solid #8b5cf6'
    },
    interface: {
      background: '#172554',
      color: '#93c5fd',
      border: exported ? '2px dashed #3b82f6' : '1px dashed #3b82f6'
    },
    type: {
      background: '#1e1b4b',
      color: '#c4b5fd',
      border: exported ? '2px dashed #8b5cf6' : '1px dashed #8b5cf6'
    },
    enum: {
      background: '#422006',
      color: '#fbbf24',
      border: exported ? '2px solid #d97706' : '1px solid #d97706'
    },
    constant: {
      background: '#14532d',
      color: '#86efac',
      border: exported ? '2px solid #10b981' : '1px solid #10b981'
    },
    variable: {
      background: '#1c1917',
      color: '#a1a1aa',
      border: exported ? '2px solid #525252' : '1px solid #525252'
    },
    object: {
      background: '#1e293b',
      color: '#f1f5f9',
      border: exported ? '2px solid #475569' : '1px solid #475569'
    }
  }

  return { ...baseStyle, ...kindStyles[kind] }
}

/**
 * Get icon/prefix for a symbol kind
 */
function getSymbolPrefix(kind: SymbolKind): string {
  const prefixes: Record<SymbolKind, string> = {
    function: 'ƒ',
    class: '◆',
    interface: '◇',
    type: '⊤',
    enum: '⊞',
    constant: '●',
    variable: '○',
    object: '▣'
  }
  return prefixes[kind]
}

/**
 * Convert extracted symbols to React Flow nodes
 * Filters out types and interfaces (they're kept in the extractor but not rendered)
 */
function symbolsToNodes(symbols: ExtractedSymbol[]): Node[] {
  // Filter out types and interfaces - keep them in the data but don't render as nodes
  const renderableSymbols = symbols.filter(
    (symbol) => symbol.kind !== 'type' && symbol.kind !== 'interface'
  )

  return renderableSymbols.map((symbol) => ({
    id: symbol.id,
    type: 'default',
    position: { x: 0, y: 0 }, // Will be computed by ELK
    data: {
      label: `${getSymbolPrefix(symbol.kind)} ${symbol.name}`,
      symbol // Store the full symbol data for later use
    },
    style: {
      ...getSymbolStyle(symbol.kind, symbol.exported),
      width: Math.max(120, symbol.name.length * 8 + 40)
    }
  }))
}

/**
 * Convert dependency edges to React Flow edges with dependency graph styling
 * - Function calls: Cyan (#22d3ee)
 * - Component uses: Pink/Magenta (#f472b6)
 * - Global reads: Yellow/Gold (#fbbf24)
 * - Global writes: Orange (#f97316)
 * - Class instantiation: Purple (#a855f7)
 */
function dependencyEdgesToFlowEdges(dependencyEdges: CallEdge[]): Edge[] {
  return dependencyEdges.map((edge) => {
    // Different colors for different edge types
    let strokeColor: string
    let strokeWidth: number
    let strokeDasharray: string | undefined

    switch (edge.type) {
      case 'component-use':
        strokeColor = '#f472b6' // Pink
        strokeWidth = 2
        strokeDasharray = undefined
        break
      case 'global-read':
        strokeColor = '#fbbf24' // Yellow/Gold
        strokeWidth = 1.5
        strokeDasharray = '4,2' // Dashed line for reads
        break
      case 'global-write':
        strokeColor = '#f97316' // Orange
        strokeWidth = 2
        strokeDasharray = undefined
        break
      case 'class-instantiation':
        strokeColor = '#a855f7' // Purple
        strokeWidth = 2
        strokeDasharray = undefined
        break
      case 'enum-use':
        strokeColor = '#eab308' // Yellow (matches enum node color)
        strokeWidth = 1.5
        strokeDasharray = undefined
        break
      case 'call':
      default:
        strokeColor = '#22d3ee' // Cyan
        strokeWidth = 1.5
        strokeDasharray = undefined
        break
    }

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'default',
      animated: false,
      style: {
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray
      },
      markerEnd: {
        type: 'arrowclosed' as const,
        color: strokeColor,
        width: 12,
        height: 12
      },
      data: {
        location: edge.location,
        edgeType: edge.type
      }
    }
  })
}

// =============================================================================
// DEMO DATA - SYSTEM LEVEL (Web Frontend → Backend → Database)
// =============================================================================

const systemNodes: Node[] = [
  {
    id: 'frontend',
    type: 'default',
    position: { x: 0, y: 0 }, // Will be computed by ELK
    data: { label: '🌐 Frontend' },
    style: {
      background: '#1e293b',
      color: '#f1f5f9',
      border: '2px solid #3b82f6',
      borderRadius: '12px',
      padding: '16px',
      fontWeight: 600,
      width: 140
    }
  },
  {
    id: 'backend',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '⚙️ Backend' },
    style: {
      background: '#1e293b',
      color: '#f1f5f9',
      border: '2px solid #10b981',
      borderRadius: '12px',
      padding: '16px',
      fontWeight: 600,
      width: 140
    }
  },
  {
    id: 'database',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '🗄️ Database' },
    style: {
      background: '#1e1b4b',
      color: '#c4b5fd',
      border: '2px dashed #f59e0b',
      borderRadius: '12px',
      padding: '16px',
      fontWeight: 600,
      width: 140
    }
  }
]

const systemEdges: Edge[] = [
  {
    id: 'frontend-backend',
    source: 'frontend',
    target: 'backend',
    type: 'default',
    animated: true,
    style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '8,4' },
    markerEnd: { type: 'arrowclosed', color: '#3b82f6', width: 16, height: 16 },
    markerStart: { type: 'arrowclosed', color: '#3b82f6', width: 16, height: 16 },
    label: 'REST',
    labelStyle: { fill: '#94a3b8', fontSize: 11 },
    labelBgStyle: { fill: '#0f172a' }
  },
  {
    id: 'backend-database',
    source: 'backend',
    target: 'database',
    type: 'default',
    animated: true,
    style: { stroke: '#10b981', strokeWidth: 2, strokeDasharray: '8,4' },
    markerEnd: { type: 'arrowclosed', color: '#10b981', width: 16, height: 16 },
    label: 'SQL',
    labelStyle: { fill: '#94a3b8', fontSize: 11 },
    labelBgStyle: { fill: '#0f172a' }
  }
]

// =============================================================================
// DEMO DATA - LAYER LEVEL (Architectural layers across Frontend & Backend)
// =============================================================================

const layerNodes: Node[] = [
  // Frontend layers (blue)
  {
    id: 'components',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '🎨 Components' },
    style: {
      background: '#1e3a5f',
      color: '#93c5fd',
      border: '2px solid #3b82f6',
      borderRadius: '10px',
      padding: '14px',
      fontWeight: 500,
      width: 130
    }
  },
  {
    id: 'state',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '📦 State' },
    style: {
      background: '#1e3a5f',
      color: '#93c5fd',
      border: '2px solid #3b82f6',
      borderRadius: '10px',
      padding: '14px',
      fontWeight: 500,
      width: 130
    }
  },
  {
    id: 'api-client',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '🔌 API Client' },
    style: {
      background: '#1e3a5f',
      color: '#93c5fd',
      border: '2px solid #3b82f6',
      borderRadius: '10px',
      padding: '14px',
      fontWeight: 500,
      width: 130
    }
  },
  // Backend layers (green)
  {
    id: 'routes',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '🛣️ Routes' },
    style: {
      background: '#14532d',
      color: '#86efac',
      border: '2px solid #10b981',
      borderRadius: '10px',
      padding: '14px',
      fontWeight: 500,
      width: 130
    }
  },
  {
    id: 'services',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '🧠 Services' },
    style: {
      background: '#14532d',
      color: '#86efac',
      border: '2px solid #10b981',
      borderRadius: '10px',
      padding: '14px',
      fontWeight: 500,
      width: 130
    }
  },
  {
    id: 'repositories',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '💾 Repositories' },
    style: {
      background: '#14532d',
      color: '#86efac',
      border: '2px solid #10b981',
      borderRadius: '10px',
      padding: '14px',
      fontWeight: 500,
      width: 140
    }
  }
]

const layerEdges: Edge[] = [
  // Frontend flow: Components → State → API Client
  {
    id: 'components-state',
    source: 'components',
    target: 'state',
    style: { stroke: '#3b82f6', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed', color: '#3b82f6', width: 12, height: 12 }
  },
  {
    id: 'state-api',
    source: 'state',
    target: 'api-client',
    style: { stroke: '#3b82f6', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed', color: '#3b82f6', width: 12, height: 12 }
  },
  // Frontend → Backend communication
  {
    id: 'api-routes',
    source: 'api-client',
    target: 'routes',
    animated: true,
    style: { stroke: '#8b5cf6', strokeWidth: 2, strokeDasharray: '8,4' },
    markerEnd: { type: 'arrowclosed', color: '#8b5cf6', width: 14, height: 14 },
    markerStart: { type: 'arrowclosed', color: '#8b5cf6', width: 14, height: 14 },
    label: 'HTTP',
    labelStyle: { fill: '#94a3b8', fontSize: 10 },
    labelBgStyle: { fill: '#0f172a' }
  },
  // Backend flow: Routes → Services → Repositories
  {
    id: 'routes-services',
    source: 'routes',
    target: 'services',
    style: { stroke: '#10b981', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed', color: '#10b981', width: 12, height: 12 }
  },
  {
    id: 'services-repos',
    source: 'services',
    target: 'repositories',
    style: { stroke: '#10b981', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed', color: '#10b981', width: 12, height: 12 }
  }
]

// =============================================================================
// DEMO DATA - CONSTRUCT LEVEL (Specific modules/classes/files)
// =============================================================================

const constructNodes: Node[] = [
  // Frontend constructs (blue)
  {
    id: 'user-list',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '🎨 User List' },
    style: {
      background: '#1e3a5f',
      color: '#93c5fd',
      border: '2px solid #3b82f6',
      borderRadius: '8px',
      padding: '12px',
      fontWeight: 500,
      width: 130
    }
  },
  {
    id: 'user-store',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '📦 User Store' },
    style: {
      background: '#1e3a5f',
      color: '#93c5fd',
      border: '2px solid #3b82f6',
      borderRadius: '8px',
      padding: '12px',
      fontWeight: 500,
      width: 130
    }
  },
  {
    id: 'api-client-construct',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '🔌 API Client' },
    style: {
      background: '#1e3a5f',
      color: '#93c5fd',
      border: '2px solid #3b82f6',
      borderRadius: '8px',
      padding: '12px',
      fontWeight: 500,
      width: 130
    }
  },
  // Backend constructs (green)
  {
    id: 'user-routes',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '🛣️ User Routes' },
    style: {
      background: '#14532d',
      color: '#86efac',
      border: '2px solid #10b981',
      borderRadius: '8px',
      padding: '12px',
      fontWeight: 500,
      width: 130
    }
  },
  {
    id: 'user-service',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '🧠 User Service' },
    style: {
      background: '#14532d',
      color: '#86efac',
      border: '2px solid #10b981',
      borderRadius: '8px',
      padding: '12px',
      fontWeight: 500,
      width: 135
    }
  },
  {
    id: 'user-repository',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '💾 User Repository' },
    style: {
      background: '#14532d',
      color: '#86efac',
      border: '2px solid #10b981',
      borderRadius: '8px',
      padding: '12px',
      fontWeight: 500,
      width: 160
    }
  },
  // Shared type (purple)
  {
    id: 'user-type',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: '📝 User' },
    style: {
      background: '#1e1b4b',
      color: '#a5b4fc',
      border: '2px solid #8b5cf6',
      borderRadius: '8px',
      padding: '12px',
      fontWeight: 500,
      width: 100
    }
  }
]

const constructEdges: Edge[] = [
  // Frontend flow
  {
    id: 'userlist-store',
    source: 'user-list',
    target: 'user-store',
    style: { stroke: '#3b82f6', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed', color: '#3b82f6', width: 12, height: 12 }
  },
  {
    id: 'store-apiclient',
    source: 'user-store',
    target: 'api-client-construct',
    style: { stroke: '#3b82f6', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed', color: '#3b82f6', width: 12, height: 12 }
  },
  // Frontend → Backend
  {
    id: 'apiclient-routes',
    source: 'api-client-construct',
    target: 'user-routes',
    animated: true,
    style: { stroke: '#8b5cf6', strokeWidth: 2, strokeDasharray: '6,3' },
    markerEnd: { type: 'arrowclosed', color: '#8b5cf6', width: 12, height: 12 },
    markerStart: { type: 'arrowclosed', color: '#8b5cf6', width: 12, height: 12 }
  },
  // Backend flow
  {
    id: 'routes-service',
    source: 'user-routes',
    target: 'user-service',
    style: { stroke: '#10b981', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed', color: '#10b981', width: 12, height: 12 }
  },
  {
    id: 'service-repo',
    source: 'user-service',
    target: 'user-repository',
    style: { stroke: '#10b981', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed', color: '#10b981', width: 12, height: 12 }
  },
  // Type dependencies (dashed)
  {
    id: 'store-type',
    source: 'user-store',
    target: 'user-type',
    style: { stroke: '#8b5cf6', strokeWidth: 1, strokeDasharray: '4,2' },
    markerEnd: { type: 'arrowclosed', color: '#8b5cf6', width: 10, height: 10 }
  },
  {
    id: 'service-type',
    source: 'user-service',
    target: 'user-type',
    style: { stroke: '#8b5cf6', strokeWidth: 1, strokeDasharray: '4,2' },
    markerEnd: { type: 'arrowclosed', color: '#8b5cf6', width: 10, height: 10 }
  }
]

// Symbol level data is now loaded dynamically from tree-sitter via loadSymbols()

// =============================================================================
// STORE
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
}

export const useGraphStore = create<GraphState>((set, get) => ({
  zoomLevel: 'system',

  nodesByLevel: {
    system: systemNodes,
    layer: layerNodes,
    construct: constructNodes,
    symbol: [] // Start empty, will be populated from tree-sitter
  },

  edgesByLevel: {
    system: systemEdges,
    layer: layerEdges,
    construct: constructEdges,
    symbol: [] // No edges for symbols initially
  },

  layoutedLevels: new Set<ZoomLevel>(),

  selectedNodeIds: new Set<string>(),

  projectSymbols: null,
  symbolsLoading: false,
  symbolsError: null,

  setSelectedNodeIds: (ids: string[]) => {
    set({ selectedNodeIds: new Set(ids) })
  },

  setZoomLevel: (level) => {
    set({ zoomLevel: level })

    // Trigger symbol loading when switching to symbol level
    if (level === 'symbol') {
      get().loadSymbols()
    }
  },

  loadSymbols: async () => {
    const { projectSymbols, symbolsLoading, nodesByLevel, edgesByLevel, layoutedLevels } = get()

    console.log('[GraphStore] loadSymbols called', {
      symbolsLoading,
      hasProjectSymbols: projectSymbols !== null
    })

    // Skip if already loading or already have symbols
    if (symbolsLoading || projectSymbols !== null) {
      console.log('[GraphStore] Skipping - already loading or have symbols')
      return
    }

    set({ symbolsLoading: true, symbolsError: null })

    try {
      // Get project path from main process
      console.log('[GraphStore] Getting project path...')
      const projectPath = await window.api.getProjectPath()
      console.log('[GraphStore] Project path:', projectPath)

      if (!projectPath) {
        console.log('[GraphStore] No project path set!')
        set({
          symbolsLoading: false,
          symbolsError: 'No project path set. Start the app with a project path.'
        })
        return
      }

      console.log('[GraphStore] Loading symbols from:', projectPath)
      const result = await window.api.scanProject()
      console.log('[GraphStore] Scan result:', result)

      // Convert all symbols to nodes
      const allSymbols: ExtractedSymbol[] = result.files.flatMap((file) => file.symbols)
      console.log('[GraphStore] All symbols:', allSymbols)

      const symbolNodesList = symbolsToNodes(allSymbols)
      console.log('[GraphStore] Symbol nodes:', symbolNodesList.length)

      // Build a set of valid node IDs for edge validation
      const validNodeIds = new Set(symbolNodesList.map((node) => node.id))

      // Convert call edges to React Flow edges and filter out invalid edges
      // (edges that reference nodes that don't exist, like class methods)
      const callEdges = result.callEdges || []
      const validCallEdges = callEdges.filter((edge) => {
        const sourceExists = validNodeIds.has(edge.source)
        const targetExists = validNodeIds.has(edge.target)
        if (!sourceExists || !targetExists) {
          console.log('[GraphStore] Filtering out invalid edge:', edge.id, {
            source: edge.source,
            sourceExists,
            target: edge.target,
            targetExists
          })
        }
        return sourceExists && targetExists
      })
      console.log(
        `[GraphStore] Call edges: ${callEdges.length} total, ${validCallEdges.length} valid`
      )

      const symbolEdgesList = dependencyEdgesToFlowEdges(validCallEdges)
      console.log('[GraphStore] Symbol edges:', symbolEdgesList.length)

      console.log(
        `[GraphStore] Loaded ${allSymbols.length} symbols and ${callEdges.length} call edges from ${result.files.length} files`
      )

      // Run ELK layout on the symbol nodes BEFORE updating the store
      let layoutedSymbolNodes = symbolNodesList
      if (symbolNodesList.length > 0) {
        try {
          console.log('[GraphStore] Running ELK layout on', symbolNodesList.length, 'symbols...')
          const options = LAYOUT_OPTIONS['symbol']
          const layoutResult = await getLayoutedElements(symbolNodesList, symbolEdgesList, options)
          layoutedSymbolNodes = layoutResult.nodes
          console.log(
            '[GraphStore] ELK layout completed, layouted nodes:',
            layoutedSymbolNodes.length
          )
          console.log('[GraphStore] First node position:', layoutedSymbolNodes[0]?.position)
        } catch (layoutError) {
          console.error('[GraphStore] ELK layout failed, using unlayouted nodes:', layoutError)
          // Continue with unlayouted nodes
        }
      } else {
        console.log('[GraphStore] No symbols to layout')
      }

      // Get fresh state to avoid stale closure issues
      const currentState = get()

      // Update store with laid out nodes
      set({
        projectSymbols: result,
        symbolsLoading: false,
        nodesByLevel: {
          ...currentState.nodesByLevel,
          symbol: layoutedSymbolNodes
        },
        edgesByLevel: {
          ...currentState.edgesByLevel,
          symbol: symbolEdgesList
        },
        // Mark symbol level as laid out
        layoutedLevels: new Set([...currentState.layoutedLevels, 'symbol'])
      })

      console.log('[GraphStore] Store updated. Symbol nodes count:', layoutedSymbolNodes.length)
    } catch (error) {
      console.error('[GraphStore] Failed to load symbols:', error)
      set({
        symbolsLoading: false,
        symbolsError: error instanceof Error ? error.message : String(error)
      })
    }
  },

  layoutCurrentLevel: async () => {
    const { zoomLevel, nodesByLevel, edgesByLevel, layoutedLevels } = get()

    // Skip if already laid out
    if (layoutedLevels.has(zoomLevel)) {
      return
    }

    const nodes = nodesByLevel[zoomLevel]
    const edges = edgesByLevel[zoomLevel]
    const options = LAYOUT_OPTIONS[zoomLevel]

    try {
      const { nodes: layoutedNodes } = await getLayoutedElements(nodes, edges, options)

      set({
        nodesByLevel: {
          ...nodesByLevel,
          [zoomLevel]: layoutedNodes
        },
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
    console.log('[GraphStore] Resetting symbols...')
    const { layoutedLevels } = get()
    set({
      projectSymbols: null,
      symbolsLoading: false,
      symbolsError: null,
      nodesByLevel: {
        system: systemNodes,
        layer: layerNodes,
        construct: constructNodes,
        symbol: []
      },
      edgesByLevel: {
        system: systemEdges,
        layer: layerEdges,
        construct: constructEdges,
        symbol: []
      },
      layoutedLevels: new Set([...layoutedLevels].filter((l) => l !== 'symbol'))
    })
    console.log('[GraphStore] Symbols reset complete')
  }
}))

// =============================================================================
// SELECTION HIGHLIGHTING HELPERS (exported for use in components)
// =============================================================================

/**
 * Compute the set of connected node IDs (predecessors + successors) for the selected nodes.
 * - Predecessors: nodes whose edges point TO the selected nodes (source → selected)
 * - Successors: nodes that selected nodes point TO (selected → target)
 */
export function getConnectedNodeIds(selectedIds: Set<string>, edges: Edge[]): Set<string> {
  // Start with selected nodes themselves
  const connected = new Set(selectedIds)

  for (const edge of edges) {
    // Predecessors: if edge.target is selected, include edge.source
    if (selectedIds.has(edge.target)) {
      connected.add(edge.source)
    }
    // Successors: if edge.source is selected, include edge.target
    if (selectedIds.has(edge.source)) {
      connected.add(edge.target)
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

// =============================================================================
// SELECTORS (simple, no derived state to avoid infinite loops)
// =============================================================================

/**
 * Selector for current nodes (raw, without styling transformations)
 */
export const useCurrentNodes = (): Node[] => {
  return useGraphStore((state) => state.nodesByLevel[state.zoomLevel])
}

/**
 * Selector for current edges (raw, without styling transformations)
 */
export const useCurrentEdges = (): Edge[] => {
  return useGraphStore((state) => state.edgesByLevel[state.zoomLevel])
}

/**
 * Selector for selected node IDs
 */
export const useSelectedNodeIds = (): Set<string> => {
  return useGraphStore((state) => state.selectedNodeIds)
}
