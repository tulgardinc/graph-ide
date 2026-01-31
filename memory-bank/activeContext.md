# Active Context

## Latest Implementation: Semantic Layer Naming Refactor (January 31, 2026)

### Completed Refactor

Standardized semantic layer naming convention across the entire codebase:

**Correct Semantic Layer Hierarchy:**

- `system` (Layer 1) - High-level architectural boundaries
- `domain` (Layer 2) - Business/logical domains within a system
- `module` (Layer 3) - Logical code groupings within a domain
- `symbol` (Layer 4) - Individual code symbols (functions, classes, etc.)

**Changes Made:**

- **ZoomLevel type**: `'layer'` → `'domain'`, `'construct'` → `'module'`
- **ZOOM_LEVEL_LABELS**: `Layer` → `Domain`, `Construct` → `Module`
- **Functions renamed**: `resolveSymbolConstruct()` → `resolveSymbolModule()`
- **Handlers renamed**: `handleNavigateToConstruct()` → `handleNavigateToModule()`
- **Props renamed**: `constructInfo` → `moduleInfo`, `onNavigateToConstruct` → `onNavigateToModule`
- **All code comments and prompts updated to use correct terminology**

---

## Previous Implementation: LLM-Generated Descriptions for Semantic Nodes (January 31, 2026)

### Completed Features

1. **Description Generator** (`src/main/descriptionGenerator.ts`)
   - Queue-based generation with priority levels (0=on-demand, 1=system, 2=domain)
   - Memory + disk caching at `.graph-ide/llm-outputs/{node-id}.md`
   - Uses LLM with tool calling to explore codebase before writing descriptions
   - Event-driven progress updates via IPC

2. **Eager Generation**
   - Systems and domains auto-generate after semantic analysis completes
   - Background processing with 500ms delay between requests to avoid rate limiting

3. **Lazy Generation**
   - Module descriptions generated on-demand when user opens detail panel
   - Higher priority (0) than eager generation

4. **SemanticNodeDetailPanel** (`src/renderer/src/components/graph/SemanticNodeDetailPanel.tsx`)
   - Shows loading spinner while descriptions generate
   - Markdown rendering with react-markdown
   - Parent/children navigation badges
   - Refresh button to regenerate descriptions

5. **API Surface**
   - `descriptionStartEager()` - Start background generation for systems/domains
   - `descriptionRequest(nodeId)` - Get or generate description
   - `descriptionGetCached(nodeId)` - Check cache without triggering generation
   - `descriptionIsGenerating(nodeId)` - Check if generation in progress
   - `descriptionQueueStatus()` - Get queue status
   - Events: `onDescriptionLoading`, `onDescriptionComplete`, `onDescriptionError`, `onDescriptionProgress`

---

## Visual Hierarchy System (January 31, 2026)

Implemented a dynamic color system for visual hierarchy between zoom levels, with parent-child border color inheritance and symbol-to-module mapping.

**Color Hierarchy Model:**

