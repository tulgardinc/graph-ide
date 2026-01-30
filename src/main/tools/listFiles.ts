/**
 * List Files Tool
 *
 * Returns the file tree structure of the project in JSON format.
 * Includes directories, files, and line counts for files.
 */

import { readdirSync, statSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import type { ToolResult } from './index'

// =============================================================================
// TYPES
// =============================================================================

export interface ListFilesInput {
  path?: string // Relative path within project, defaults to root
  max_depth?: number // Maximum depth to traverse, defaults to 5
  include_line_counts?: boolean // Whether to count lines, defaults to true
}

interface FileEntry {
  name: string
  type: 'file'
  path: string
  lines?: number
  size: number
}

interface DirectoryEntry {
  name: string
  type: 'directory'
  path: string
  children: (FileEntry | DirectoryEntry)[]
}

type TreeEntry = FileEntry | DirectoryEntry

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_MAX_DEPTH = 5
const MAX_DEPTH_LIMIT = 10

// Directories to always exclude
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  'coverage',
  '.cache',
  '__pycache__',
  '.vscode',
  '.idea'
])

// Files to exclude (by extension or name)
const EXCLUDED_FILES = new Set(['.DS_Store', 'Thumbs.db', '.gitignore', '.env', '.env.local'])

// Max file size to count lines (1MB)
const MAX_LINE_COUNT_SIZE = 1024 * 1024

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * List files in the project directory
 */
export async function listFiles(input: ListFilesInput, projectPath: string): Promise<ToolResult> {
  const {
    path: relativePath = '',
    max_depth = DEFAULT_MAX_DEPTH,
    include_line_counts = true
  } = input

  // Security: validate path doesn't contain traversal
  if (relativePath) {
    if (
      relativePath.includes('..') ||
      relativePath.startsWith('/') ||
      relativePath.startsWith('\\') ||
      /^[a-zA-Z]:/.test(relativePath)
    ) {
      return {
        success: false,
        error: 'Invalid path: path traversal not allowed'
      }
    }
  }

  // Clamp max depth
  const depth = Math.min(Math.max(1, max_depth), MAX_DEPTH_LIMIT)

  try {
    const targetPath = relativePath ? join(projectPath, relativePath) : projectPath

    // Verify the path exists and is a directory
    let stats
    try {
      stats = statSync(targetPath)
    } catch {
      return {
        success: false,
        error: `Path not found: ${relativePath || '.'}`
      }
    }

    if (!stats.isDirectory()) {
      return {
        success: false,
        error: `Path is not a directory: ${relativePath}`
      }
    }

    // Build the file tree
    const tree = buildFileTree(targetPath, projectPath, depth, include_line_counts)

    // Calculate summary statistics
    const stats_summary = calculateStats(tree)

    // Format result
    const result = {
      root: relativePath || '.',
      tree,
      summary: stats_summary
    }

    return {
      success: true,
      result: JSON.stringify(result, null, 2)
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to list files: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Recursively build the file tree
 */
function buildFileTree(
  dirPath: string,
  projectRoot: string,
  remainingDepth: number,
  includeLineCounts: boolean
): (FileEntry | DirectoryEntry)[] {
  if (remainingDepth <= 0) {
    return []
  }

  const entries: TreeEntry[] = []

  try {
    const items = readdirSync(dirPath)

    for (const item of items) {
      // Skip excluded items
      if (EXCLUDED_DIRS.has(item) || EXCLUDED_FILES.has(item)) {
        continue
      }

      const fullPath = join(dirPath, item)
      const relativePath = relative(projectRoot, fullPath).replace(/\\/g, '/')

      try {
        const stats = statSync(fullPath)

        if (stats.isDirectory()) {
          const children = buildFileTree(
            fullPath,
            projectRoot,
            remainingDepth - 1,
            includeLineCounts
          )

          entries.push({
            name: item,
            type: 'directory',
            path: relativePath,
            children
          })
        } else if (stats.isFile()) {
          const fileEntry: FileEntry = {
            name: item,
            type: 'file',
            path: relativePath,
            size: stats.size
          }

          // Count lines for text files under size limit
          if (includeLineCounts && stats.size <= MAX_LINE_COUNT_SIZE) {
            const lines = countFileLines(fullPath)
            if (lines !== null) {
              fileEntry.lines = lines
            }
          }

          entries.push(fileEntry)
        }
      } catch {
        // Skip files we can't access
        continue
      }
    }
  } catch {
    // Can't read directory
  }

  // Sort: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return entries
}

/**
 * Count lines in a file
 * Returns null if file appears to be binary
 */
function countFileLines(filePath: string): number | null {
  try {
    const content = readFileSync(filePath)

    // Check for binary content (null bytes in first 8KB)
    const checkLength = Math.min(content.length, 8192)
    for (let i = 0; i < checkLength; i++) {
      if (content[i] === 0) {
        return null // Binary file
      }
    }

    // Count newlines
    const text = content.toString('utf-8')
    const lines = text.split('\n').length

    return lines
  } catch {
    return null
  }
}

/**
 * Calculate summary statistics from the tree
 */
function calculateStats(tree: TreeEntry[]): {
  total_files: number
  total_directories: number
  total_lines: number
} {
  let files = 0
  let directories = 0
  let lines = 0

  function traverse(entries: TreeEntry[]): void {
    for (const entry of entries) {
      if (entry.type === 'file') {
        files++
        if (entry.lines !== undefined) {
          lines += entry.lines
        }
      } else {
        directories++
        traverse(entry.children)
      }
    }
  }

  traverse(tree)

  return {
    total_files: files,
    total_directories: directories,
    total_lines: lines
  }
}
