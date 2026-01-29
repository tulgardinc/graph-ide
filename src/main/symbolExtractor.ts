import * as path from 'path'
import { Project, SourceFile, Node, SyntaxKind, ts } from 'ts-morph'
import { walkDirectory, toRelativePath } from './fileWalker'
import type {
  ExtractedSymbol,
  ExtractorOptions,
  FileParseError,
  FileSymbols,
  ProjectSymbols,
  SymbolKind,
  CallEdge,
  EdgeType
} from './types'

// =============================================================================
// TS-MORPH PROJECT SETUP
// =============================================================================

import * as fs from 'fs'

/**
 * Create a ts-morph Project for analyzing TypeScript files
 * Uses minimal config to allow ts-morph to handle import resolution
 */
function createProject(_projectRoot: string): Project {
  // Create a simple project - ts-morph will handle import resolution
  // when all files are loaded via addSourceFileAtPath
  return new Project()
}

// =============================================================================
// SYMBOL KIND MAPPING
// =============================================================================

/**
 * Determine if a node is exported
 */
function isExported(node: Node): boolean {
  // Check for export keyword
  if (Node.isExportable(node)) {
    return node.isExported()
  }
  return false
}

/**
 * Get icon for a symbol kind (for debugging output)
 */
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

// =============================================================================
// SYMBOL EXTRACTION
// =============================================================================

/**
 * Create an ExtractedSymbol from node information
 */
function createSymbol(
  name: string,
  kind: SymbolKind,
  filePath: string,
  startLine: number,
  endLine: number,
  startColumn: number,
  endColumn: number,
  exported: boolean
): ExtractedSymbol {
  return {
    id: `${filePath}:${name}`,
    name,
    kind,
    filePath,
    startLine,
    endLine,
    startColumn,
    endColumn,
    exported
  }
}

/**
 * Extract symbols from a single source file
 */
function extractSymbolsFromSourceFile(sourceFile: SourceFile, projectRoot: string): FileSymbols {
  const absolutePath = sourceFile.getFilePath()
  const relativePath = toRelativePath(absolutePath, projectRoot)
  const symbols: ExtractedSymbol[] = []

  // Extract functions
  for (const func of sourceFile.getFunctions()) {
    const name = func.getName()
    if (name) {
      symbols.push(
        createSymbol(
          name,
          'function',
          relativePath,
          func.getStartLineNumber(),
          func.getEndLineNumber(),
          func.getStart() - func.getStartLinePos(),
          func.getEnd() - func.getStartLinePos(),
          isExported(func)
        )
      )
    }
  }

  // Extract classes
  for (const cls of sourceFile.getClasses()) {
    const name = cls.getName()
    if (name) {
      symbols.push(
        createSymbol(
          name,
          'class',
          relativePath,
          cls.getStartLineNumber(),
          cls.getEndLineNumber(),
          cls.getStart() - cls.getStartLinePos(),
          cls.getEnd() - cls.getStartLinePos(),
          isExported(cls)
        )
      )
    }
  }

  // Extract interfaces
  for (const iface of sourceFile.getInterfaces()) {
    const name = iface.getName()
    symbols.push(
      createSymbol(
        name,
        'interface',
        relativePath,
        iface.getStartLineNumber(),
        iface.getEndLineNumber(),
        iface.getStart() - iface.getStartLinePos(),
        iface.getEnd() - iface.getStartLinePos(),
        isExported(iface)
      )
    )
  }

  // Extract type aliases
  for (const typeAlias of sourceFile.getTypeAliases()) {
    const name = typeAlias.getName()
    symbols.push(
      createSymbol(
        name,
        'type',
        relativePath,
        typeAlias.getStartLineNumber(),
        typeAlias.getEndLineNumber(),
        typeAlias.getStart() - typeAlias.getStartLinePos(),
        typeAlias.getEnd() - typeAlias.getStartLinePos(),
        isExported(typeAlias)
      )
    )
  }

  // Extract enums
  for (const enumDecl of sourceFile.getEnums()) {
    const name = enumDecl.getName()
    symbols.push(
      createSymbol(
        name,
        'enum',
        relativePath,
        enumDecl.getStartLineNumber(),
        enumDecl.getEndLineNumber(),
        enumDecl.getStart() - enumDecl.getStartLinePos(),
        enumDecl.getEnd() - enumDecl.getStartLinePos(),
        isExported(enumDecl)
      )
    )
  }

  // Extract variable declarations (const, let, var at top level)
  for (const varStatement of sourceFile.getVariableStatements()) {
    const isConst = varStatement.getDeclarationKind() === 'const'
    const exported = isExported(varStatement)

    for (const decl of varStatement.getDeclarations()) {
      const name = decl.getName()
      const initializer = decl.getInitializer()

      // Check if it's an arrow function or function expression
      let kind: SymbolKind = isConst ? 'constant' : 'variable'
      if (initializer) {
        if (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) {
          kind = 'function'
        } else if (Node.isObjectLiteralExpression(initializer)) {
          kind = 'object'
        }
      }

      symbols.push(
        createSymbol(
          name,
          kind,
          relativePath,
          varStatement.getStartLineNumber(),
          varStatement.getEndLineNumber(),
          varStatement.getStart() - varStatement.getStartLinePos(),
          varStatement.getEnd() - varStatement.getStartLinePos(),
          exported
        )
      )
    }
  }

  return {
    filePath: relativePath,
    symbols
  }
}

