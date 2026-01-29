# Map IDE — Active Context

## Current Work Focus

### Recently Completed: Call Graph Optimization & Unit Tests

- Refactored `findContainingFunction` → `findContainingFunctionByAncestors()` using ts-morph's `getAncestors()`
- Changed from O(n × functions) to O(n × depth) complexity per call expression
- Added comprehensive Vitest test suite (24 tests, all passing)
- Test coverage: function declarations, arrow functions, class methods, edge cases, performance

**Feature**: ts-morph Symbol Extractor with Call Graph for TypeScript codebases

This feature enables Map IDE to parse TypeScript/TSX projects, extract all top-level symbols, and **build a call graph** showing which functions call which other functions. Uses ts-morph for semantic analysis instead of tree-sitter.

## Recent Changes (Latest Session)

### Migration from tree-sitter to ts-morph

1. **Dependency changes**:
   - Removed: `tree-sitter`, `tree-sitter-typescript`
   - Added: `ts-morph` - TypeScript compiler wrapper with semantic analysis

2. **Updated type definitions** (`src/main/types.ts`):
   - Added `CallEdge` interface for call graph relationships
   - Updated `ProjectSymbols` to include `callEdges` array

3. **Rewrote symbol extractor** (`src/main/symbolExtractor.ts`):
   - Uses ts-morph Project to load and analyze TypeScript files
   - Extracts symbols: functions, classes, interfaces, types, enums, constants, variables
   - **NEW**: Builds call graph by analyzing CallExpressions
   - Resolves call targets using ts-morph's type checker
   - Returns both symbols (nodes) AND call edges

4. **Updated graphStore** (`src/renderer/src/store/graphStore.ts`):
   - Added `CallEdge` import
   - Added `callEdgesToFlowEdges()` function to convert call edges to React Flow edges
   - Updated `loadSymbols()` to also store call edges in `edgesByLevel.symbol`
   - Call edges styled with cyan color (#22d3ee)

5. **Updated preload types** (`src/preload/index.d.ts`):
   - Added `CallEdge` to type exports

## Call Graph Implementation

### How it works:

1. ts-morph creates a Project and loads all source files
2. For each function/method, we find all `CallExpression` nodes inside it
3. For each call, we resolve the target using the TypeScript compiler's type checker
4. If the callee is a function defined in our project (in the symbol map), we create a `CallEdge`
5. Edges are returned as: `{ source: callerId, target: calleeId, callSite: { file, line } }`

### Call Edge Data Structure:

```typescript
interface CallEdge {
  id: string // "caller->callee"
  source: string // Caller symbol ID (filePath:name)
  target: string // Callee symbol ID (filePath:name)
  callSite: {
    file: string // Where the call happens
    line: number // Line number of the call
  }
}
```

### Visual representation:

- Call edges are rendered as React Flow edges in the Symbol zoom level
- Styled with cyan color (#22d3ee) and arrow markers
- Layout handled by ELK.js which considers edges for positioning

## Testing Results

Test run on `test-project/`:

- **34 symbols** extracted from 6 files
- **1 call edge** detected: `getApiClient() → createApiClient()`

The test project mostly calls external APIs or methods on objects (which aren't tracked as project-level symbols), so only intra-project function calls are captured.

## Symbol Types Extracted

| Symbol Kind | ts-morph API                         | Example                                  |
| ----------- | ------------------------------------ | ---------------------------------------- |
| `function`  | `getFunctions()`, arrow functions    | `function foo()`, `const foo = () => {}` |
| `class`     | `getClasses()`                       | `class Foo {}`                           |
| `interface` | `getInterfaces()`                    | `interface IFoo {}`                      |
| `type`      | `getTypeAliases()`                   | `type Foo = {}`                          |
| `enum`      | `getEnums()`                         | `enum Foo {}`                            |
| `constant`  | `getVariableStatements()` with const | `const FOO = 'bar'`                      |
| `variable`  | `getVariableStatements()` with let   | `let x = 1`                              |

## Testing Instructions

1. Run the test script:

   ```bash
   npx tsx test-extractor.ts
   ```

2. Or start the development server and navigate to Symbol zoom level:

   ```bash
   npm run dev -- ./test-project
   ```

3. In the console, test symbol extraction:
   ```javascript
   const result = await window.api.scanProject()
   console.log(result.callEdges) // See call graph edges
   ```

## Next Steps

1. **Expand call graph detection**: Track method calls on class instances
2. **Import graph**: Show import/export relationships between modules
3. **Cross-file resolution**: Better handling of re-exported symbols
4. **Performance**: Consider caching ts-morph Project for incremental updates

## Active Decisions

- **ts-morph vs tree-sitter**: ts-morph chosen for semantic analysis capabilities (type resolution, call graph)
- **Intra-project calls only**: Only track calls to functions defined within the project
- **Deduplicated edges**: Same caller→callee pair only creates one edge

## Important Patterns

### ts-morph Project Setup

```typescript
function createProject(projectRoot: string): Project {
  const tsconfigPath = path.join(projectRoot, 'tsconfig.json')
  try {
    return new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: true
    })
  } catch {
    // Fallback to default settings if no tsconfig
    return new Project({ compilerOptions: { ... } })
  }
}
```

### Call Resolution

```typescript
const symbol = expression.getSymbol()
if (symbol) {
  const declarations = symbol.getDeclarations()
  // Get the file and name of where the function is defined
  // Build edge if target is in our project
}
```
