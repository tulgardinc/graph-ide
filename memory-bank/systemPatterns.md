# Map IDE — System Patterns

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Electron Main Process                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  File System    │  │  Project Store  │  │  MCP Server (future)    │  │
│  │  Operations     │  │  (workspace)    │  │  (tool calling)         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ IPC Bridge (preload)
┌───────────────────────────────▼─────────────────────────────────────────┐
│                          Electron Renderer Process                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         React Application                         │   │
│  │  ┌────────────────────────┐  ┌────────────────────────────────┐  │   │
│  │  │      Graph Panel       │  │         Chat Panel             │  │   │
│  │  │  ┌──────────────────┐  │  │  ┌──────────────────────────┐  │  │   │
│  │  │  │   React Flow     │  │  │  │   Message List           │  │   │
│  │  │  │   (canvas)       │  │  │  │   (scrollable)           │  │   │
│  │  │  └──────────────────┘  │  │  └──────────────────────────┘  │  │   │
│  │  │  ┌──────────────────┐  │  │  ┌──────────────────────────┐  │  │   │
│  │  │  │   Zoom Controls  │  │  │  │   Input + Send           │  │   │
│  │  │  │   (breadcrumb)   │  │  │  │   (composer)             │  │   │
│  │  │  └──────────────────┘  │  │  └──────────────────────────┘  │  │   │
│  │  └────────────────────────┘  └────────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────────────────┐  │   │
│  │  │                    Shared State (Zustand)                  │  │   │
│  │  │  - Graph data (nodes, edges, zoom level)                   │  │   │
│  │  │  - Selection state (scoped nodes)                          │  │   │
│  │  │  - Chat state (messages, streaming)                        │  │   │
│  │  │  - Project state (manifest, file tree)                     │  │   │
│  │  └────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Technical Decisions

### 1. Electron + Vite + React

**Decision**: Use Electron with Vite for fast development and React for UI.

**Rationale**:

- Electron provides file system access and native capabilities
- Vite offers fast HMR and modern build tooling
- React + TypeScript for type-safe, component-based UI

### 2. React Flow for Graph Visualization

**Decision**: Use React Flow as the graph rendering library.

**Rationale**:

- Built for React, great DX
- Handles pan/zoom, selection, edges natively
- Customizable nodes and edges
- Active maintenance and community

**Pattern**: Semantic zoom via canvas repopulation

```typescript
// Instead of actual zoom, we switch what nodes/edges are displayed
type ZoomLevel = 'system' | 'layer' | 'construct' | 'symbol' | 'code'

// When user "zooms in" to a node:
// 1. Store current level in navigation stack
// 2. Query graph data for the next level down
// 3. Replace nodes/edges on the canvas
// 4. Update breadcrumb navigation
```

### 3. Zustand for State Management

**Decision**: Use Zustand for global state.

**Rationale**:

- Minimal boilerplate
- Works well with React Flow
- Easy to persist/hydrate
- Good TypeScript support

**Store Structure**:

```typescript
interface MapIDEStore {
  // Graph state
  zoomLevel: ZoomLevel
  currentScope: string[] // IDs of ancestor nodes
  nodes: Node[]
  edges: Edge[]
  selectedNodeIds: Set<string>

  // Chat state
  messages: ChatMessage[]
  isStreaming: boolean

  // Project state
  projectPath: string | null
  manifest: ProjectManifest | null

  // Actions
  zoomInto: (nodeId: string) => void
  zoomOut: () => void
  selectNodes: (nodeIds: string[]) => void
  sendMessage: (content: string) => void
}
```

### 4. Tree-sitter WASM for Symbol Extraction

**Decision**: Use tree-sitter compiled to WebAssembly for parsing TypeScript.

**Rationale**:

- Fast incremental parsing
- Works in browser/Electron renderer
- Language-agnostic architecture (future expansion)
- Concrete syntax tree access

**Future Enhancement**: TypeScript compiler API via ts-morph for:

- Type resolution
- Import graph with full module resolution
- Semantic analysis beyond syntax

### 5. TypeScript Config Files for Manifest