| Layer  | Background                                     | Border                                            |
| ------ | ---------------------------------------------- | ------------------------------------------------- |
| System | Unique HSL per node                            | Slate (#475569)                                   |
| Domain | Unique HSL per node                            | Parent System's background                        |
| Module | Unique HSL per node                            | Parent Domain's background                        |
| Symbol | Kind-based (function=teal, class=purple, etc.) | Parent Module's background (or unclassified gray) |

**Symbol-to-Module Mapping System:**

Uses an inheritance model with three levels of specificity:

1. **Directory-level** (most common): `"src/api/*"` (direct) or `"src/api/**"` (recursive)
2. **File-level** (override): Specific files override their directory's assignment
3. **Symbol-level** (exception): Specific symbols override their file's assignment

Resolution priority: Symbol > File > Directory (most specific wins)

**Files Created:**

1. **`src/renderer/src/lib/colorUtils.ts`** - Deterministic color generation
   - `generateNodeColors(nodeId)` - Hash-based HSL color from node ID
   - `buildColorMap(systems, domains, modules)` - Builds color map with parent inheritance
   - `getSymbolBorderColor(moduleId, colorMap)` - Gets border color for symbols
   - `UNCLASSIFIED_BORDER_COLOR` - Gray border for unmapped symbols

**Files Modified:**

1. **`src/main/types.ts`** - Added new types:
   - `parentId?: string` on `SemanticNode` - For border color inheritance
   - `ModuleMapping` interface - `{ directories?, files?, symbols? }`
   - `ModuleNode.mappings?: ModuleMapping` - New mapping system

2. **`src/preload/index.d.ts`** - Re-exported `ModuleMapping` type

3. **`src/renderer/src/store/graphStore.ts`**:
   - Added `colorMap: ColorMap` to store state
   - Updated `createSemanticNode()` to use dynamic colors
   - Updated `loadSemanticAnalysis()` to build color map
   - Updated `loadSymbols()` to pass modules/colorMap to symbolsToNodes

4. **`src/renderer/src/store/symbolHelpers.ts`**:
   - Added `resolveSymbolModule(symbolId, modules)` - Inheritance-based resolution
   - Added `getSymbolStyleWithModuleBorder()` - Module-aware styling
   - Updated `symbolsToNodes()` to accept modules/colorMap for border coloring
   - Added `matchesDirectoryPattern()` - Glob pattern matching (\* and \*\*)
   - Added `getPatternSpecificity()` - Most specific directory wins

5. **`src/main/semanticAnalyzer.ts`** - Updated LLM system prompt:
   - Added "Module Mapping Strategy" section with inheritance rules
   - Added `parentId` to domain/module output schema
   - Added `mappings` object to module output schema
   - Documented `*` vs `**` glob patterns

---

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
2. **`src/main/cacheManager.ts`** - Cache management for `.graph-ide/` directory
3. **`src/main/semanticAnalyzer.ts`** - LLM-based semantic analysis

## Architecture

### Color System Flow

```
loadSemanticAnalysis()
  ├── Get analysis from LLM/cache
  ├── buildColorMap(systems, domains, modules)
  │     ├── Systems: unique HSL + slate border
  │     ├── Domains: unique HSL + parent system's BG as border
  │     └── Modules: unique HSL + parent domain's BG as border
  ├── createSemanticNode() with colors
  └── Store colorMap in state

loadSymbols()
  ├── Get symbols from extractor
  ├── symbolsToNodes(symbols, modules, colorMap)
  │     └── For each symbol:
  │           ├── resolveSymbolModule(symbolId, modules)
  │           │     ├── Check symbol mappings (highest priority)
  │           │     ├── Check file mappings
  │           │     └── Check directory mappings (most specific wins)
  │           └── getSymbolBorderColor(moduleId, colorMap)
  └── Layout and store
```

### Mapping Resolution Example

```typescript
// Module definition
{
  id: "module:validation",
  mappings: {
    directories: ["src/utils/**"],
    files: [],
    symbols: []
  }
}

{
  id: "module:http-client",
  mappings: {
    directories: ["src/api/**"],
    files: [],
    symbols: ["src/utils/validators.ts:formatApiUrl"]  // Override
  }
}

// Resolution for "src/utils/validators.ts:validateEmail"
// → Matches "src/utils/**" → module:validation

// Resolution for "src/utils/validators.ts:formatApiUrl"
// → Explicit symbol mapping → module:http-client (overrides directory)
```

### Key Files

**Visual Hierarchy:**

- `src/renderer/src/lib/colorUtils.ts` - Color generation and mapping
- `src/renderer/src/store/graphStore.ts` - Node creation with colors
- `src/renderer/src/store/symbolHelpers.ts` - Symbol-to-module resolution

**Semantic System:**

- `src/main/semanticAnalyzer.ts` - LLM analysis with mapping prompt
- `src/main/cacheManager.ts` - `.graph-ide/` cache management
- `src/main/types.ts` - SemanticNode, ModuleMapping types

## Testing

```bash
npm run typecheck  # Passes
npm run build      # Builds successfully
npm run dev        # Start development server
```

## Next Steps

- Test with actual semantic analysis to verify color generation
- Delete cached `.graph-ide/` to force re-analysis with new prompt
- Add UI indicator showing which module a symbol belongs to
- Consider adding legend/key for module colors
