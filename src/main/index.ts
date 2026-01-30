import { config } from 'dotenv'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'

// Load .env file from project root
// In dev: __dirname is out/main, so go up 2 levels to project root
// In prod: app.getAppPath() points to the app resources
const envPath = resolve(__dirname, '../../.env')
console.log('[Main] Loading .env from:', envPath)
const envResult = config({ path: envPath })
if (envResult.error) {
  console.warn('[Main] Failed to load .env:', envResult.error.message)
} else {
  console.log('[Main] .env loaded successfully')
}
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { extractProjectSymbols, formatProjectSymbols } from './symbolExtractor'
import type { ExtractorOptions } from './types'
import {
  sendMessageWithTools,
  cancelStream,
  initializeClient,
  isClientReady,
  getApiKeyStatus,
  type ChatMessage
} from './llmClient'
import { analyzeSemantics, getCachedAnalysis, hasValidAnalysis } from './semanticAnalyzer'
import { invalidateCache, getCacheInfo } from './cacheManager'

// =============================================================================
// PROJECT PATH FROM CLI ARGUMENTS
// =============================================================================

/**
 * Get project path from command line arguments
 * Usage: map-ide <project-path>
 */
function getProjectPathFromArgs(): string | null {
  // In development, args are: [electron, ., <project-path>]
  // In production, args are: [app-path, <project-path>]
  const args = process.argv

  // Skip electron/node executable and app path
  // Look for the first argument that looks like a path (not a flag)
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    // Skip flags and known electron/vite paths
    if (
      arg.startsWith('-') ||
      arg.startsWith('--') ||
      arg === '.' ||
      arg.includes('electron') ||
      arg.includes('node_modules')
    ) {
      continue
    }
    // This might be our project path
    return arg
  }

  return null
}