**Decision**: Use `.ts` files for project manifest configuration.

**Rationale**:

- Type-safe configuration
- IDE autocompletion
- Can include computed values
- Familiar to TypeScript developers

**Example**:

```typescript
// map-ide.config.ts
import { defineConfig } from 'map-ide'

export default defineConfig({
  systems: [
    {
      name: 'web',
      root: './packages/web',
      layers: ['ui', 'state', 'domain', 'shared']
    },
    {
      name: 'server',
      root: './packages/server',
      layers: ['handlers', 'domain', 'data', 'shared']
    }
  ],
  constraints: {
    ui: ['state', 'shared'],
    state: ['domain', 'shared'],
    domain: ['shared'],
    handlers: ['domain', 'data', 'shared'],
    data: ['shared']
  }
})
```

### 6. LLM Integration via API

**Decision**: Direct API calls to LLM providers (initially configurable).

**Rationale**:

- Simpler than running local models
- Can switch providers easily
- Streaming support for responsiveness

**Pattern**:

```typescript
interface LLMProvider {
  chat(params: {
    messages: Message[]
    context: ScopedContext // derived from selected nodes
    stream: boolean
  }): AsyncIterable<string> | Promise<string>
}
```

### 7. MCP for Tool Calling (Future)

**Decision**: Use Model Context Protocol for file operations.

**Rationale**:

- Standard protocol for LLM tool use
- Can expose file read/write/create as tools
- Enables agent-style workflows
- Scope constraints map naturally to tool permissions

## Component Patterns

### Graph Node Components

```typescript
// Custom node types per zoom level
const nodeTypes = {
  system: SystemNode, // Large card with icon
  layer: LayerNode, // Colored band
  construct: ConstructNode, // Medium card
  symbol: SymbolNode, // Compact item
  code: CodeNode // Syntax-highlighted block
}
```

### Selection → Scope → Context

```typescript
// Selection drives everything
function useSelectionContext() {
  const selectedIds = useStore((s) => s.selectedNodeIds)
  const nodes = useStore((s) => s.nodes)

  // Derive what the LLM can see
  const scopedContext = useMemo(() => {
    const selected = nodes.filter((n) => selectedIds.has(n.id))
    return buildContextFromNodes(selected)
  }, [selectedIds, nodes])

  return scopedContext
}
```

### Chat Message Threading

```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  // Evidence linking
  references?: {
    nodeIds: string[]
    files?: { path: string; lines?: [number, number] }[]
  }
  // For invalidation
  contextFingerprint?: string
}
```

## File Organization

```
src/
├── main/                    # Electron main process
│   ├── index.ts
│   ├── ipc/                 # IPC handlers
│   └── services/            # File system, project loading
├── preload/                 # Preload scripts (IPC bridge)
├── renderer/
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── components/
│       │   ├── graph/       # React Flow components
│       │   │   ├── GraphPanel.tsx
│       │   │   ├── nodes/   # Custom node types
│       │   │   └── edges/   # Custom edge types
│       │   ├── chat/        # Chat UI components
│       │   │   ├── ChatPanel.tsx
│       │   │   ├── MessageList.tsx
│       │   │   └── Composer.tsx
│       │   └── ui/          # shadcn/ui components
│       ├── store/           # Zustand stores
│       │   ├── index.ts
│       │   ├── graphSlice.ts
│       │   └── chatSlice.ts
│       ├── lib/             # Utilities
│       │   ├── llm/         # LLM client
│       │   └── parser/      # Tree-sitter integration
│       └── types/           # TypeScript types
```

## Data Flow

```
User Action                    State Change                  UI Update
─────────────────────────────────────────────────────────────────────────
Click node          →  selectedNodeIds.add(id)      →  Node highlights
                                                       Chat context updates

Double-click node   →  zoomInto(nodeId)             →  Canvas repopulates
                       currentScope.push(nodeId)       Breadcrumb updates
                       nodes = fetchChildNodes()

Send message        →  messages.push(userMsg)       →  Message appears
                       isStreaming = true              Streaming indicator
                       ...LLM response streams...      Assistant message grows
                       isStreaming = false             Complete
```
