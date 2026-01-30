import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Note: Types are defined in index.d.ts, not imported from main to avoid bundling issues

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
