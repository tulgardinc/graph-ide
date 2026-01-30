import { ElectronAPI } from '@electron-toolkit/preload'
import type { ProjectSymbols, ExtractorOptions } from '../main/types'

/**
 * Chat message format for LLM API
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Chat status response
 */
export interface ChatStatus {
  ready: boolean
  configured: boolean
  source: string
}

/**
 * Options for sending a chat message
 */
export interface ChatSendOptions {
  messages: ChatMessage[]
  model?: string
  maxTokens?: number
  systemPrompt?: string
}

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

  // ==========================================================================
  // Chat / LLM API
  // ==========================================================================

  /**
   * Check if the LLM client is ready (API key configured)
   */
  chatStatus: () => Promise<ChatStatus>

  /**
   * Set the API key at runtime
   */
  chatSetApiKey: (apiKey: string) => Promise<boolean>

  /**
   * Send a chat message and get streaming response
   * Use onChatChunk, onChatError, onChatComplete to receive events
   */
  chatSend: (options: ChatSendOptions) => Promise<{ success: boolean; error?: string }>

  /**
   * Cancel the current streaming response
   */
  chatCancel: () => Promise<boolean>

  /**
   * Subscribe to chat chunk events (streaming text)
   * Returns an unsubscribe function
   */
  onChatChunk: (callback: (chunk: string) => void) => () => void

  /**
   * Subscribe to chat error events
   * Returns an unsubscribe function
   */
  onChatError: (callback: (error: string) => void) => () => void

  /**
   * Subscribe to chat complete events
   * Returns an unsubscribe function
   */
  onChatComplete: (callback: (fullResponse: string) => void) => () => void
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
