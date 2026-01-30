import { ElectronAPI } from '@electron-toolkit/preload'
import type { ProjectSymbols, ExtractorOptions } from '../main/types'

/**
 * API exposed to the renderer process via contextBridge
 */
interface MapIdeAPI {
  /**
   * Get the current project path (set via CLI or setProjectPath)
   */
  getProjectPath: () => Promise<string | null>

  /**
   * Set the project path for symbol extraction
   */
  setProjectPath: (projectPath: string) => Promise<string>

  /**
   * Scan the current project and extract all TypeScript symbols
   * Requires project path to be set first
   */
  scanProject: (options?: ExtractorOptions) => Promise<ProjectSymbols>

  /**
   * Scan a specific directory for TypeScript symbols
   * Does not require project path to be set
   */
  scanDirectory: (dirPath: string, options?: ExtractorOptions) => Promise<ProjectSymbols>

  /**
   * Read specific lines from a file
   * Used to extract symbol source code for display in the detail panel
   * @param filePath - Absolute path to the file
   * @param startLine - Start line number (1-indexed, inclusive)
   * @param endLine - End line number (1-indexed, inclusive)
   * @returns The lines of text from startLine to endLine
   */
  readFileLines: (filePath: string, startLine: number, endLine: number) => Promise<string>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: MapIdeAPI
  }
}

// Re-export types for convenience in renderer
export type { ProjectSymbols, ExtractorOptions, MapIdeAPI }
export type {
  ExtractedSymbol,
  FileSymbols,
  SymbolKind,
  FileParseError,
  CallEdge,
  EdgeType,
  ParameterInfo
} from '../main/types'
