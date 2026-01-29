# Map IDE — Progress

## What Works

### Core Infrastructure ✅

- [x] Electron + electron-vite setup with HMR
- [x] React 19 with TypeScript
- [x] Tailwind CSS v4 properly configured
- [x] shadcn/ui components (Button, Card, Input, ScrollArea)
- [x] Zustand state management

### Graph Visualization ✅

- [x] React Flow (@xyflow/react) integration
- [x] 4 semantic zoom levels (System → Layer → Construct → Symbol)
- [x] Per-level nodes and edges in Zustand store
- [x] ELK.js auto-layout when switching zoom levels
- [x] Zoom level indicator UI (breadcrumb navigation)
- [x] Demo data model (Frontend → Backend → Database)
- [x] Human-readable labels at Construct level

### Code Analysis ✅

- [x] **ts-morph integration** for TypeScript semantic analysis (migrated from tree-sitter)
- [x] Symbol extraction (functions, classes, interfaces, types, enums, constants)
- [x] **Call graph generation** - detects which functions call which
- [x] TSX file support
- [x] Recursive file walker with exclusion patterns
- [x] IPC bridge for renderer ↔ main process communication
- [x] Test project with sample TypeScript code
- [x] GraphStore integration - symbols displayed as nodes, calls as edges

### UI Components ✅

- [x] Split panel layout (Chat + Graph)
- [x] Chat panel with message list
- [x] Composer input for chat
- [x] Graph panel with React Flow canvas
- [x] Zoom level breadcrumb navigation

## Recently Completed

- **Call Graph Optimization**: Refactored `findContainingFunction` to use `getAncestors()` for O(n) complexity
  - New function: `findContainingFunctionByAncestors()` - walks up AST instead of iterating all functions
  - Performance: 100 functions processed in <100ms
- **Unit Tests**: Added comprehensive Vitest test suite with 24 tests covering:
  - Function declarations, arrow functions, function expressions
  - Class methods (including static and exported)
  - Edge cases (nested functions, callbacks, IIFEs, top-level calls)
  - Integration tests for `extractProjectSymbols`
  - Performance verification tests

## What's Left to Build

### Immediate (Next Sprint)

- [ ] Expand call graph detection (method calls on class instances)
- [ ] Import/export relationship extraction for edges
- [ ] File system watching for incremental updates
- [ ] Performance optimization for large projects

### Short Term

- [ ] LLM integration for chat functionality
- [ ] Selection → Scope → Safety mechanism
- [ ] Code modal/popup for Symbol level

### Medium Term

- [ ] MCP tool calling for file operations
- [ ] Project manifest support
- [ ] Cross-file symbol resolution improvements

### Future

- [ ] Multi-language support
- [ ] Collaborative features
- [ ] Plugin system

## Current Status

**Phase**: ts-morph Migration & Call Graph Implementation
**Status**: ✅ Complete
**Next**: Expand call graph detection, add import relationships

## Known Issues

1. **CLI args for Electron**: `electron-vite dev` doesn't forward custom CLI arguments to Electron process. Workaround: Set project path via IPC (`window.api.setProjectPath()`).

2. **Limited call detection**: Currently only detects calls to top-level functions defined in the project. Method calls on objects/classes and calls to imported functions need additional work.

3. **Test project calls**: The test-project only has 1 detected call edge because most functions call external APIs or methods on objects rather than other project-level functions.

## Evolution of Project Decisions

### 2024-01 - Initial Setup

- Chose Electron + React for cross-platform desktop app
- Selected React Flow for graph visualization
- Adopted Zustand for state management

### 2024-01 - Semantic Zoom

- Implemented 4-level zoom hierarchy
- Added ELK.js for automatic layout
- Created per-level node/edge storage

### 2024-01 - Symbol Extraction

- Initially selected tree-sitter for parsing (syntactic only)
- Implemented IPC-based architecture for main ↔ renderer communication

### 2024-01 - ts-morph Migration (Current)

- **Migrated from tree-sitter to ts-morph** for:
  - Semantic analysis capabilities (type resolution)
  - Call graph generation (resolve call targets)
  - Better TypeScript integration (uses actual TS compiler)
- Added `CallEdge` type for call relationships
- Updated GraphStore to display call edges in Symbol zoom level
- Call edges styled with cyan color (#22d3ee)

## Files Changed This Session

### Modified Files

- `package.json` - Removed tree-sitter deps, added ts-morph
- `src/main/types.ts` - Added CallEdge type, updated ProjectSymbols
- `src/main/symbolExtractor.ts` - Complete rewrite with ts-morph
- `src/renderer/src/store/graphStore.ts` - Added call edge conversion and storage
- `src/preload/index.d.ts` - Added CallEdge export
- `memory-bank/activeContext.md` - Updated documentation
- `memory-bank/progress.md` - This file

### New Files

- `test-extractor.ts` - TypeScript test script for ts-morph

### Removed Dependencies

- `tree-sitter`
- `tree-sitter-typescript`

### Added Dependencies

- `ts-morph`

## Testing Checklist

- [x] TypeScript type checking passes (`npm run typecheck`)
- [x] Development server builds successfully (`npm run build`)
- [x] Symbol extraction returns correct data (34 symbols from test-project)
- [x] Call graph extraction works (1 edge detected: getApiClient → createApiClient)
- [x] TSX files parse correctly
- [x] Error handling for invalid files works
- [x] IPC communication works end-to-end
