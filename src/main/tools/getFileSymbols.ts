/**
 * Get File Symbols Tool
 *
 * Extracts code symbols (functions, classes, types, etc.) from a specific file.
 * Useful for understanding what a file exports without reading the full source code.
 */

import * as path from 'path'
import * as fs from 'fs'
import { extractSymbolsFromFile } from '../symbolExtractor'
import type { ToolResult } from './index'

export interface GetFileSymbolsInput {
  /** Path to the file relative to the project root */
  file_path: string
}

/**
 * Compact symbol representation for LLM consumption
 */
interface SymbolSummary {
  name: string
  kind: string
  exported: boolean
  line: number
  description?: string
}

/**
 * Get symbols defined in a specific file
 * Returns a compact list of symbol names, kinds, and line numbers
 */
export async function getFileSymbols(
  input: GetFileSymbolsInput,
  projectPath: string
): Promise<ToolResult> {
  const { file_path } = input

  // Validate input
  if (!file_path || typeof file_path !== 'string') {
    return {
      success: false,
      error: 'file_path is required and must be a string'
    }
  }

  // Resolve both paths to absolute for proper comparison
  const resolvedProjectPath = path.resolve(projectPath)
  const fullPath = path.resolve(projectPath, file_path)

  // Security check: ensure path is within project
  if (!fullPath.startsWith(resolvedProjectPath)) {
    return {
      success: false,
      error: `Access denied: path is outside the project directory (${file_path})`
    }
  }

  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    return {
      success: false,
      error: `File not found: ${file_path}`
    }
  }

  // Check if it's a TypeScript/JavaScript file
  const ext = path.extname(fullPath).toLowerCase()
  const validExtensions = ['.ts', '.tsx', '.js', '.jsx']

  if (!validExtensions.includes(ext)) {
    return {
      success: false,
      error: `Unsupported file type: ${ext}. Supported: ${validExtensions.join(', ')}`
    }
  }

  try {
    // Extract symbols using the existing symbol extractor
    const fileSymbols = extractSymbolsFromFile(fullPath, projectPath)

    // Convert to compact format for LLM
    const symbols: SymbolSummary[] = fileSymbols.symbols.map((symbol) => {
      const summary: SymbolSummary = {
        name: symbol.name,
        kind: symbol.kind,
        exported: symbol.exported,
        line: symbol.startLine
      }

      // Include description if available (from JSDoc)
      if (symbol.description) {
        summary.description = symbol.description
      }

      return summary
    })

    // Format result
    const result = {
      file: file_path,
      symbolCount: symbols.length,
      symbols
    }

    return {
      success: true,
      result: JSON.stringify(result, null, 2)
    }
  } catch (error) {
    console.error('[getFileSymbols] Error extracting symbols:', error)
    return {
      success: false,
      error: `Failed to extract symbols: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
