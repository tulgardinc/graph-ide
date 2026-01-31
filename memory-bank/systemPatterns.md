# System Patterns

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                    │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  fileWalker.ts  │  │symbolExtractor.ts│                   │
│  │  (find files)   │  │  (ts-morph AST)  │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
                              │ IPC
┌─────────────────────────────────────────────────────────────┐
│                    Electron Renderer Process                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  graphStore.ts  │  │  elkLayout.ts   │  │ GraphPanel  │ │
│  │   (Zustand)     │  │  (ELK.js)       │  │(React Flow) │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Symbol Extraction (ts-morph)

### Why ts-morph over tree-sitter

- Full TypeScript type checking
- Import resolution (follows aliases)
- Cross-file symbol resolution
- Type-aware analysis

### Extraction Flow

```typescript
extractProjectSymbols(projectRoot)
  → walkDirectory()           // Find .ts/.tsx files
  → createProject()           // ts-morph Project
  → addSourceFileAtPath()     // Load all files for import resolution
  → extractSymbolsFromSourceFile()  // Per-file symbol extraction
  → extractCallEdges()        // Call graph generation
```

### Symbol Types

```typescript
type SymbolKind =
  | 'function' // function declarations + arrow functions
  | 'class' // class declarations
  | 'interface' // interface declarations
  | 'type' // type aliases
  | 'enum' // enum declarations
  | 'constant' // const declarations
  | 'variable' // let/var declarations
  | 'object' // object literal constants
```

## Call Graph Algorithm

### O(n) Complexity with getAncestors()

```typescript
function extractCallEdges(project, symbolMap, projectRoot) {
  for (sourceFile of project.getSourceFiles()) {
    // Find all call expressions - O(n)
    callExpressions = sourceFile.getDescendantsOfKind(CallExpression)

    for (callExpr of callExpressions) {
      // Find caller using getAncestors() - O(depth)
      caller = findContainingFunctionByAncestors(callExpr)

      // Resolve callee through imports
      symbol = expression.getSymbol()
      aliasedSymbol = symbol.getAliasedSymbol() // Follow imports

      // Create edge if both exist in symbolMap
      edges.push({ source: caller.id, target: callee.id, type: 'call' })
    }

    // JSX component detection
    jsxElements = [
      ...getDescendantsOfKind(JsxOpeningElement),
      ...getDescendantsOfKind(JsxSelfClosingElement)
    ]

    for (jsx of jsxElements) {
      // Skip HTML elements (lowercase)
      if (tagName[0] === tagName[0].toLowerCase()) continue

      edges.push({ source: caller.id, target: component.id, type: 'component-use' })
    }
  }
}
```

### Edge Types

```typescript
type EdgeType = 'call' | 'component-use'

interface CallEdge {
  id: string
  source: string // Caller symbol ID
  target: string // Callee symbol ID
  type: EdgeType
  callSite: { file: string; line: number }
}
```

## Graph Store Pattern (Zustand)

### Multi-Level Graph State

```typescript
interface GraphState {
  zoomLevel: 'system' | 'domain' | 'module' | 'symbol'
  nodesByLevel: Record<ZoomLevel, Node[]>
  edgesByLevel: Record<ZoomLevel, Edge[]>
  layoutedLevels: Set<ZoomLevel> // Track which levels have layout
}
```

### Lazy Symbol Loading

```typescript
setZoomLevel: (level) => {
  set({ zoomLevel: level })
  if (level === 'symbol') {
    get().loadSymbols() // Trigger symbol extraction
  }
}
```

### Edge Validation

```typescript
// Filter out edges referencing non-existent nodes
const validCallEdges = callEdges.filter(
  (edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
)
```

## ELK Layout Integration

### Layout Options by Zoom Level

```typescript
const LAYOUT_OPTIONS: Record<ZoomLevel, ElkLayoutOptions> = {
  system: { direction: 'RIGHT', nodeSpacing: 80, layerSpacing: 120 },
  domain: { direction: 'DOWN', nodeSpacing: 40, layerSpacing: 80 },
  module: { direction: 'DOWN', nodeSpacing: 50, layerSpacing: 100 },
  symbol: { direction: 'DOWN', nodeSpacing: 20, layerSpacing: 40 }
}
```

### Layout Before Store Update

```typescript
// Compute layout BEFORE updating store
const layoutResult = await getLayoutedElements(nodes, edges, options)
set({ nodesByLevel: { ...state, symbol: layoutResult.nodes } })
```

## Visual Styling

### Node Colors by Symbol Kind

| Kind      | Background | Border Color |
| --------- | ---------- | ------------ |
| function  | #0f172a    | #14b8a6      |
| class     | #1e1b4b    | #8b5cf6      |
| interface | #172554    | #3b82f6      |
| type      | #1e1b4b    | #8b5cf6      |
| enum      | #422006    | #d97706      |
| constant  | #14532d    | #10b981      |
| variable  | #1c1917    | #525252      |
| object    | #1e293b    | #475569      |

### Edge Styling

| Type          | Color   | Width |
| ------------- | ------- | ----- |
| call          | #22d3ee | 1.5px |
| component-use | #f472b6 | 2px   |
