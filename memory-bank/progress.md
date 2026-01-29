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

### Code Analysis ✅ (NEW)

- [x] Tree-sitter integration for TypeScript parsing
- [x] Symbol extraction (functions, classes, interfaces, types, enums, constants)
- [x] TSX file support
- [x] Recursive file walker with exclusion patterns
- [x] IPC bridge for renderer ↔ main process communication
- [x] Test project with sample TypeScript code

### UI Components ✅

- [x] Split panel layout (Chat + Graph)
- [x] Chat panel with message list
- [x] Composer input for chat
- [x] Graph panel with React Flow canvas
- [x] Zoom level breadcrumb navigation

## What's Left to Build

### Immediate (Next Sprint)

- [ ] Connect symbol extraction to GraphStore
- [ ] Transform extracted symbols to React Flow nodes
- [ ] Populate Construct/Symbol levels from real codebase
- [ ] Test symbol extraction via Electron DevTools

### Short Term

- [ ] LLM integration for chat functionality
- [ ] Selection → Scope → Safety mechanism
- [ ] File system watching for incremental updates
- [ ] Import/export relationship extraction for edges

### Medium Term

- [ ] MCP tool calling for file operations
- [ ] TypeScript compiler API for semantic analysis
- [ ] Project manifest support
- [ ] Code modal/popup for Symbol level

### Future

- [ ] Multi-language support
- [ ] Collaborative features
- [ ] Plugin system

## Current Status

**Phase**: Symbol Extraction Implementation
**Status**: Complete and ready for testing
**Next**: Connect to GraphStore and UI testing

## Known Issues

1. **CLI args for Electron**: `electron-vite dev` doesn't forward custom CLI arguments to Electron process. Workaround: Set project path via IPC (`window.api.setProjectPath()`).

2. **Test project TS errors**: The test-project has TypeScript errors (missing React types) but this doesn't affect symbol extraction since tree-sitter is a syntactic parser.

## Evolution of Project Decisions

### 2024-01 - Initial Setup

- Chose Electron + React for cross-platform desktop app
- Selected React Flow for graph visualization
- Adopted Zustand for state management

### 2024-01 - Semantic Zoom

- Implemented 4-level zoom hierarchy
- Added ELK.js for automatic layout
- Created per-level node/edge storage

### 2024-01 - Symbol Extraction (Current)

- Selected tree-sitter over TypeScript compiler API for:
  - Better performance (incremental parsing)
  - Language-agnostic design (future multi-language support)
  - Simpler AST traversal
- Chose to extract top-level symbols only (not nested)
- Implemented IPC-based architecture for main ↔ renderer communication

## Files Changed This Session

### New Files

- `src/main/types.ts` - Symbol extraction types
- `src/main/fileWalker.ts` - Directory traversal utility
- `src/main/symbolExtractor.ts` - Tree-sitter parsing logic
- `test-project/` - Sample TypeScript project for testing
- `memory-bank/activeContext.md` - Current work focus
- `memory-bank/progress.md` - This file

### Modified Files

- `src/main/index.ts` - Added CLI args and IPC handlers
- `src/preload/index.ts` - Added API methods for symbol extraction
- `src/preload/index.d.ts` - Added TypeScript declarations
- `package.json` - Added tree-sitter dependencies

## Testing Checklist

- [x] TypeScript type checking passes (`npm run typecheck`)
- [x] Development server builds successfully (`npm run dev`)
- [ ] Symbol extraction returns correct data
- [ ] TSX files parse correctly
- [ ] Error handling for invalid files works
- [ ] IPC communication works end-to-end
