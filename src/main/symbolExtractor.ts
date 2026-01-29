import * as fs from 'fs'
import * as path from 'path'
import Parser from 'tree-sitter'
import TypeScript from 'tree-sitter-typescript'
import { walkDirectory, toRelativePath } from './fileWalker'
import type {
  ExtractedSymbol,
  ExtractorOptions,
  FileParseError,
  FileSymbols,
  ProjectSymbols,
  SymbolKind
} from './types'

// =============================================================================
// PARSER SETUP
// =============================================================================

// Create parsers for TypeScript and TSX
const tsParser = new Parser()
tsParser.setLanguage(TypeScript.typescript)

const tsxParser = new Parser()
tsxParser.setLanguage(TypeScript.tsx)

/**
 * Get the appropriate parser for a file based on its extension
 */
function getParser(filePath: string): Parser {
  const ext = path.extname(filePath)
  return ext === '.tsx' ? tsxParser : tsParser
}

// =============================================================================
// AST NODE TYPES TO EXTRACT
// =============================================================================

/**
 * Top-level node types we care about extracting
 */
const SYMBOL_NODE_TYPES = new Set([
  'function_declaration',
  'class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'lexical_declaration', // const, let
  'variable_declaration' // var
])

/**
 * Map tree-sitter node types to our SymbolKind
 */
function getSymbolKind(nodeType: string, isConst: boolean = false): SymbolKind {
  switch (nodeType) {
    case 'function_declaration':
      return 'function'
    case 'class_declaration':
      return 'class'
    case 'interface_declaration':
      return 'interface'
    case 'type_alias_declaration':
      return 'type'
    case 'enum_declaration':
      return 'enum'
    case 'lexical_declaration':
    case 'variable_declaration':
      return isConst ? 'constant' : 'variable'
    default:
      return 'variable'
  }
}

// =============================================================================
// SYMBOL EXTRACTION
// =============================================================================

/**
 * Extract the name from a declaration node
 */
function extractName(node: Parser.SyntaxNode): string | null {
  // For most declarations, the name is in an 'identifier' or 'type_identifier' child
  const nameNode =
    node.childForFieldName('name') ||
    node.children.find((child) => child.type === 'identifier' || child.type === 'type_identifier')

  if (nameNode) {
    return nameNode.text
  }

  return null
}

/**
 * Check if a lexical/variable declaration is a const
 */
function isConstDeclaration(node: Parser.SyntaxNode): boolean {
  // Check first child for 'const' keyword
  const firstChild = node.children[0]
  return firstChild?.type === 'const'
}

/**
 * Extract variable declarator name and determine if it's a function (arrow function)
 */
function extractVariableInfo(
  node: Parser.SyntaxNode
): { name: string; isFunction: boolean } | null {
  // Find the variable_declarator child
  const declarator = node.children.find((child) => child.type === 'variable_declarator')
  if (!declarator) return null

  const nameNode = declarator.childForFieldName('name')
  if (!nameNode || nameNode.type !== 'identifier') return null

  const name = nameNode.text

  // Check if the value is an arrow function
  const value = declarator.childForFieldName('value')
  const isFunction = value?.type === 'arrow_function'

  return { name, isFunction }
}

/**
 * Create an ExtractedSymbol from a node
 */
function createSymbol(
  node: Parser.SyntaxNode,
  name: string,
  kind: SymbolKind,
  filePath: string,
  exported: boolean
): ExtractedSymbol {
  return {
    id: `${filePath}:${name}`,
    name,
    kind,
    filePath,
    startLine: node.startPosition.row + 1, // Convert to 1-indexed
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column,
    exported
  }
}

/**
 * Extract all top-level symbols from a syntax tree
 */
