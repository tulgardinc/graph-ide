/**
 * Read File Tool
 *
 * Reads file contents from the project.
 * Can read entire files or specific line ranges.
 */

import { readFileSync, statSync } from 'fs'
import { join, normalize, relative, isAbsolute } from 'path'
import type { ToolResult } from './index'

// =============================================================================
// TYPES
// =============================================================================

export interface ReadFileInput {
  file_path: string
  start_line?: number
  end_line?: number
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Maximum file size to read (1MB)
const MAX_FILE_SIZE = 1024 * 1024

// Maximum lines to return if no range specified
const MAX_LINES_FULL_FILE = 1000

// Binary file detection - check first N bytes for null characters
const BINARY_CHECK_BYTES = 8192

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Read a file from the project
 */
export async function readFile(input: ReadFileInput, projectPath: string): Promise<ToolResult> {
  const { file_path, start_line, end_line } = input

  if (!file_path || file_path.trim() === '') {
    return {
      success: false,
      error: 'File path cannot be empty'
    }
  }

  try {
    // Resolve the file path relative to project root
    const resolvedPath = resolveFilePath(file_path, projectPath)

    // Security check: ensure path is within project
    if (!isPathWithinProject(resolvedPath, projectPath)) {
      return {
        success: false,
        error: `Access denied: ${file_path} is outside the project directory`
      }
    }

    // Check if file exists and get stats
    let stats
    try {
      stats = statSync(resolvedPath)
    } catch {
      return {
        success: false,
        error: `File not found: ${file_path}`
      }
    }

    if (stats.isDirectory()) {
      return {
        success: false,
        error: `Path is a directory, not a file: ${file_path}`
      }
    }

    // Check file size
    if (stats.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File is too large (${formatFileSize(stats.size)}). Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`
      }
    }

    // Read the file
    const content = readFileSync(resolvedPath)

    // Check for binary content
    if (isBinaryContent(content)) {
      return {
        success: false,
        error: `Cannot read binary file: ${file_path}`
      }
    }

    const text = content.toString('utf-8')
    const lines = text.split('\n')

    // Handle line range if specified
    if (start_line !== undefined && end_line !== undefined) {
      return readLineRange(lines, start_line, end_line, file_path)
    }

    // Return full file (with line limit)
    return readFullFile(lines, file_path)
  } catch (error) {
    return {
      success: false,
      error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Resolve file path relative to project root
 */
function resolveFilePath(filePath: string, projectPath: string): string {
  // If already absolute, use it (will be validated later)
  if (isAbsolute(filePath)) {
    return normalize(filePath)
  }

  // Otherwise, join with project path
  return normalize(join(projectPath, filePath))
}

/**
 * Check if a path is within the project directory
 */
function isPathWithinProject(filePath: string, projectPath: string): boolean {
  const normalizedFilePath = normalize(filePath)
  const normalizedProjectPath = normalize(projectPath)

  // Get relative path and ensure it doesn't start with ..
  const relativePath = relative(normalizedProjectPath, normalizedFilePath)

  return !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

/**
 * Check if content appears to be binary
 */
function isBinaryContent(buffer: Buffer): boolean {
  // Check for null bytes in the first N bytes
  const bytesToCheck = Math.min(buffer.length, BINARY_CHECK_BYTES)

  for (let i = 0; i < bytesToCheck; i++) {
    if (buffer[i] === 0) {
      return true
    }
  }

  return false
}

/**
 * Read a specific line range from the file
 */
function readLineRange(
  lines: string[],
  startLine: number,
  endLine: number,
  filePath: string
): ToolResult {
  // Validate line numbers
  if (startLine < 1) {
    return {
      success: false,
      error: 'start_line must be at least 1'
    }
  }

  if (endLine < startLine) {
    return {
      success: false,
      error: 'end_line must be greater than or equal to start_line'
    }
  }

  const totalLines = lines.length

  if (startLine > totalLines) {
    return {
      success: false,
      error: `start_line (${startLine}) exceeds file length (${totalLines} lines)`
    }
  }

  // Clamp end_line to file length
  const effectiveEndLine = Math.min(endLine, totalLines)

  // Extract the range (convert to 0-indexed)
  const selectedLines = lines.slice(startLine - 1, effectiveEndLine)

  // Format with line numbers
  const formatted = formatWithLineNumbers(selectedLines, startLine)

  return {
    success: true,
    result: `📄 ${filePath} (lines ${startLine}-${effectiveEndLine} of ${totalLines}):\n\n${formatted}`
  }
}

/**
 * Read the full file (with line limit)
 */
function readFullFile(lines: string[], filePath: string): ToolResult {
  const totalLines = lines.length

  if (totalLines > MAX_LINES_FULL_FILE) {
    // Truncate and indicate there's more
    const truncatedLines = lines.slice(0, MAX_LINES_FULL_FILE)
    const formatted = formatWithLineNumbers(truncatedLines, 1)

    return {
      success: true,
      result: `📄 ${filePath} (${totalLines} lines total, showing first ${MAX_LINES_FULL_FILE}):\n\n${formatted}\n\n... (${totalLines - MAX_LINES_FULL_FILE} more lines)`
    }
  }

  const formatted = formatWithLineNumbers(lines, 1)

  return {
    success: true,
    result: `📄 ${filePath} (${totalLines} lines):\n\n${formatted}`
  }
}

/**
 * Format lines with line numbers
 */
function formatWithLineNumbers(lines: string[], startLineNum: number): string {
  const maxLineNumWidth = String(startLineNum + lines.length - 1).length

  return lines
    .map((line, index) => {
      const lineNum = String(startLineNum + index).padStart(maxLineNumWidth, ' ')
      return `${lineNum} | ${line}`
    })
    .join('\n')
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
