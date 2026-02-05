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
  },

  /**
   * Subscribe to tool start events
   * Called when Claude starts executing a tool
   */
  onToolStart: (
    callback: (data: { toolName: string; description: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { toolName: string; description: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on('chat:toolStart', handler)
    return () => ipcRenderer.removeListener('chat:toolStart', handler)
  },

  /**
   * Subscribe to tool end events
   * Called when a tool execution completes
   */
  onToolEnd: (callback: (data: { toolName: string; status: string }) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { toolName: string; status: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on('chat:toolEnd', handler)
    return () => ipcRenderer.removeListener('chat:toolEnd', handler)
  },

  // ==========================================================================
  // Semantic Analysis API
  // ==========================================================================

  /**
   * Run semantic analysis on the project
   * Uses LLM with tool calling to explore and categorize the codebase
   * Results are cached in .graph-ide/ directory
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  semanticAnalyze: (forceRefresh?: boolean): Promise<any> => {
    return ipcRenderer.invoke('semantic:analyze', forceRefresh)
  },

  /**
   * Get cached semantic analysis (fast, no LLM call)
   * Returns null if no valid cache exists
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  semanticGetCached: (): Promise<any> => {
    return ipcRenderer.invoke('semantic:getCached')
  },

  /**
   * Check if valid semantic analysis cache exists
   */
  semanticHasValid: (): Promise<boolean> => {
    return ipcRenderer.invoke('semantic:hasValid')
  },

  /**
   * Invalidate (delete) the semantic analysis cache
   */
  semanticInvalidate: (): Promise<boolean> => {
    return ipcRenderer.invoke('semantic:invalidate')
  },

  /**
   * Get cache info for debugging/UI
   */
  semanticCacheInfo: (): Promise<{
    exists: boolean
    valid: boolean
    lastUpdated: string | null
    fileCount: number
    completedSteps: number[]
  }> => {
    return ipcRenderer.invoke('semantic:cacheInfo')
  },

  /**
   * Complete semantic analysis with symbol data (steps 4-5)
   * Called after symbol extraction to compute dependencies
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  semanticCompleteWithSymbols: (symbolData: any): Promise<any> => {
    return ipcRenderer.invoke('semantic:completeWithSymbols', symbolData)
  },

  /**
   * Subscribe to semantic analysis progress events
   */
  onSemanticProgress: (callback: (status: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string): void => {
      callback(status)
    }
    ipcRenderer.on('semantic:progress', handler)
    return () => ipcRenderer.removeListener('semantic:progress', handler)
  },

  /**
   * Subscribe to semantic tool start events
   */
  onSemanticToolStart: (
    callback: (data: { toolName: string; description: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { toolName: string; description: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on('semantic:toolStart', handler)
    return () => ipcRenderer.removeListener('semantic:toolStart', handler)
  },

  /**
   * Subscribe to semantic tool end events
   */
  onSemanticToolEnd: (
    callback: (data: { toolName: string; result: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { toolName: string; result: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on('semantic:toolEnd', handler)
    return () => ipcRenderer.removeListener('semantic:toolEnd', handler)
  },

  // ==========================================================================
  // Description Generation API
  // ==========================================================================

  /**
   * Start eager description generation for systems and domains
   * Should be called after semantic analysis completes
   */
  descriptionStartEager: (): Promise<boolean> => {
    return ipcRenderer.invoke('description:startEager')
  },

  /**
   * Request a description for a specific node
   * Returns cached content immediately if available
   * Otherwise triggers background generation and returns { generating: true }
   */
  descriptionRequest: (
    nodeId: string
  ): Promise<{ cached: boolean; content: string | null; generating: boolean }> => {
    return ipcRenderer.invoke('description:request', nodeId)
  },

  /**
   * Get cached description without triggering generation
   */
  descriptionGetCached: (nodeId: string): Promise<string | null> => {
    return ipcRenderer.invoke('description:getCached', nodeId)
  },

  /**
   * Check if a node's description is being generated
   */
  descriptionIsGenerating: (nodeId: string): Promise<boolean> => {
    return ipcRenderer.invoke('description:isGenerating', nodeId)
  },

  /**
   * Get the current description generation queue status
   */
  descriptionQueueStatus: (): Promise<{
    isProcessing: boolean
    queueLength: number
    currentItem: string | null
  }> => {
    return ipcRenderer.invoke('description:queueStatus')
  },

  /**
   * Subscribe to description loading events (generation started)
   */
  onDescriptionLoading: (callback: (data: { nodeId: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { nodeId: string }): void => {
      callback(data)
    }
    ipcRenderer.on('description:loading', handler)
    return () => ipcRenderer.removeListener('description:loading', handler)
  },

  /**
   * Subscribe to description complete events
   */
  onDescriptionComplete: (
    callback: (data: { nodeId: string; content: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { nodeId: string; content: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on('description:complete', handler)
    return () => ipcRenderer.removeListener('description:complete', handler)
  },

  /**
   * Subscribe to description error events
   */
  onDescriptionError: (
    callback: (data: { nodeId: string; error: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { nodeId: string; error: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on('description:error', handler)
    return () => ipcRenderer.removeListener('description:error', handler)
  },

  /**
   * Subscribe to description progress events
   */
  onDescriptionProgress: (
    callback: (data: { nodeId: string; status: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { nodeId: string; status: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on('description:progress', handler)
    return () => ipcRenderer.removeListener('description:progress', handler)
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
