# Active Context

## Current Focus

### Selection-Based Dimming (Just Completed)

Implemented node selection dimming with predecessor/successor highlighting:

- When nodes are selected, all unrelated nodes/edges are dimmed (20% opacity)
- Selected nodes get a cyan glow highlight
- Direct predecessors (nodes that point TO selected) stay visible
- Direct successors (nodes selected point TO) stay visible
- Works with multi-select (union of all connected nodes)
- Implemented via Zustand selectors that compute styles dynamically

## Previous Focus

Call graph visualization with function calls and JSX component usage detection.

## Recent Changes

### ts-morph Migration & Call Graph (Completed)

1. **Replaced tree-sitter with ts-morph** - Full TypeScript type resolution for imports
2. **O(n) call graph algorithm** - Uses `getAncestors()` for efficient caller detection
3. **Cross-file call detection** - Follows import aliases to resolve original definitions
4. **JSX component detection** - Detects `<Component />` usage in JSX
5. **Edge type differentiation**:
   - Function calls: Cyan (#22d3ee), 1.5px solid
   - Component uses: Pink (#f472b6), 2px solid

### Fixes Applied

- Edge filtering: Removes invalid edges referencing non-existent nodes (class methods)
- ELK layout: Runs before store update to avoid timing issues

## Architecture

### Symbol Extraction Flow

```
scanProject() → extractProjectSymbols()
  ├── walkDirectory() → find TS/TSX files
  ├── createProject() → ts-morph Project
  ├── extractSymbolsFromSourceFile() → symbols per file
  └── extractCallEdges() → function calls + JSX component uses
```

### Edge Types

```typescript
type EdgeType = 'call' | 'component-use'
```

## Key Files

- `src/main/symbolExtractor.ts` - ts-morph symbol extraction + call graph
- `src/main/types.ts` - Type definitions including EdgeType
- `src/renderer/src/store/graphStore.ts` - Graph state + edge styling
- `src/main/symbolExtractor.test.ts` - 25 unit tests

## Testing

```bash
npm run test:run  # 25 tests passing
npx tsx test-extractor.ts  # Manual extraction test
```

## Next Steps

- Consider extracting class methods as individual symbols
- Add hook usage detection
- Improve ELK layout for large graphs