function extractSymbolsFromTree(tree: Parser.Tree, filePath: string): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = []
  const rootNode = tree.rootNode

  // Process direct children of the program node (top-level only)
  for (const child of rootNode.children) {
    let node = child
    let exported = false

    // Handle export statements - unwrap to get the actual declaration
    if (child.type === 'export_statement') {
      exported = true
      // Find the declaration inside the export
      const declaration = child.children.find((c) => SYMBOL_NODE_TYPES.has(c.type))
      if (declaration) {
        node = declaration
      } else {
        // Could be a default export or re-export, skip for now
        continue
      }
    }

    // Skip non-symbol nodes
    if (!SYMBOL_NODE_TYPES.has(node.type)) {
      continue
    }

    // Handle variable declarations (const/let/var)
    if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
      const isConst = isConstDeclaration(node)
      const varInfo = extractVariableInfo(node)

      if (varInfo) {
        // If it's an arrow function assigned to a variable, classify as function
        const kind = varInfo.isFunction ? 'function' : getSymbolKind(node.type, isConst)
        symbols.push(createSymbol(node, varInfo.name, kind, filePath, exported))
      }
      continue
    }

    // Handle other declarations (function, class, interface, type, enum)
    const name = extractName(node)
    if (name) {
      const kind = getSymbolKind(node.type)
      symbols.push(createSymbol(node, name, kind, filePath, exported))
    }
  }

  return symbols
}

/**
 * Parse a single file and extract its symbols
 */
export function extractSymbolsFromFile(absolutePath: string, projectRoot: string): FileSymbols {
  const relativePath = toRelativePath(absolutePath, projectRoot)

  const content = fs.readFileSync(absolutePath, 'utf-8')
  const parser = getParser(absolutePath)
  const tree = parser.parse(content)

  const symbols = extractSymbolsFromTree(tree, relativePath)

  return {
    filePath: relativePath,
    symbols
  }
}

/**
 * Extract symbols from an entire project
 */
export function extractProjectSymbols(
  projectRoot: string,
  options?: ExtractorOptions
): ProjectSymbols {
  const files = walkDirectory(projectRoot, options)
  const fileSymbols: FileSymbols[] = []
  const errors: FileParseError[] = []
  let totalSymbols = 0

  for (const file of files) {
    try {
      const result = extractSymbolsFromFile(file, projectRoot)
      fileSymbols.push(result)
      totalSymbols += result.symbols.length
    } catch (error) {
      const relativePath = toRelativePath(file, projectRoot)
      errors.push({
        filePath: relativePath,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return {
    projectRoot,
    files: fileSymbols,
    totalSymbols,
    totalFiles: files.length,
    errors
  }
}

/**
 * Pretty print project symbols for debugging
 */
export function formatProjectSymbols(result: ProjectSymbols): string {
  const lines: string[] = [
    `Project: ${result.projectRoot}`,
    `Files: ${result.totalFiles}`,
    `Symbols: ${result.totalSymbols}`,
    `Errors: ${result.errors.length}`,
    ''
  ]

  for (const file of result.files) {
    if (file.symbols.length === 0) continue

    lines.push(`📄 ${file.filePath}`)
    for (const symbol of file.symbols) {
      const exportIcon = symbol.exported ? '📤' : '  '
      const kindIcon = getKindIcon(symbol.kind)
      lines.push(
        `  ${exportIcon} ${kindIcon} ${symbol.name} (L${symbol.startLine}-${symbol.endLine})`
      )
    }
    lines.push('')
  }

  if (result.errors.length > 0) {
    lines.push('--- Errors ---')
    for (const error of result.errors) {
      lines.push(`❌ ${error.filePath}: ${error.error}`)
    }
  }

  return lines.join('\n')
}

function getKindIcon(kind: SymbolKind): string {
  switch (kind) {
    case 'function':
      return 'ƒ'
    case 'class':
      return '🏛'
    case 'interface':
      return '📋'
    case 'type':
      return '📝'
    case 'enum':
      return '🔢'
    case 'constant':
      return '🔒'
    case 'variable':
      return '📦'
    case 'object':
      return '🗃'
    default:
      return '•'
  }
}
