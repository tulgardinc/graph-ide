# Progress

## What Works

### Selection-Based Dimming ✅ NEW

- Node selection dims unrelated nodes/edges (20% opacity)
- Selected nodes get cyan glow highlight (boxShadow)
- Direct predecessors and successors stay visible
- Multi-select shows union of all connected nodes
- Edge dimming for edges not connecting highlighted nodes

### Core Infrastructure

- ✅ Electron + Vite + React + TypeScript setup
- ✅ React Flow graph visualization
- ✅ ELK.js automatic layout engine
- ✅ Zustand state management
- ✅ Four zoom levels: System → Layer → Construct → Symbol

### Symbol Extraction (ts-morph)

- ✅ TypeScript/TSX file scanning
- ✅ Symbol extraction: functions, classes, interfaces, types, enums, constants, variables, objects
- ✅ Export detection
- ✅ Position tracking (line, column)

### Call Graph

- ✅ Function call detection
- ✅ Cross-file import resolution (follows aliases)
- ✅ JSX component usage detection (`<Component />`)
- ✅ O(n) algorithm using `getAncestors()`
- ✅ Edge type differentiation (call vs component-use)
- ✅ Invalid edge filtering (references to non-existent nodes)

### Visualization

- ✅ Color-coded nodes by symbol kind
- ✅ Call edges: Cyan (#22d3ee)
- ✅ Component edges: Pink (#f472b6)
- ✅ ELK layout for symbol level

### Testing

- ✅ Vitest integration
- ✅ 25 unit tests passing
- ✅ Test project with cross-file calls

## What's Left to Build

### Symbol Level

- [ ] Extract class methods as individual symbols
- [ ] Hook usage detection (useState, useEffect, etc.)
- [ ] Type dependency edges

### UI Features

- [ ] Node click navigation to source code
- [ ] Search/filter symbols
- [ ] Zoom level transitions

### Performance

- [ ] Incremental updates
- [ ] Large codebase optimization

## Known Issues

- Class method calls reference `ClassName.methodName` but only `ClassName` is extracted as a symbol
  - Workaround: Invalid edges are filtered out

## Tech Debt

- Debug logging can be removed from graphStore and elkLayout
- Test files (test-extractor.ts, test-extractor.mjs) can be cleaned up
