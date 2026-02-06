import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph'
import { walkDirectory, toRelativePath } from './fileWalker'
import type {
  ExtractedSymbol,
  ExtractorOptions,
  FileParseError,
  FileSymbols,
  ProjectSymbols,
  SymbolKind,
  DependencyEdge,
  ParameterInfo
} from './types'

// =============================================================================
// TS-MORPH PROJECT SETUP
// =============================================================================

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
// METADATA EXTRACTION HELPERS
// =============================================================================

/**
 * Extract JSDoc description from a node
 */
function extractJsDocDescription(node: Node): string | undefined {
  if (!Node.isJSDocable(node)) return undefined

  const jsDocs = node.getJsDocs()
  if (jsDocs.length === 0) return undefined

  // Get description from the first JSDoc comment
  const description = jsDocs[0].getDescription().trim()
  return description || undefined
}

/**
 * Try to resolve a type to a project symbol ID
 * Returns the symbol ID if the type refers to a project symbol (interface, type, class, enum)
 * Returns undefined for primitive types or external types
 */
function resolveTypeToSymbolId(
  typeNode: Node | undefined,
  projectRoot: string
): string | undefined {
  if (!typeNode) return undefined

  try {
    // Handle type reference (e.g., User, ApiResponse<T>)
    if (Node.isTypeReference(typeNode)) {
      const typeName = typeNode.getTypeName()
      if (Node.isIdentifier(typeName)) {
        const symbol = typeName.getSymbol()
        if (symbol) {
          const aliasedSymbol = symbol.getAliasedSymbol()
          const symbolToUse = aliasedSymbol || symbol
          const declarations = symbolToUse.getDeclarations()

          if (declarations && declarations.length > 0) {
            const decl = declarations[0]
            const declFile = decl.getSourceFile().getFilePath()

            // Check if this is a project file (not from node_modules or external)
            if (!declFile.includes('node_modules') && !declFile.includes('typescript/lib')) {
              const filePath = toRelativePath(declFile, projectRoot)
              const name = symbolToUse.getName()
              return `${filePath}:${name}`
            }
          }
        }
      }
    }
  } catch {
    // Type resolution failed
  }

  return undefined
}

/**
 * Get the raw type text from a type node
 */
function getTypeText(typeNode: Node | undefined): string | undefined {
  if (!typeNode) return undefined
  return typeNode.getText()
}

/**
 * Extract function parameters with their types
 */
function extractFunctionParameters(
  params: Node[],
  projectRoot: string
): ParameterInfo[] | undefined {
  if (params.length === 0) return undefined

  return params
    .filter((p) => Node.isParameterDeclaration(p))
    .map((param) => {
      if (!Node.isParameterDeclaration(param)) {
        return { name: 'unknown' }
      }

      const name = param.getName()
      const typeNode = param.getTypeNode()

      const result: ParameterInfo = { name }

      if (typeNode) {
        const typeId = resolveTypeToSymbolId(typeNode, projectRoot)
        if (typeId) {
          result.typeId = typeId
        }
        result.typeText = getTypeText(typeNode)
      }

      return result
    })
}

/**
 * Extract return type information from a function
 */
function extractReturnType(
  returnTypeNode: Node | undefined,
  projectRoot: string
): { returnTypeId?: string; returnTypeText?: string } {
  if (!returnTypeNode) return {}

  const typeId = resolveTypeToSymbolId(returnTypeNode, projectRoot)
  const typeText = getTypeText(returnTypeNode)

  return {
    returnTypeId: typeId,
    returnTypeText: typeText
  }
}

// =============================================================================
// SYMBOL EXTRACTION
// =============================================================================

/**
 * Options for creating an ExtractedSymbol
 */
