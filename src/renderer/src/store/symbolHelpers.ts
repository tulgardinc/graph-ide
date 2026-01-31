import type { Node, Edge } from '@xyflow/react'
import type { ExtractedSymbol, SymbolKind, CallEdge, ModuleNode } from '../../../preload/index.d'
import { getSymbolBorderColor, type ColorMap } from '../lib/colorUtils'

// =============================================================================
// SYMBOL-TO-CONSTRUCT RESOLUTION
// =============================================================================

import type { ProjectSymbols } from '../../../preload/index.d'

/**
 * Check if a file path matches a directory pattern
 *
 * @param filePath - The file path to check (e.g., "src/api/client.ts")
 * @param pattern - The directory pattern (e.g., "src/api/*" or "src/api/**")
 * @returns true if the file matches the pattern
 */
function matchesDirectoryPattern(filePath: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedPattern = pattern.replace(/\\/g, '/')

  // Handle ** (recursive) patterns
  if (normalizedPattern.endsWith('/**')) {
    const baseDir = normalizedPattern.slice(0, -3)
    return normalizedPath.startsWith(baseDir + '/')
  }

  // Handle * (direct children only) patterns
  if (normalizedPattern.endsWith('/*')) {
    const baseDir = normalizedPattern.slice(0, -2)
    // Must be in the base directory but NOT in a subdirectory
    if (!normalizedPath.startsWith(baseDir + '/')) return false
    const relativePath = normalizedPath.slice(baseDir.length + 1)
    // No more slashes means it's a direct child
    return !relativePath.includes('/')
  }

  // Exact directory match (rare but possible)
  return normalizedPath.startsWith(normalizedPattern + '/')
}

/**
 * Calculate the specificity of a directory pattern
 * More specific patterns should take precedence
 *
 * @param pattern - The directory pattern
 * @returns A specificity score (higher = more specific)
 */
function getPatternSpecificity(pattern: string): number {
  const normalizedPattern = pattern.replace(/\\/g, '/')
  // Count directory depth
  const depth = normalizedPattern.split('/').length
  // ** patterns are less specific than * patterns at the same depth
  const isRecursive = normalizedPattern.endsWith('/**')
  return depth * 10 + (isRecursive ? 0 : 5)
}

/**
 * Resolve which construct/module a symbol belongs to using the inheritance system:
 * 1. Symbol-level mapping (highest priority)
 * 2. File-level mapping
 * 3. Directory-level mapping (most specific directory wins)
 *
 * @param symbolId - The symbol ID (format: "filePath:symbolName")
 * @param modules - Array of module nodes with their mappings
 * @returns The module ID that this symbol belongs to, or undefined if unclassified
 */
export function resolveSymbolConstruct(
  symbolId: string,
  modules: ModuleNode[]
): string | undefined {
  // Parse symbolId to get file path
  const colonIndex = symbolId.lastIndexOf(':')
  if (colonIndex === -1) return undefined

  const filePath = symbolId.slice(0, colonIndex)

  // Priority 1: Check for exact symbol mapping
  for (const module of modules) {
    if (module.mappings?.symbols?.includes(symbolId)) {
      return module.id
    }
    // Also check legacy children array for backwards compatibility
    if (module.children?.includes(symbolId)) {
      return module.id
    }
  }

  // Priority 2: Check for file mapping
  for (const module of modules) {
    if (module.mappings?.files?.includes(filePath)) {
      return module.id
    }
  }

  // Priority 3: Check for directory mapping (most specific wins)
  let bestMatch: { moduleId: string; specificity: number } | null = null

  for (const module of modules) {
    const directories = module.mappings?.directories || []

    for (const dirPattern of directories) {
      if (matchesDirectoryPattern(filePath, dirPattern)) {
        const specificity = getPatternSpecificity(dirPattern)
        if (!bestMatch || specificity > bestMatch.specificity) {
          bestMatch = { moduleId: module.id, specificity }
        }
      }
    }

    // Also check legacy filePatterns in metadata
    const legacyPatterns = module.metadata?.filePatterns || []
    for (const pattern of legacyPatterns) {
      if (matchesDirectoryPattern(filePath, pattern)) {
        const specificity = getPatternSpecificity(pattern)
        if (!bestMatch || specificity > bestMatch.specificity) {
          bestMatch = { moduleId: module.id, specificity }
        }
      }
    }
  }

  return bestMatch?.moduleId
}

