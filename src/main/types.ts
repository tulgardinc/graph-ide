// =============================================================================
// SYMBOL EXTRACTION TYPES
// =============================================================================

/**
 * The kind of symbol extracted from TypeScript code
 */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'constant'
  | 'variable'
  | 'object'

/**
 * A function parameter with optional type reference
 */
export interface ParameterInfo {
  /** Parameter name */
  name: string
  /** Symbol ID of the parameter type (if it references a project symbol) */
  typeId?: string
  /** Raw type text (for display when typeId is not available) */
  typeText?: string
}

/**
 * A single symbol extracted from a TypeScript file
 */
export interface ExtractedSymbol {
  /** Unique ID: filePath:name */
  id: string
  /** Symbol name (e.g., "getUserById", "UserService") */
  name: string
  /** Type of symbol */
  kind: SymbolKind
  /** Relative path from project root */
  filePath: string
  /** Starting line number (1-indexed) */
  startLine: number
  /** Ending line number (1-indexed) */
  endLine: number
  /** Whether the symbol is exported */
  exported: boolean
  /** Start column (0-indexed) */
  startColumn: number
  /** End column (0-indexed) */
  endColumn: number
  /** JSDoc description (markdown) */
  description?: string
  /** Symbol ID of the return type - for functions only (if it references a project symbol) */
  returnTypeId?: string
  /** Raw return type text - for functions only (for display when returnTypeId is not available) */
  returnTypeText?: string
  /** Function parameters - for functions only */
  parameters?: ParameterInfo[]
}

/**
 * All symbols from a single file
 */
export interface FileSymbols {
  /** Relative path from project root */
  filePath: string
  /** List of symbols in this file */
  symbols: ExtractedSymbol[]
}

/**
 * Type of edge relationship
 */
export type EdgeType =
  | 'call'
  | 'component-use'
  | 'global-read'
  | 'global-write'
  | 'class-instantiation'
  | 'enum-use'

/**
 * A dependency relationship between two symbols
 */
export interface DependencyEdge {
  /** Unique edge ID: "source->target" */
  id: string
  /** Source symbol ID (filePath:name) - the symbol that depends */
  source: string
  /** Target symbol ID (filePath:name) - the symbol being depended on */
  target: string
  /** Type of relationship */
  type: EdgeType
  /** Where the dependency occurs */
  location: {
    file: string
    line: number
  }
}

/**
 * @deprecated Use DependencyEdge instead
 */
export type CallEdge = DependencyEdge

/**
 * Complete project symbol extraction result
 */
export interface ProjectSymbols {
  /** Absolute path to project root */
  projectRoot: string
  /** All files with their symbols */
  files: FileSymbols[]
  /** Call relationships between symbols */
  callEdges: CallEdge[]
  /** Total number of symbols across all files */
  totalSymbols: number
  /** Total number of files scanned */
  totalFiles: number
  /** Files that had parsing errors */
  errors: FileParseError[]
}

/**
 * Error encountered while parsing a file
 */
export interface FileParseError {
  filePath: string
  error: string
}

/**
 * Options for symbol extraction
 */
export interface ExtractorOptions {
  /** File extensions to include (default: ['.ts', '.tsx']) */
  extensions?: string[]
  /** Directories to exclude (default: ['node_modules', '.git', 'dist', 'out']) */
  excludeDirs?: string[]
  /** Maximum depth to recurse (default: Infinity) */
  maxDepth?: number
}

/**
 * Default extractor options
 */
export const DEFAULT_EXTRACTOR_OPTIONS: Required<ExtractorOptions> = {
  extensions: ['.ts', '.tsx'],
  excludeDirs: ['node_modules', '.git', 'dist', 'out', 'build', '.next', 'coverage'],
  maxDepth: Infinity
}
