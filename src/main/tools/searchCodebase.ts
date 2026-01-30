/**
 * Search Codebase Tool
 *
 * Uses ripgrep to search for text patterns in the project.
 * Returns matches with file paths, line numbers, and content.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ToolResult } from './index'

const execFileAsync = promisify(execFile)

// =============================================================================
// TYPES
// =============================================================================

export interface SearchCodebaseInput {
  pattern: string
  file_glob?: string
  max_results?: number
}

interface RipgrepMatch {
  file: string
  line: number
  content: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_MAX_RESULTS = 50
const MAX_RESULTS_LIMIT = 200

// Directories and patterns to exclude from search
const EXCLUDED_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  'coverage',
  '*.lock',
  'package-lock.json',
  '*.min.js',
  '*.map'
]

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Search the codebase using ripgrep
 */
export async function searchCodebase(
  input: SearchCodebaseInput,
  projectPath: string
): Promise<ToolResult> {
  const { pattern, file_glob, max_results = DEFAULT_MAX_RESULTS } = input

  if (!pattern || pattern.trim() === '') {
    return {
      success: false,
      error: 'Search pattern cannot be empty'
    }
  }

  // Security: validate file_glob doesn't contain path traversal
  if (file_glob) {
    // Block patterns that could escape the project directory
    if (
      file_glob.includes('..') ||
      file_glob.startsWith('/') ||
      file_glob.startsWith('\\') ||
      /^[a-zA-Z]:/.test(file_glob) // Windows absolute path
    ) {
      return {
        success: false,
        error: 'Invalid file glob pattern: path traversal not allowed'
      }
    }
  }

  // Clamp max results
  const limit = Math.min(Math.max(1, max_results), MAX_RESULTS_LIMIT)

  try {
    const matches = await runRipgrep(pattern, projectPath, file_glob, limit)

    if (matches.length === 0) {
      return {
        success: true,
        result: `No matches found for pattern: ${pattern}`
      }
    }

    // Format results for Claude
    const formattedResults = formatMatches(matches, limit)

    return {
      success: true,
      result: formattedResults
    }
  } catch (error) {
    // ripgrep returns exit code 1 when no matches found, which is not an error
    if (error instanceof Error && error.message.includes('exit code 1')) {
      return {
        success: true,
        result: `No matches found for pattern: ${pattern}`
      }
    }

    return {
      success: false,
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * Execute ripgrep with the given parameters
 */
async function runRipgrep(
  pattern: string,
  projectPath: string,
  fileGlob?: string,
  maxResults: number = DEFAULT_MAX_RESULTS
): Promise<RipgrepMatch[]> {
  const args: string[] = [
    '--line-number', // Include line numbers
    '--no-heading', // Don't group by file
    '--color=never', // No ANSI colors
    '--max-count', // Limit matches per file
    String(Math.ceil(maxResults / 2)), // Spread limit across files
    '--max-filesize', // Skip very large files
    '1M'
  ]

  // Add exclusions
  for (const excluded of EXCLUDED_PATTERNS) {
    args.push('--glob', `!${excluded}`)
  }

  // Add file glob filter if provided
  if (fileGlob) {
    args.push('--glob', fileGlob)
  }

  // Add the pattern
  args.push(pattern)

  // Add the search path
  args.push(projectPath)

  console.log('[Tools:search] Running ripgrep:', 'rg', args.join(' '))

  try {
    const { stdout } = await execFileAsync('rg', args, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 30000 // 30 second timeout
    })

    return parseRipgrepOutput(stdout, projectPath, maxResults)
  } catch (error: unknown) {
    // Check if it's an exec error with stdout (partial results)
    const execError = error as { code?: number; stdout?: string; stderr?: string }
    if (execError.code === 1 && !execError.stdout) {
      // No matches found - this is expected
      return []
    }
    if (execError.stdout) {
      // Got some results before error/timeout
      return parseRipgrepOutput(execError.stdout, projectPath, maxResults)
    }
    throw error
  }
}

/**
 * Parse ripgrep output into structured matches
 */
function parseRipgrepOutput(
  stdout: string,
  projectPath: string,
  maxResults: number
): RipgrepMatch[] {
  const matches: RipgrepMatch[] = []
  const lines = stdout.split('\n').filter((line) => line.trim())

  // Normalize projectPath for comparison
  const normalizedProjectPath = projectPath.replace(/\\/g, '/')

  for (const line of lines) {
    if (matches.length >= maxResults) break

    // ripgrep output format: file:line:content
    // Need to handle Windows paths (C:\path\file.ts:10:content)
    const match = line.match(/^(.+?):(\d+):(.*)$/)

    if (match) {
      let [, file, lineNum, content] = match

      // Make path relative to project
      file = file.replace(/\\/g, '/')
      if (file.startsWith(normalizedProjectPath)) {
        file = file.slice(normalizedProjectPath.length).replace(/^\//, '')
      }

      matches.push({
        file,
        line: parseInt(lineNum, 10),
        content: content.trim()
      })
    }
  }

  return matches
}

/**
 * Format matches into a readable string for Claude
 */
function formatMatches(matches: RipgrepMatch[], limit: number): string {
  const lines: string[] = []

  lines.push(`Found ${matches.length} matches${matches.length >= limit ? ' (limit reached)' : ''}:`)
  lines.push('')

  // Group by file for better readability
  const byFile = new Map<string, RipgrepMatch[]>()
  for (const match of matches) {
    const existing = byFile.get(match.file) || []
    existing.push(match)
    byFile.set(match.file, existing)
  }

  for (const [file, fileMatches] of byFile) {
    lines.push(`📄 ${file}`)
    for (const match of fileMatches) {
      // Truncate very long lines
      const content =
        match.content.length > 200 ? match.content.slice(0, 200) + '...' : match.content
      lines.push(`  L${match.line}: ${content}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
