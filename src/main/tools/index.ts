/**
 * Tool Calling Module for LLM
 *
 * Defines available tools and provides execution dispatch.
 * Tools enable Claude to interact with the codebase.
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages'
import { searchCodebase, type SearchCodebaseInput } from './searchCodebase'
import { readFile, type ReadFileInput } from './readFile'
import { listFiles, type ListFilesInput } from './listFiles'
import { getFileSymbols, type GetFileSymbolsInput } from './getFileSymbols'

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/**
 * Tool definitions in Anthropic's format
 * These schemas tell Claude what tools are available and how to use them
 */
export const tools: Tool[] = [
  {
    name: 'search_codebase',
    description:
      'Search for text patterns in the codebase using ripgrep. Use this to find function definitions, symbol usages, imports, or any text patterns. Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description:
            'Search pattern (regex supported). For literal strings, escape special regex characters.'
        },
        file_glob: {
          type: 'string',
          description:
            'File glob pattern to filter files (e.g., "*.ts", "*.tsx", "src/**/*.ts"). If not provided, searches all files.'
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (default 50, max 200)'
        }
      },
      required: ['pattern']
    }
  },
  {
    name: 'read_file',
    description:
      'Read the contents of a file from the project. Can read the entire file or a specific line range. Use this to examine code, understand implementations, or get context about specific files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file relative to the project root (e.g., "src/main/index.ts")'
        },
        start_line: {
          type: 'number',
          description:
            'Start line number (1-indexed, inclusive). If provided with end_line, reads only that range.'
        },
        end_line: {
          type: 'number',
          description:
            'End line number (1-indexed, inclusive). If provided with start_line, reads only that range.'
        }
      },
      required: ['file_path']
    }
  },
  {
    name: 'list_files',
    description:
      'Get the file tree structure of the project in JSON format. Returns directories, files, and line counts. Use this to understand the project structure, find files, or get an overview of the codebase.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description:
            'Relative path within the project to list (e.g., "src/main"). Defaults to project root if not provided.'
        },
        max_depth: {
          type: 'number',
          description:
            'Maximum depth to traverse (default 5, max 10). Use lower values for large projects.'
        },
        include_line_counts: {
          type: 'boolean',
          description:
            'Whether to include line counts for files (default true). Set to false for faster results.'
        }
      },
      required: []
    }
  },
  {
    name: 'get_file_symbols',
    description:
      'Get a list of code symbols (functions, classes, interfaces, types, constants, etc.) defined in a specific file. Returns symbol names, kinds, export status, and line numbers. Useful for understanding what a file contains without reading the full source code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description:
            'Path to the file relative to the project root (e.g., "src/auth/login.ts"). Must be a TypeScript or JavaScript file (.ts, .tsx, .js, .jsx).'
        }
      },
      required: ['file_path']
    }
  }
]

// =============================================================================
// TOOL RESULT TYPES
// =============================================================================

export interface ToolResult {
  success: boolean
  result?: string
  error?: string
}

// =============================================================================
// TOOL EXECUTOR
// =============================================================================

/**
 * Execute a tool call by name with the given input
 * Returns a structured result for sending back to Claude
 */
export async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  projectPath: string
): Promise<ToolResult> {
  console.log(`[Tools] Executing tool: ${name}`, input)

  let result: ToolResult

  try {
    switch (name) {
      case 'search_codebase':
        result = await searchCodebase(input as unknown as SearchCodebaseInput, projectPath)
        break

      case 'read_file':
        result = await readFile(input as unknown as ReadFileInput, projectPath)
        break

      case 'list_files':
        result = await listFiles(input as unknown as ListFilesInput, projectPath)
        break

      case 'get_file_symbols':
        result = await getFileSymbols(input as unknown as GetFileSymbolsInput, projectPath)
        break

      default:
        result = {
          success: false,
          error: `Unknown tool: ${name}`
        }
    }
  } catch (error) {
    console.error(`[Tools] Error executing ${name}:`, error)
    result = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }

  // Log the result for debugging
  if (result.success) {
    console.log(`[Tools] ${name} succeeded`)
  } else {
    console.log(`[Tools] ${name} failed:`, result.error)
  }

  return result
}

/**
 * Get a human-readable description of what a tool is doing
 * Used for UI feedback
 */
export function getToolDescription(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'search_codebase':
      return `Searching codebase for "${input.pattern}"${input.file_glob ? ` in ${input.file_glob}` : ''}`

    case 'read_file':
      if (input.start_line && input.end_line) {
        return `Reading ${input.file_path} (lines ${input.start_line}-${input.end_line})`
      }
      return `Reading ${input.file_path}`

    case 'list_files':
      return `Listing files${input.path ? ` in ${input.path}` : ''}`

    case 'get_file_symbols':
      return `Getting symbols from ${input.file_path}`

    default:
      return `Executing ${name}`
  }
}
