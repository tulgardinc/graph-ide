import type { Node, Edge } from '@xyflow/react'
import type { ExtractedSymbol, SymbolKind, CallEdge } from '../../../preload/index.d'

// =============================================================================
// SYMBOL STYLING
// =============================================================================

/**
 * Get visual styling for a symbol based on its kind
 */
export function getSymbolStyle(kind: SymbolKind, exported: boolean): React.CSSProperties {
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
export function getSymbolPrefix(kind: SymbolKind): string {
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

// =============================================================================
// SYMBOL TO NODE CONVERSION
// =============================================================================

/**
 * Convert extracted symbols to React Flow nodes
 * Filters out types and interfaces (they're kept in the extractor but not rendered)
 */
export function symbolsToNodes(symbols: ExtractedSymbol[]): Node[] {
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

// =============================================================================
// EDGE CONVERSION
// =============================================================================

/**
 * Convert dependency edges to React Flow edges with dependency graph styling
 * - Function calls: Cyan (#22d3ee)
 * - Component uses: Pink/Magenta (#f472b6)
 * - Global reads: Yellow/Gold (#fbbf24)
 * - Global writes: Orange (#f97316)
 * - Class instantiation: Purple (#a855f7)
 */
export function dependencyEdgesToFlowEdges(dependencyEdges: CallEdge[]): Edge[] {
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