interface CreateSymbolOptions {
  description?: string
  returnTypeId?: string
  returnTypeText?: string
  parameters?: ParameterInfo[]
}

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
  exported: boolean,
  options?: CreateSymbolOptions
): ExtractedSymbol {
  const symbol: ExtractedSymbol = {
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

  // Add optional metadata
  if (options?.description) {
    symbol.description = options.description
  }
  if (options?.returnTypeId) {
    symbol.returnTypeId = options.returnTypeId
  }
  if (options?.returnTypeText) {
    symbol.returnTypeText = options.returnTypeText
  }
  if (options?.parameters) {
    symbol.parameters = options.parameters
  }

  return symbol
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
      // Extract function metadata
      const description = extractJsDocDescription(func)
      const parameters = extractFunctionParameters(func.getParameters(), projectRoot)
      const returnTypeNode = func.getReturnTypeNode()
      const { returnTypeId, returnTypeText } = extractReturnType(returnTypeNode, projectRoot)

      symbols.push(
        createSymbol(
          name,
          'function',
          relativePath,
          func.getStartLineNumber(),
          func.getEndLineNumber(),
          func.getStart() - func.getStartLinePos(),
          func.getEnd() - func.getStartLinePos(),
          isExported(func),
          { description, parameters, returnTypeId, returnTypeText }
        )
      )
    }
  }

  // Extract classes
  for (const cls of sourceFile.getClasses()) {
    const name = cls.getName()
    if (name) {
      // Extract class metadata (just description for classes)
      const description = extractJsDocDescription(cls)

      symbols.push(
        createSymbol(
          name,
          'class',
          relativePath,
          cls.getStartLineNumber(),
          cls.getEndLineNumber(),
          cls.getStart() - cls.getStartLinePos(),
          cls.getEnd() - cls.getStartLinePos(),
          isExported(cls),
          { description }
        )
      )
    }
  }

  // Extract interfaces
  for (const iface of sourceFile.getInterfaces()) {
    const name = iface.getName()
    // Extract interface metadata (just description)
    const description = extractJsDocDescription(iface)

    symbols.push(
      createSymbol(
        name,
        'interface',
        relativePath,
        iface.getStartLineNumber(),
        iface.getEndLineNumber(),
        iface.getStart() - iface.getStartLinePos(),
        iface.getEnd() - iface.getStartLinePos(),
        isExported(iface),
        { description }
      )
    )
  }

  // Extract type aliases
  for (const typeAlias of sourceFile.getTypeAliases()) {
    const name = typeAlias.getName()
    // Extract type alias metadata (just description)
    const description = extractJsDocDescription(typeAlias)

    symbols.push(
      createSymbol(
        name,
        'type',
        relativePath,
        typeAlias.getStartLineNumber(),
        typeAlias.getEndLineNumber(),
        typeAlias.getStart() - typeAlias.getStartLinePos(),
        typeAlias.getEnd() - typeAlias.getStartLinePos(),
        isExported(typeAlias),
        { description }
      )
    )
  }

  // Extract enums
  for (const enumDecl of sourceFile.getEnums()) {
    const name = enumDecl.getName()
    // Extract enum metadata (just description)
    const description = extractJsDocDescription(enumDecl)

    symbols.push(
      createSymbol(
        name,
        'enum',
        relativePath,
        enumDecl.getStartLineNumber(),
        enumDecl.getEndLineNumber(),
        enumDecl.getStart() - enumDecl.getStartLinePos(),
        enumDecl.getEnd() - enumDecl.getStartLinePos(),
        isExported(enumDecl),
        { description }
      )
    )
  }

  // Extract variable declarations (const, let, var at top level)
  for (const varStatement of sourceFile.getVariableStatements()) {
    const isConst = varStatement.getDeclarationKind() === 'const'
    const exported = isExported(varStatement)

    // Get JSDoc from the variable statement
    const statementDescription = extractJsDocDescription(varStatement)

    for (const decl of varStatement.getDeclarations()) {
      const name = decl.getName()
      const initializer = decl.getInitializer()

      // Check if it's an arrow function or function expression
      let kind: SymbolKind = isConst ? 'constant' : 'variable'
      let options: CreateSymbolOptions = { description: statementDescription }

      if (initializer) {
        if (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) {
          kind = 'function'

          // Extract function metadata for arrow functions/function expressions
          const parameters = extractFunctionParameters(initializer.getParameters(), projectRoot)
          const returnTypeNode = initializer.getReturnTypeNode()
          const { returnTypeId, returnTypeText } = extractReturnType(returnTypeNode, projectRoot)

          options = {
            description: statementDescription,
            parameters,
            returnTypeId,
            returnTypeText
          }
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
          exported,
          options
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
 * Extract function call dependency edges from the project using O(n) algorithm with getAncestors()
 */
function extractCallDependencyEdges(
  project: Project,
  symbolMap: Map<string, ExtractedSymbol>,
  projectRoot: string
): DependencyEdge[] {
  const edges: DependencyEdge[] = []
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

            // Handle default exports: symbol name is "default" but declaration has actual name
            if (calleeName === 'default' && declarations.length > 0) {
              const decl = declarations[0]
              // Try to get name from the declaration (FunctionDeclaration, ClassDeclaration, etc.)
              if (Node.isFunctionDeclaration(decl) || Node.isClassDeclaration(decl)) {
                calleeName = decl.getName() || calleeName
              } else if (Node.isVariableDeclaration(decl)) {
                calleeName = decl.getName() || calleeName
              }
              // If still "default", we'll try the fallback below
            }

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
        location: {
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

            // Handle default exports: symbol name is "default" but declaration has actual name
            if (componentName === 'default') {
              // Try to get name from the declaration (FunctionDeclaration, ClassDeclaration, etc.)
              if (Node.isFunctionDeclaration(decl) || Node.isClassDeclaration(decl)) {
                componentName = decl.getName() || componentName
              } else if (Node.isVariableDeclaration(decl)) {
                componentName = decl.getName() || componentName
              }
              // If still "default", fall back to the tag name used in JSX
              if (componentName === 'default') {
                componentName = tagName
              }
            }
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
        location: {
          file: relativePath,
          line: jsxLine
        }
      })
    }
  }

  return edges
}

/**
 * Determine if an identifier usage is a write operation
 * Checks for assignment expressions (=, +=, -=, etc.) and unary expressions (++, --)
 */
function isWriteOperation(identifier: Node): boolean {
  const parent = identifier.getParent()
  if (!parent) return false

  // Check for assignment: globalVar = value, globalVar += value, etc.
  if (Node.isBinaryExpression(parent)) {
    const operatorToken = parent.getOperatorToken().getKind()
    const isAssignmentOperator =
      operatorToken === SyntaxKind.EqualsToken ||
      operatorToken === SyntaxKind.PlusEqualsToken ||
      operatorToken === SyntaxKind.MinusEqualsToken ||
      operatorToken === SyntaxKind.AsteriskEqualsToken ||
      operatorToken === SyntaxKind.SlashEqualsToken ||
      operatorToken === SyntaxKind.PercentEqualsToken ||
      operatorToken === SyntaxKind.AmpersandEqualsToken ||
      operatorToken === SyntaxKind.BarEqualsToken ||
      operatorToken === SyntaxKind.CaretEqualsToken ||
      operatorToken === SyntaxKind.LessThanLessThanEqualsToken ||
      operatorToken === SyntaxKind.GreaterThanGreaterThanEqualsToken ||
      operatorToken === SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
      operatorToken === SyntaxKind.AsteriskAsteriskEqualsToken ||
      operatorToken === SyntaxKind.BarBarEqualsToken ||
      operatorToken === SyntaxKind.AmpersandAmpersandEqualsToken ||
      operatorToken === SyntaxKind.QuestionQuestionEqualsToken

    // Check if identifier is on the left side of the assignment
    if (isAssignmentOperator) {
      const left = parent.getLeft()
      return left === identifier || left.getText() === identifier.getText()
    }
  }

  // Check for prefix unary: ++globalVar, --globalVar
  if (Node.isPrefixUnaryExpression(parent)) {
    const operator = parent.getOperatorToken()
    return operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken
  }

  // Check for postfix unary: globalVar++, globalVar--
  if (Node.isPostfixUnaryExpression(parent)) {
    const operator = parent.getOperatorToken()
    return operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken
  }

  return false
}

/**
 * Extract global variable dependency edges (reads and writes) from the project
 * Uses O(n) algorithm - iterates identifiers once and checks against global symbol set
 */
function extractGlobalVariableEdges(
  project: Project,
  symbolMap: Map<string, ExtractedSymbol>,
  projectRoot: string
): DependencyEdge[] {
  const edges: DependencyEdge[] = []
  const seenEdges = new Set<string>()

  // Build a set of global variable symbol IDs (module-level constants, variables, objects)
  const globalVarIds = new Set<string>()
  for (const [id, symbol] of symbolMap) {
    if (symbol.kind === 'constant' || symbol.kind === 'variable' || symbol.kind === 'object') {
      globalVarIds.add(id)
    }
  }

  // If no global variables, nothing to do
  if (globalVarIds.size === 0) {
    return edges
  }

  for (const sourceFile of project.getSourceFiles()) {
    const relativePath = toRelativePath(sourceFile.getFilePath(), projectRoot)

    // Find all identifiers in this file - O(n) where n is nodes in file
    const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)

    for (const identifier of identifiers) {
      // Skip if this identifier is part of a declaration (not a usage)
      const parent = identifier.getParent()
      if (!parent) continue

      // Skip declarations where this identifier is the NAME being declared (not an initializer/usage)
      if (Node.isVariableDeclaration(parent)) {
        // Only skip if this identifier IS the name being declared
        // Don't skip if this identifier is in the initializer (e.g., `const old = state`)
        const nameNode = parent.getNameNode()
        if (nameNode === identifier || nameNode.getText() === identifier.getText()) {
          continue
        }
      }

      // Skip function/method declarations, parameters, imports, types, etc.
      if (
        Node.isFunctionDeclaration(parent) ||
        Node.isParameterDeclaration(parent) ||
        Node.isPropertyDeclaration(parent) ||
        Node.isPropertySignature(parent) ||
        Node.isMethodDeclaration(parent) ||
        Node.isImportSpecifier(parent) ||
        Node.isExportSpecifier(parent) ||
        Node.isTypeReference(parent) ||
        Node.isTypeAliasDeclaration(parent) ||
        Node.isInterfaceDeclaration(parent)
      ) {
        continue
      }

      // Get the symbol this identifier references
      try {
        const symbol = identifier.getSymbol()
        if (!symbol) continue

        // Follow aliased symbols (imports)
        const aliasedSymbol = symbol.getAliasedSymbol()
        const symbolToUse = aliasedSymbol || symbol
        const declarations = symbolToUse.getDeclarations()

        if (!declarations || declarations.length === 0) continue

        const decl = declarations[0]
        const declSourceFile = decl.getSourceFile()
        const globalVarFilePath = toRelativePath(declSourceFile.getFilePath(), projectRoot)
        const globalVarName = symbolToUse.getName()
        const globalVarId = `${globalVarFilePath}:${globalVarName}`

        // Check if this is a global variable we're tracking
        if (!globalVarIds.has(globalVarId)) continue

        // Find the containing function
        const caller = findContainingFunctionByAncestors(identifier, projectRoot)
        if (!caller) continue // Skip if not inside a function

        // Skip self-references (shouldn't happen, but just in case)
        if (caller.id === globalVarId) continue

        // Determine if this is a read or write
        const isWrite = isWriteOperation(identifier)
        const edgeType = isWrite ? 'global-write' : 'global-read'

        // Create unique edge ID (function -> global var with type)
        const edgeId = `${caller.id}->${globalVarId}:${edgeType}`

        // Skip duplicates (same function accessing same global with same type)
        if (seenEdges.has(edgeId)) continue
        seenEdges.add(edgeId)

        edges.push({
          id: edgeId, // Include edge type in ID to ensure uniqueness
          source: caller.id,
          target: globalVarId,
          type: edgeType,
          location: {
            file: relativePath,
            line: identifier.getStartLineNumber()
          }
        })
      } catch {
        // Symbol resolution failed, skip this identifier
        continue
      }
    }
  }

  return edges
}

