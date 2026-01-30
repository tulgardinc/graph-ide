# Active Context

## Current Focus

### LLM-Generated Semantic Nodes System (January 30, 2026)

Implemented a complete system for LLM-generated semantic nodes that populate layers 1-3 of the 4-layer graph visualization:

**Semantic Layer Model:**

- **Layer 1 (Top)**: System - High-level architectural components ("Frontend", "Backend API")
- **Layer 2**: Domain - Business domains ("User Management", "Authentication")
- **Layer 3**: Module - Logical code groupings ("HTTP Client", "State Management")
- **Layer 4 (Bottom)**: Symbol - Individual code symbols (already implemented via symbolExtractor.ts)

**Agentic Approach:**
Instead of feeding all symbols to the LLM (expensive and impractical), the LLM uses tools to autonomously explore the codebase and make intelligent grouping decisions.

**Files Created:**

1. **`src/main/tools/getFileSymbols.ts`** - New tool for extracting symbols from a single file
   - Uses existing `extractSymbolsFromFile()` from symbolExtractor
   - Returns compact JSON: `{ file, symbolCount, symbols: [{ name, kind, exported, line, description? }] }`

2. **`src/main/cacheManager.ts`** - Cache management for `.graph-ide/` directory
   - `initializeCache()`, `loadSemanticAnalysis()`, `saveSemanticAnalysis()`
   - `isCacheValid()` - validates by comparing file hashes
   - `invalidateCache()`, `getCacheInfo()`
   - Cache invalidates on any file change

3. **`src/main/semanticAnalyzer.ts`** - LLM-based semantic analysis
   - Uses `sendMessageWithTools()` with a specialized system prompt
   - LLM explores using: `list_files`, `get_file_symbols`, `read_file`, `search_codebase`
   - Returns JSON with systems, domains, modules, and edges
   - Validates and parses LLM output

**Files Modified:**

1. **`src/main/types.ts`** - Added semantic node types
   - `SemanticLayer`, `SemanticNode`, `SystemNode`, `DomainNode`, `ModuleNode`
   - `SemanticEdge`, `SemanticAnalysis`, `CacheManifest`

2. **`src/main/tools/index.ts`** - Registered `get_file_symbols` tool

3. **`src/main/index.ts`** - Added IPC handlers
   - `semantic:analyze`, `semantic:getCached`, `semantic:hasValid`
   - `semantic:invalidate`, `semantic:cacheInfo`

4. **`src/preload/index.ts`** - Exposed semantic APIs to renderer
   - `semanticAnalyze()`, `semanticGetCached()`, `semanticHasValid()`
   - `semanticInvalidate()`, `semanticCacheInfo()`
   - Event listeners: `onSemanticProgress`, `onSemanticToolStart`, `onSemanticToolEnd`

5. **`src/preload/index.d.ts`** - TypeScript definitions for semantic APIs

6. **`.gitignore`** - Added `.graph-ide/`

**Cache Structure:**

```
<project-root>/
└── .graph-ide/
    ├── manifest.json          # Cache metadata, file hashes for invalidation
    └── semantic-analysis.json # LLM-generated semantic nodes
```

---

### LLM Tool Calling Implementation (Previously)

Implemented tool calling (function calling) for the LLM to enable Claude to interact with the codebase.

**Tools Available:**

1. **search_codebase** - Uses ripgrep to search for text patterns
2. **read_file** - Read file contents with line range support
3. **list_files** - Get file tree structure in JSON format
4. **get_file_symbols** - Get symbols from a specific file (NEW)

**Architecture - Agentic Loop:**

```
User message → Claude (with tools) → tool_use block → Execute tool
→ Send tool_result → Claude continues → (loop until end_turn)
→ Final text response streamed to UI
```

---

### Node Detail Panel (Previously Completed)

Added a floating detail panel displaying comprehensive information about selected graph nodes with CodeMirror syntax highlighting and type navigation.

## Recent Changes

### Semantic Analysis System

1. **Type Definitions** (`src/main/types.ts`):

   ```typescript
   interface SemanticNode {
     id: string // "module:auth", "domain:user-management"
     name: string
     description: string
     layer: 'system' | 'domain' | 'module'
     children: string[]
     metadata?: { filePatterns?; keywords?; responsibility? }
   }

   interface SemanticAnalysis {
     projectPath: string
     timestamp: string
     systems: SystemNode[]
     domains: DomainNode[]
     modules: ModuleNode[]
     edges: SemanticEdge[]
   }
   ```

2. **LLM System Prompt** (`src/main/semanticAnalyzer.ts`):
   - Instructs Claude to analyze codebase using tools
   - Defines the three semantic layers
   - Specifies JSON output format
   - Guidelines for efficient exploration

3. **Cache Validation** (`src/main/cacheManager.ts`):
   - Computes MD5 hash of each TypeScript file
   - Stores hashes in manifest
   - Invalidates if any file changes

4. **IPC Events**:
   - `semantic:progress` - Analysis status updates
   - `semantic:toolStart` - Tool execution begins
   - `semantic:toolEnd` - Tool execution completes

### Tool System Extension

Added `get_file_symbols` tool:

```typescript
{
  name: 'get_file_symbols',
  description: 'Get a list of code symbols defined in a specific file...',
  input_schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: '...' }
    },
    required: ['file_path']
  }
}
```

## Architecture

### Semantic Analysis Flow

```
semanticAnalyze(forceRefresh?)
  ├── Check cache validity
  │     └── If valid: return cached analysis
  │
  ├── Run LLM analysis with tools
  │     ├── System prompt defines semantic layers
  │     ├── Initial message: "Analyze this codebase"
  │     ├── LLM uses tools to explore:
  │     │     ├── list_files (project structure)
  │     │     ├── get_file_symbols (file contents)
  │     │     ├── read_file (when needed)
  │     │     └── search_codebase (find patterns)
  │     └── LLM returns JSON with semantic nodes
  │
  ├── Parse and validate JSON
  └── Save to cache (.graph-ide/)
```

### Key Files

**Semantic System:**

- `src/main/semanticAnalyzer.ts` - LLM analysis orchestration
- `src/main/cacheManager.ts` - `.graph-ide/` cache management
- `src/main/types.ts` - Semantic node type definitions

**Tool System:**

- `src/main/tools/index.ts` - Tool definitions and executor
- `src/main/tools/getFileSymbols.ts` - Symbol extraction tool
- `src/main/tools/searchCodebase.ts` - Ripgrep search
- `src/main/tools/readFile.ts` - File reading
- `src/main/tools/listFiles.ts` - File tree listing

**IPC/Preload:**

- `src/preload/index.ts` - Semantic API exposure
- `src/preload/index.d.ts` - Type definitions

## Testing

```bash
npm run typecheck  # Passes
npm run build      # Builds successfully
npm run dev        # Start development server
```

## Next Steps

- Integrate semantic nodes with graphStore for UI rendering
- Add UI button to trigger semantic analysis
- Display analysis progress in UI
- Convert semantic nodes to React Flow nodes with styling
- Handle edge visualization between semantic nodes
- Add type dependency edges (function → parameter types)
