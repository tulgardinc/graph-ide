import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { extractProjectSymbols, formatProjectSymbols } from './symbolExtractor'
import type { ExtractorOptions } from './types'

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