/**
 * Get all symbol IDs that belong to a specific module/construct
 * This is a reverse lookup of resolveSymbolConstruct()
 *
 * @param moduleId - The module ID to find symbols for (e.g., "module:auth")
 * @param modules - Array of module nodes with their mappings
 * @param projectSymbols - The loaded project symbols
 * @returns Array of symbol IDs that belong to this module
 */
export function getSymbolsForModule(
  moduleId: string,
  modules: ModuleNode[],
  projectSymbols: ProjectSymbols | null
): string[] {
  if (!projectSymbols) return []

  // Get all symbols from the project
  const allSymbols = projectSymbols.files.flatMap((file) => file.symbols)

  // Filter to symbols that resolve to this module
  // Note: We exclude types and interfaces since they're not rendered as nodes
  return allSymbols
    .filter((symbol) => symbol.kind !== 'type' && symbol.kind !== 'interface')
    .filter((symbol) => resolveSymbolConstruct(symbol.id, modules) === moduleId)
    .map((symbol) => symbol.id)
}

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
 * Get visual styling for a symbol with construct-based border color
 *
 * @param kind - Symbol kind (function, class, etc.)
 * @param exported - Whether the symbol is exported
 * @param constructBorderColor - Border color from parent construct (or unclassified color)
 */
export function getSymbolStyleWithConstructBorder(
  kind: SymbolKind,
  exported: boolean,
  constructBorderColor: string
): React.CSSProperties {
  const baseStyle: React.CSSProperties = {
    borderRadius: '6px',
    padding: '8px 12px',
    fontFamily: 'monospace',
    fontSize: '12px'
  }

  // Kind-based background and text colors (unchanged)
  const kindStyles: Record<SymbolKind, { background: string; color: string }> = {
    function: { background: '#0f172a', color: '#5eead4' },
    class: { background: '#1e1b4b', color: '#a5b4fc' },
    interface: { background: '#172554', color: '#93c5fd' },
    type: { background: '#1e1b4b', color: '#c4b5fd' },
    enum: { background: '#422006', color: '#fbbf24' },
    constant: { background: '#14532d', color: '#86efac' },
    variable: { background: '#1c1917', color: '#a1a1aa' },
    object: { background: '#1e293b', color: '#f1f5f9' }
  }

  const { background, color } = kindStyles[kind]
  // Exported symbols get thicker border
  const borderWidth = exported ? '2px' : '1px'
  // Interface and type get dashed border
  const borderStyle = kind === 'interface' || kind === 'type' ? 'dashed' : 'solid'

  return {
    ...baseStyle,
    background,
    color,
    border: `${borderWidth} ${borderStyle} ${constructBorderColor}`
  }
}

/**
 * Convert extracted symbols to React Flow nodes
 * Filters out types and interfaces (they're kept in the extractor but not rendered)
 *
 * @param symbols - Extracted symbols from the codebase
 * @param modules - Optional module nodes for construct resolution
 * @param colorMap - Optional color map for construct-based border colors
 */
export function symbolsToNodes(
  symbols: ExtractedSymbol[],
  modules?: ModuleNode[],
  colorMap?: ColorMap
): Node[] {
  // Filter out types and interfaces - keep them in the data but don't render as nodes
  const renderableSymbols = symbols.filter(
    (symbol) => symbol.kind !== 'type' && symbol.kind !== 'interface'
  )

  return renderableSymbols.map((symbol) => {
    // Resolve construct and get border color if modules/colorMap provided
    let borderColor: string | undefined
    let constructId: string | undefined

    if (modules && colorMap) {
      constructId = resolveSymbolConstruct(symbol.id, modules)
      borderColor = getSymbolBorderColor(constructId, colorMap)
    }

    // Use construct-based styling if available, otherwise use kind-based styling
    const style = borderColor
      ? {
          ...getSymbolStyleWithConstructBorder(symbol.kind, symbol.exported, borderColor),
          width: Math.max(120, symbol.name.length * 8 + 40)
        }
      : {
          ...getSymbolStyle(symbol.kind, symbol.exported),
          width: Math.max(120, symbol.name.length * 8 + 40)
        }

    return {
      id: symbol.id,
      type: 'default',
      position: { x: 0, y: 0 }, // Will be computed by ELK
      data: {
        label: `${getSymbolPrefix(symbol.kind)} ${symbol.name}`,
        symbol, // Store the full symbol data for later use
        constructId // Store which construct this symbol belongs to
      },
      style
    }
  })
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
