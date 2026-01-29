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
 * A call relationship between two symbols
 */
export interface CallEdge {
  /** Unique edge ID: "caller->callee" */
  id: string
  /** Caller symbol ID (filePath:name) */
  source: string
  /** Callee symbol ID (filePath:name) */
  target: string
  /** Where the call happens */
  callSite: {
    file: string
    line: number
  }
}

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
