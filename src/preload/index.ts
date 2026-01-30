import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Note: Types are defined in index.d.ts, not imported from main to avoid bundling issues

// Chat message type for the API
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Custom APIs for renderer
const api = {
  /**
   * Get the current project path (set via CLI or setProjectPath)
   */
  getProjectPath: (): Promise<string | null> => {
    return ipcRenderer.invoke('project:getPath')
  },

  /**
   * Set the project path for symbol extraction
   */
  setProjectPath: (projectPath: string): Promise<string> => {
    return ipcRenderer.invoke('project:setPath', projectPath)
  },

  /**
   * Scan the current project and extract all TypeScript symbols
   * Requires project path to be set first
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scanProject: (options?: any): Promise<any> => {
    return ipcRenderer.invoke('project:scan', options)
  },

  /**
   * Scan a specific directory for TypeScript symbols
   * Does not require project path to be set
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scanDirectory: (dirPath: string, options?: any): Promise<any> => {
    return ipcRenderer.invoke('project:scanDir', dirPath, options)
  },

  /**
   * Read specific lines from a file
   * Used to extract symbol source code for display in the detail panel
   */
  readFileLines: (filePath: string, startLine: number, endLine: number): Promise<string> => {
    return ipcRenderer.invoke('file:readLines', filePath, startLine, endLine)
  },

  // ==========================================================================
  // Chat / LLM API
  // ==========================================================================

  /**
   * Check if the LLM client is ready (API key configured)
   */
  chatStatus: (): Promise<{ ready: boolean; configured: boolean; source: string }> => {
    return ipcRenderer.invoke('chat:status')
  },

  /**
   * Set the API key at runtime
   */
  chatSetApiKey: (apiKey: string): Promise<boolean> => {
    return ipcRenderer.invoke('chat:setApiKey', apiKey)
  },

  /**
   * Send a chat message and get streaming response
   * Use onChatChunk, onChatError, onChatComplete to receive events
   */
  chatSend: (options: {
    messages: ChatMessage[]
    model?: string
    maxTokens?: number
    systemPrompt?: string
  }): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('chat:send', options)
  },

  /**
   * Cancel the current streaming response
   */
  chatCancel: (): Promise<boolean> => {
    return ipcRenderer.invoke('chat:cancel')
  },

  /**
   * Subscribe to chat chunk events (streaming text)
   */
  onChatChunk: (callback: (chunk: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string): void => {
      callback(chunk)
    }
    ipcRenderer.on('chat:chunk', handler)
    return () => ipcRenderer.removeListener('chat:chunk', handler)
  },

  /**
   * Subscribe to chat error events
   */
  onChatError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string): void => {
      callback(error)
    }
    ipcRenderer.on('chat:error', handler)
    return () => ipcRenderer.removeListener('chat:error', handler)
  },

  /**
   * Subscribe to chat complete events
   */
  onChatComplete: (callback: (fullResponse: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, fullResponse: string): void => {
      callback(fullResponse)
    }
    ipcRenderer.on('chat:complete', handler)
    return () => ipcRenderer.removeListener('chat:complete', handler)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