// =============================================================================
// CALL GRAPH EXTRACTION
// =============================================================================

/**
 * Build a map of symbol IDs to their containing function/method
 */
function buildSymbolMap(files: FileSymbols[]): Map<string, ExtractedSymbol> {
  const map = new Map<string, ExtractedSymbol>()
  for (const file of files) {
    for (const symbol of file.symbols) {
      map.set(symbol.id, symbol)
    }
  }
  return map
}

/**
 * Find the containing function/method for a call expression using getAncestors().
 * This is O(depth) per call instead of O(functions) - much more efficient.
 */
export function findContainingFunctionByAncestors(
  callExpr: Node,
  projectRoot: string
): ExtractedSymbol | null {
  const sourceFile = callExpr.getSourceFile()
  const relativePath = toRelativePath(sourceFile.getFilePath(), projectRoot)

  // Walk up the AST using getAncestors()
  const ancestors = callExpr.getAncestors()

  for (const ancestor of ancestors) {
    // Check for function declaration: function foo() {}
    if (Node.isFunctionDeclaration(ancestor)) {
      const name = ancestor.getName()
      if (name) {
        return {
          id: `${relativePath}:${name}`,
          name,
          kind: 'function',
          filePath: relativePath,
          startLine: ancestor.getStartLineNumber(),
          endLine: ancestor.getEndLineNumber(),
          startColumn: 0,
          endColumn: 0,
          exported: isExported(ancestor)
        }
      }
    }

    // Check for method declaration: class Foo { bar() {} }
    if (Node.isMethodDeclaration(ancestor)) {
      const methodName = ancestor.getName()
      const parentClass = ancestor.getParent()
      if (Node.isClassDeclaration(parentClass)) {
        const className = parentClass.getName()
        if (className && methodName) {
          return {
            id: `${relativePath}:${className}.${methodName}`,
            name: `${className}.${methodName}`,
            kind: 'function',
            filePath: relativePath,
            startLine: ancestor.getStartLineNumber(),
            endLine: ancestor.getEndLineNumber(),
            startColumn: 0,
            endColumn: 0,
            exported: isExported(parentClass)
          }
        }
      }
    }

    // Check for arrow function or function expression assigned to a variable
    // e.g., const foo = () => {} or const foo = function() {}
    if (Node.isArrowFunction(ancestor) || Node.isFunctionExpression(ancestor)) {
      const parent = ancestor.getParent()
      if (Node.isVariableDeclaration(parent)) {
        const name = parent.getName()
        const varStatement = parent.getParent()?.getParent()
        if (varStatement && Node.isVariableStatement(varStatement)) {
          return {
            id: `${relativePath}:${name}`,
            name,
            kind: 'function',
            filePath: relativePath,
            startLine: varStatement.getStartLineNumber(),
            endLine: varStatement.getEndLineNumber(),
            startColumn: 0,
            endColumn: 0,
            exported: isExported(varStatement)
          }
        }
      }
    }
  }

  return null
}

