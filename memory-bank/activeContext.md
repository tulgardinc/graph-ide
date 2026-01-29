# Map IDE — Active Context

## Current Work Focus

**Feature**: Tree-sitter Symbol Extractor for TypeScript codebases

This feature enables Map IDE to parse TypeScript/TSX projects and extract all top-level symbols (functions, classes, interfaces, types, enums, constants, variables) for display in the Construct/Symbol zoom levels.

## Recent Changes (Latest Session)

### Tree-sitter Symbol Extractor Implementation

1. **Installed dependencies**:
   - `tree-sitter` - Native Node.js parser library
   - `tree-sitter-typescript` - TypeScript/TSX grammar

2. **Created new main process files**:
   - `src/main/types.ts` - Type definitions for extracted symbols
   - `src/main/fileWalker.ts` - Recursive directory traversal for TS/TSX files
   - `src/main/symbolExtractor.ts` - Tree-sitter parsing and symbol extraction

3. **Updated main process** (`src/main/index.ts`):
   - Added CLI argument parsing for project path
   - Added IPC handlers:
     - `project:getPath` - Get current project path
     - `project:setPath` - Set project path
     - `project:scan` - Scan current project for symbols
     - `project:scanDir` - Scan arbitrary directory for symbols

4. **Updated preload bridge** (`src/preload/index.ts` & `index.d.ts`):
   - Exposed API methods to renderer:
     - `window.api.getProjectPath()`
     - `window.api.setProjectPath(path)`
     - `window.api.scanProject(options?)`
     - `window.api.scanDirectory(path, options?)`

5. **Created test project** (`test-project/`):
   - Sample TypeScript project with 6 files
   - Includes: functions, classes, interfaces, types, enums, constants, arrow functions
   - Tests both `.ts` and `.tsx` file parsing

## Symbol Types Extracted

| Symbol Kind | Tree-sitter Node Types                                   | Example                                  |
| ----------- | -------------------------------------------------------- | ---------------------------------------- |
| `function`  | `function_declaration`, arrow function in variable       | `function foo()`, `const foo = () => {}` |
| `class`     | `class_declaration`                                      | `class Foo {}`                           |
| `interface` | `interface_declaration`                                  | `interface IFoo {}`                      |
| `type`      | `type_alias_declaration`                                 | `type Foo = {}`                          |
| `enum`      | `enum_declaration`                                       | `enum Foo {}`                            |
| `constant`  | `lexical_declaration` with `const`                       | `const FOO = 'bar'`                      |
| `variable`  | `lexical_declaration` with `let`, `variable_declaration` | `let x = 1`                              |

## Testing Instructions

1. Start the development server:

   ```bash
   npm run dev
   ```

2. Open DevTools in the Electron window (F12)

3. In the console, test symbol extraction:

   ```javascript
   // Scan the test project
   const result = await window.api.scanDirectory('c:/Users/ts/projects/graph-editor/test-project')
   console.log(result)

   // Or set project path and scan
   await window.api.setProjectPath('c:/Users/ts/projects/graph-editor/test-project')
   const result = await window.api.scanProject()
   console.log(result)
   ```

## Next Steps

1. **Connect to GraphStore**: Transform extracted symbols into React Flow nodes for Construct/Symbol levels
2. **File watching**: Implement file system watching for incremental updates
3. **Symbol relationships**: Extract import/export relationships for edges
4. **Performance**: Consider caching parsed ASTs for large projects

## Active Decisions

- **Top-level only**: Currently extracting only module-level symbols, not nested functions or class methods
- **TSX support**: Using separate parser for `.tsx` files
- **Error handling**: Files that fail to parse are logged but don't stop extraction

## Important Patterns

### IPC Communication

```typescript
// Main process handler
ipcMain.handle('project:scan', async (_, options) => {
  return extractProjectSymbols(projectPath, options)
})

// Renderer usage
const result = await window.api.scanProject()
```

### Symbol Data Structure

```typescript
interface ExtractedSymbol {
  id: string // "filepath:symbolname"
  name: string // Symbol name
  kind: SymbolKind // 'function' | 'class' | etc.
  filePath: string // Relative path from project root
  startLine: number // 1-indexed line number
  endLine: number
  exported: boolean // Is symbol exported?
}
```
