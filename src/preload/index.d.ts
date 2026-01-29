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
  CallEdge
} from '../main/types'