/**
 * Extract call edges from the project using O(n) algorithm with getAncestors()
 */
function extractCallEdges(
  project: Project,
  symbolMap: Map<string, ExtractedSymbol>,
  projectRoot: string
): CallEdge[] {
  const edges: CallEdge[] = []
  const seenEdges = new Set<string>()

  for (const sourceFile of project.getSourceFiles()) {
    const relativePath = toRelativePath(sourceFile.getFilePath(), projectRoot)

    // Find all call expressions in this file - O(n) where n is nodes in file
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

    for (const callExpr of callExpressions) {
      const callLine = callExpr.getStartLineNumber()

      // Find the containing function using getAncestors() - O(depth) per call
      const caller = findContainingFunctionByAncestors(callExpr, projectRoot)
      if (!caller) continue // Call is not inside a known function

      // Get the expression being called
      const expression = callExpr.getExpression()
      let calleeName: string | null = null
      let calleeFilePath: string | null = null

      // Try to resolve the call target
      try {
        // Get the symbol of what's being called
        const originalSymbol = expression.getSymbol()

        if (originalSymbol) {
          // Follow aliased symbols (imports) to get the original definition
          const aliasedSymbol = originalSymbol.getAliasedSymbol()

          // Use the aliased symbol if available (for imports)
          // Otherwise fall back to the original symbol
          const symbolToUse = aliasedSymbol || originalSymbol
          const declarations = symbolToUse.getDeclarations()

          if (declarations && declarations.length > 0) {
            const decl = declarations[0]
            const declSourceFile = decl.getSourceFile()
            calleeFilePath = toRelativePath(declSourceFile.getFilePath(), projectRoot)

            // Get the name from the symbol directly (works for all declaration types)
            calleeName = symbolToUse.getName()

            // Special handling for class methods: ClassName.methodName
            if (Node.isMethodDeclaration(decl)) {
              const parentClass = decl.getParent()
              if (Node.isClassDeclaration(parentClass)) {
                const className = parentClass.getName()
                if (className) {
                  calleeName = `${className}.${calleeName}`
                }
              }
            }
          }
        }

        // Fallback: try to get name from the expression text
        if (!calleeName) {
          if (Node.isIdentifier(expression)) {
            calleeName = expression.getText()
            calleeFilePath = relativePath // Assume same file if can't resolve
          } else if (Node.isPropertyAccessExpression(expression)) {
            // e.g., obj.method() - get "method"
            calleeName = expression.getName()
            calleeFilePath = relativePath
          }
        }
      } catch {
        // Type resolution failed, skip this call
        continue
      }

      if (!calleeName || !calleeFilePath) continue

      // Build the callee ID
      const calleeId = `${calleeFilePath}:${calleeName}`

      // Only create edge if callee is in our symbol map (i.e., in the project)
      if (!symbolMap.has(calleeId)) continue

      // Skip self-calls and duplicates
      if (caller.id === calleeId) continue

      const edgeId = `${caller.id}->${calleeId}`
      if (seenEdges.has(edgeId)) continue

      seenEdges.add(edgeId)
      edges.push({
        id: edgeId,
        source: caller.id,
        target: calleeId,
        type: 'call',
        callSite: {
          file: relativePath,
          line: callLine
        }
      })
    }

    // Find JSX component uses: <ComponentName /> or <ComponentName>...</ComponentName>
    const jsxElements = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
    ]

    for (const jsxElement of jsxElements) {
      const jsxLine = jsxElement.getStartLineNumber()

      // Find the containing function
      const caller = findContainingFunctionByAncestors(jsxElement, projectRoot)
      if (!caller) continue

      // Get the tag name (component name)
      const tagNameNode = jsxElement.getTagNameNode()
      const tagName = tagNameNode.getText()

      // Skip lowercase tags (HTML elements like div, span)
      if (tagName[0] === tagName[0].toLowerCase()) continue

      // Try to resolve the component
      let componentFilePath: string | null = null
      let componentName: string | null = tagName

      try {
        const symbol = tagNameNode.getSymbol()
        if (symbol) {
          const aliasedSymbol = symbol.getAliasedSymbol()
          const symbolToUse = aliasedSymbol || symbol
          const declarations = symbolToUse.getDeclarations()

          if (declarations && declarations.length > 0) {
            const decl = declarations[0]
            componentFilePath = toRelativePath(decl.getSourceFile().getFilePath(), projectRoot)
            componentName = symbolToUse.getName()
          }
        }
      } catch {
        // Can't resolve, use the tag name as-is
        componentFilePath = relativePath
      }

      if (!componentFilePath) componentFilePath = relativePath
      if (!componentName) continue

      const componentId = `${componentFilePath}:${componentName}`

      // Only create edge if component is in our symbol map
      if (!symbolMap.has(componentId)) continue

      // Skip self-references
      if (caller.id === componentId) continue

      const edgeId = `${caller.id}->${componentId}`
      if (seenEdges.has(edgeId)) continue

      seenEdges.add(edgeId)
      edges.push({
        id: edgeId,
        source: caller.id,
        target: componentId,
        type: 'component-use',
        callSite: {
          file: relativePath,
          line: jsxLine
        }
      })
    }
  }

  return edges
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Extract symbols from a single file
 */