/**
 * Extract class instantiation dependency edges from the project
 * Detects when functions instantiate classes with `new ClassName()`
 * Uses O(n) algorithm - iterates NewExpression nodes once and checks against class symbol set
 */
function extractClassInstantiationEdges(
  project: Project,
  symbolMap: Map<string, ExtractedSymbol>,
  projectRoot: string
): DependencyEdge[] {
  const edges: DependencyEdge[] = []
  const seenEdges = new Set<string>()

  // Build a set of class symbol IDs
  const classIds = new Set<string>()
  for (const [id, symbol] of symbolMap) {
    if (symbol.kind === 'class') {
      classIds.add(id)
    }
  }

  // If no classes, nothing to do
  if (classIds.size === 0) {
    return edges
  }

  for (const sourceFile of project.getSourceFiles()) {
    const relativePath = toRelativePath(sourceFile.getFilePath(), projectRoot)

    // Find all NewExpression nodes (new ClassName()) in this file
    const newExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)

    for (const newExpr of newExpressions) {
      const line = newExpr.getStartLineNumber()

      // Find the containing function
      const caller = findContainingFunctionByAncestors(newExpr, projectRoot)
      if (!caller) continue // Skip if not inside a function

      // Get the expression being instantiated (the class name)
      const expression = newExpr.getExpression()

      let className: string | null = null
      let classFilePath: string | null = null

      try {
        // Try to resolve the class symbol
        const symbol = expression.getSymbol()
        if (symbol) {
          // Follow aliased symbols (imports)
          const aliasedSymbol = symbol.getAliasedSymbol()
          const symbolToUse = aliasedSymbol || symbol
          const declarations = symbolToUse.getDeclarations()

          if (declarations && declarations.length > 0) {
            const decl = declarations[0]
            const declSourceFile = decl.getSourceFile()
            classFilePath = toRelativePath(declSourceFile.getFilePath(), projectRoot)
            className = symbolToUse.getName()
          }
        }

        // Fallback: try to get name from expression text
        if (!className) {
          if (Node.isIdentifier(expression)) {
            className = expression.getText()
            classFilePath = relativePath // Assume same file if can't resolve
          }
        }
      } catch {
        // Symbol resolution failed, skip this instantiation
        continue
      }

      if (!className || !classFilePath) continue

      const classId = `${classFilePath}:${className}`

      // Only create edge if class is in our symbol map
      if (!classIds.has(classId)) continue

      // Skip self-references (shouldn't happen, but just in case)
      if (caller.id === classId) continue

      const edgeId = `${caller.id}->${classId}:class-instantiation`

      // Skip duplicates
      if (seenEdges.has(edgeId)) continue
      seenEdges.add(edgeId)

      edges.push({
        id: edgeId,
        source: caller.id,
        target: classId,
        type: 'class-instantiation',
        location: {
          file: relativePath,
          line
        }
      })
    }
  }

  return edges
}

