import * as fs from 'fs'
import * as path from 'path'
import { DEFAULT_EXTRACTOR_OPTIONS, type ExtractorOptions } from './types'

/**
 * Recursively walks a directory and returns all files matching the given extensions
 *
 * @param rootDir - Absolute path to the root directory
 * @param options - Options for file discovery
 * @returns Array of absolute file paths
 */
export function walkDirectory(rootDir: string, options: ExtractorOptions = {}): string[] {
  const opts = { ...DEFAULT_EXTRACTOR_OPTIONS, ...options }
  const files: string[] = []

  function walk(dir: string, depth: number): void {
    if (depth > opts.maxDepth) {
      return
    }

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      // Skip directories we can't read (permissions, etc.)
      console.warn(`Cannot read directory: ${dir}`, error)
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (opts.excludeDirs.includes(entry.name)) {
          continue
        }
        walk(fullPath, depth + 1)
      } else if (entry.isFile()) {
        // Check if file extension matches
        const ext = path.extname(entry.name)
        if (opts.extensions.includes(ext)) {
          files.push(fullPath)
        }
      }
    }
  }

  // Verify root directory exists
  if (!fs.existsSync(rootDir)) {
    throw new Error(`Directory does not exist: ${rootDir}`)
  }

  if (!fs.statSync(rootDir).isDirectory()) {
    throw new Error(`Path is not a directory: ${rootDir}`)
  }

  walk(rootDir, 0)
  return files
}

/**
 * Convert an absolute path to a relative path from the project root
 *
 * @param absolutePath - The absolute file path
 * @param rootDir - The project root directory
 * @returns Relative path using forward slashes
 */
export function toRelativePath(absolutePath: string, rootDir: string): string {
  const relativePath = path.relative(rootDir, absolutePath)
  // Normalize to forward slashes for consistency
  return relativePath.replace(/\\/g, '/')
}

/**
 * Check if a path should be excluded based on options
 *
 * @param filePath - Path to check
 * @param excludeDirs - List of directory names to exclude
 * @returns true if the path should be excluded
 */
export function shouldExclude(filePath: string, excludeDirs: string[]): boolean {
  const parts = filePath.split(/[/\\]/)
  return parts.some((part) => excludeDirs.includes(part))
}