export function extractSymbolsFromFile(absolutePath: string, projectRoot: string): FileSymbols {
  const project = createProject(projectRoot)
  const sourceFile = project.addSourceFileAtPath(absolutePath)
  return extractSymbolsFromSourceFile(sourceFile, projectRoot)
}

/**
 * Extract symbols and call graph from an entire project
 */
export function extractProjectSymbols(
  projectRoot: string,
  options?: ExtractorOptions
): ProjectSymbols {
  const files = walkDirectory(projectRoot, options)
  const fileSymbols: FileSymbols[] = []
  const errors: FileParseError[] = []
  let totalSymbols = 0

  // Create ts-morph project
  const project = createProject(projectRoot)

  // Add all source files - we need them all loaded for proper import resolution
  for (const file of files) {
    try {
      project.addSourceFileAtPath(file)
    } catch (error) {
      const relativePath = toRelativePath(file, projectRoot)
      errors.push({
        filePath: relativePath,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  // Extract symbols from each file
  for (const sourceFile of project.getSourceFiles()) {
    try {
      const result = extractSymbolsFromSourceFile(sourceFile, projectRoot)
      fileSymbols.push(result)
      totalSymbols += result.symbols.length
    } catch (error) {
      const relativePath = toRelativePath(sourceFile.getFilePath(), projectRoot)
      errors.push({
        filePath: relativePath,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  // Build symbol map for call graph resolution
  const symbolMap = buildSymbolMap(fileSymbols)

  // Extract call edges
  const callEdges = extractCallEdges(project, symbolMap, projectRoot)

  return {
    projectRoot,
    files: fileSymbols,
    callEdges,
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
    `Call Edges: ${result.callEdges.length}`,
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

  if (result.callEdges.length > 0) {
    lines.push('--- Call Graph ---')
    for (const edge of result.callEdges) {
      lines.push(`  ${edge.source} → ${edge.target} (${edge.callSite.file}:${edge.callSite.line})`)
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