/**
 * Extract enum usage dependency edges from the project
 * Detects when functions use enum members (e.g., `Status.Active`, `UserRole.Admin`)
 * Uses O(n) algorithm - iterates property access expressions and checks against enum symbol set
 */
function extractEnumUsageEdges(
  project: Project,
  symbolMap: Map<string, ExtractedSymbol>,
  projectRoot: string
): DependencyEdge[] {
  const edges: DependencyEdge[] = []
  const seenEdges = new Set<string>()

  // Build a set of enum symbol IDs
  const enumIds = new Set<string>()
  for (const [id, symbol] of symbolMap) {
    if (symbol.kind === 'enum') {
      enumIds.add(id)
    }
  }

  // If no enums, nothing to do
  if (enumIds.size === 0) {
    return edges
  }

  for (const sourceFile of project.getSourceFiles()) {
    const relativePath = toRelativePath(sourceFile.getFilePath(), projectRoot)

    // Find all identifiers that might reference enums
    const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)

    for (const identifier of identifiers) {
      const parent = identifier.getParent()
      if (!parent) continue

      // Skip if this is part of a declaration or import
      if (
        Node.isEnumDeclaration(parent) ||
        Node.isEnumMember(parent) ||
        Node.isImportSpecifier(parent) ||
        Node.isExportSpecifier(parent) ||
        Node.isTypeReference(parent)
      ) {
        continue
      }

      // Try to resolve the identifier's symbol
      try {
        const symbol = identifier.getSymbol()
        if (!symbol) continue

        // Follow aliased symbols (imports)
        const aliasedSymbol = symbol.getAliasedSymbol()
        const symbolToUse = aliasedSymbol || symbol
        const declarations = symbolToUse.getDeclarations()

        if (!declarations || declarations.length === 0) continue

        const decl = declarations[0]

        // Check if this references an enum
        if (!Node.isEnumDeclaration(decl)) continue

        const enumName = symbolToUse.getName()
        const enumFilePath = toRelativePath(decl.getSourceFile().getFilePath(), projectRoot)
        const enumId = `${enumFilePath}:${enumName}`

        // Check if this is an enum we're tracking
        if (!enumIds.has(enumId)) continue

        // Find the containing function
        const caller = findContainingFunctionByAncestors(identifier, projectRoot)
        if (!caller) continue // Skip if not inside a function

        // Skip self-references (shouldn't happen, but just in case)
        if (caller.id === enumId) continue

        const edgeId = `${caller.id}->${enumId}:enum-use`

        // Skip duplicates
        if (seenEdges.has(edgeId)) continue
        seenEdges.add(edgeId)

        edges.push({
          id: edgeId,
          source: caller.id,
          target: enumId,
          type: 'enum-use',
          location: {
            file: relativePath,
            line: identifier.getStartLineNumber()
          }
        })
      } catch {
        // Symbol resolution failed, skip this identifier
        continue
      }
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

  // Build symbol map for dependency resolution
  const symbolMap = buildSymbolMap(fileSymbols)

  // Extract function call dependency edges
  const callDependencyEdges = extractCallDependencyEdges(project, symbolMap, projectRoot)

  // Extract global variable dependency edges
  const globalVarEdges = extractGlobalVariableEdges(project, symbolMap, projectRoot)

  // Extract class instantiation dependency edges
  const classInstantiationEdges = extractClassInstantiationEdges(project, symbolMap, projectRoot)

  // Extract enum usage dependency edges
  const enumUsageEdges = extractEnumUsageEdges(project, symbolMap, projectRoot)

  // Combine all edges
  const allEdges = [
    ...callDependencyEdges,
    ...globalVarEdges,
    ...classInstantiationEdges,
    ...enumUsageEdges
  ]

  return {
    projectRoot,
    files: fileSymbols,
    callEdges: allEdges,
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
    lines.push('--- Dependency Graph ---')
    for (const edge of result.callEdges) {
      lines.push(`  ${edge.source} → ${edge.target} (${edge.location.file}:${edge.location.line})`)
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