// Store the project path globally
let projectPath: string | null = getProjectPathFromArgs()

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // =============================================================================
  // IPC HANDLERS FOR SYMBOL EXTRACTION
  // =============================================================================

  /**
   * Get the current project path
   */
  ipcMain.handle('project:getPath', () => {
    return projectPath
  })

  /**
   * Set the project path (can be called from renderer)
   */
  ipcMain.handle('project:setPath', (_, newPath: string) => {
    projectPath = newPath
    console.log(`[Main] Project path set to: ${projectPath}`)
    return projectPath
  })

  /**
   * Scan project and extract all symbols
   */
  ipcMain.handle('project:scan', async (_, options?: ExtractorOptions) => {
    if (!projectPath) {
      throw new Error('No project path set. Use project:setPath first.')
    }

    console.log(`[Main] Scanning project: ${projectPath}`)
    const startTime = Date.now()

    try {
      const result = extractProjectSymbols(projectPath, options)
      const duration = Date.now() - startTime

      console.log(`[Main] Scan complete in ${duration}ms:`)
      console.log(`  - Files: ${result.totalFiles}`)
      console.log(`  - Symbols: ${result.totalSymbols}`)
      console.log(`  - Errors: ${result.errors.length}`)

      // Also log formatted output for debugging
      if (is.dev) {
        console.log('\n' + formatProjectSymbols(result))
      }

      return result
    } catch (error) {
      console.error('[Main] Scan failed:', error)
      throw error
    }
  })

  /**
   * Scan a specific directory (doesn't need projectPath set)
   */
  ipcMain.handle('project:scanDir', async (_, dirPath: string, options?: ExtractorOptions) => {
    console.log(`[Main] Scanning directory: ${dirPath}`)
    const startTime = Date.now()

    try {
      const result = extractProjectSymbols(dirPath, options)
      const duration = Date.now() - startTime

      console.log(`[Main] Scan complete in ${duration}ms:`)
      console.log(`  - Files: ${result.totalFiles}`)
      console.log(`  - Symbols: ${result.totalSymbols}`)

      return result
    } catch (error) {
      console.error('[Main] Scan failed:', error)
      throw error
    }
  })

  /**
   * Read specific lines from a file
   * Used to extract symbol source code for display
   * filePath is relative to the project root (stored in symbols by symbolExtractor)
   */
  ipcMain.handle(
    'file:readLines',
    async (_, filePath: string, startLine: number, endLine: number) => {
      try {
        // filePath is relative to project root, need to make it absolute
        if (!projectPath) {
          throw new Error('No project path set. Cannot read file.')
        }
        const absolutePath = join(projectPath, filePath)
        const content = readFileSync(absolutePath, 'utf-8')
        const lines = content.split('\n')
        // Lines are 1-indexed, array is 0-indexed
        return lines.slice(startLine - 1, endLine).join('\n')
      } catch (error) {
        console.error('[Main] Failed to read file lines:', error)
        throw error
      }
    }
  )

  // =============================================================================
  // IPC HANDLERS FOR CHAT / LLM
  // =============================================================================

  /**
   * Check if the LLM client is ready (API key configured)
   */
  ipcMain.handle('chat:status', () => {
    return {
      ready: isClientReady(),
      ...getApiKeyStatus()
    }
  })

  /**
   * Set the API key at runtime
   */
  ipcMain.handle('chat:setApiKey', (_, apiKey: string) => {
    initializeClient(apiKey)
    return isClientReady()
  })

  /**
   * Send a chat message and stream the response with tool support
   * Returns immediately, sends chunks via 'chat:chunk' events
   * Tool execution is notified via 'chat:toolStart' and 'chat:toolEnd' events
   */
  ipcMain.handle(
    'chat:send',
    async (
      event,
      options: {
        messages: ChatMessage[]
        model?: string
        maxTokens?: number
        systemPrompt?: string
      }
    ) => {
      const webContents = event.sender

      // Require project path for tool calling
      if (!projectPath) {
        webContents.send('chat:error', 'No project path set. Cannot use tools.')
        return { success: false, error: 'No project path set' }
      }

      const currentProjectPath = projectPath // Capture for closure

      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        sendMessageWithTools(
          {
            ...options,
            projectPath: currentProjectPath
          },
          // On chunk
          (chunk) => {
            webContents.send('chat:chunk', chunk)
          },
          // On error
          (error) => {
            webContents.send('chat:error', error.message)
            resolve({ success: false, error: error.message })
          },
          // On complete
          (fullResponse) => {
            webContents.send('chat:complete', fullResponse)
            resolve({ success: true })
          },
          // On tool start
          (toolName, description) => {
            webContents.send('chat:toolStart', { toolName, description })
          },
          // On tool end
          (toolName, status) => {
            webContents.send('chat:toolEnd', { toolName, status })
          }
        )
      })
    }
  )

  /**
   * Cancel the current streaming response
   */
  ipcMain.handle('chat:cancel', () => {
    return cancelStream()
  })

  // =============================================================================
  // IPC HANDLERS FOR SEMANTIC ANALYSIS
  // =============================================================================

  /**
   * Run semantic analysis on the project
   * Uses LLM with tool calling to explore and categorize the codebase
   * Caches results in .graph-ide/ directory
   */
  ipcMain.handle('semantic:analyze', async (event, forceRefresh?: boolean) => {
    const webContents = event.sender

    if (!projectPath) {
      return {
        success: false,
        error: 'No project path set. Cannot analyze.'
      }
    }

    const currentProjectPath = projectPath

    console.log('[Main] Starting semantic analysis for:', currentProjectPath)

    try {
      const result = await analyzeSemantics({
        projectPath: currentProjectPath,
        forceRefresh,
        onProgress: (status) => {
          webContents.send('semantic:progress', status)
        },
        onToolStart: (toolName, description) => {
          webContents.send('semantic:toolStart', { toolName, description })
        },
        onToolEnd: (toolName, result) => {
          webContents.send('semantic:toolEnd', { toolName, result })
        }
      })

      return result
    } catch (error) {
      console.error('[Main] Semantic analysis failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  /**
   * Get cached semantic analysis (fast, no LLM call)
   */
  ipcMain.handle('semantic:getCached', async () => {
    if (!projectPath) {
      return null
    }

    return await getCachedAnalysis(projectPath)
  })

  /**
   * Check if valid semantic analysis cache exists
   */
  ipcMain.handle('semantic:hasValid', async () => {
    if (!projectPath) {
      return false
    }

    return await hasValidAnalysis(projectPath)
  })

  /**
   * Invalidate (delete) the semantic analysis cache
   */
  ipcMain.handle('semantic:invalidate', async () => {
    if (!projectPath) {
      return false
    }

    await invalidateCache(projectPath)
    return true
  })

  /**
   * Get cache info for debugging/UI
   */
  ipcMain.handle('semantic:cacheInfo', async () => {
    if (!projectPath) {
      return {
        exists: false,
        valid: false,
        lastUpdated: null,
        fileCount: 0
      }
    }

    return await getCacheInfo(projectPath)
  })

  // Initialize LLM client with env var (dotenv has loaded by now)
  console.log('[Main] Initializing LLM client...')
  initializeClient()

  // Log project path on startup
  if (projectPath) {
    console.log(`[Main] Project path from CLI: ${projectPath}`)
  } else {
    console.log('[Main] No project path provided. Use --project <path> or set via IPC.')
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
