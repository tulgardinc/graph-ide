# Active Context

## Current Focus

### Symbol Metadata Extraction (Just Completed)

Added metadata to each symbol node:

- **description** - JSDoc description (markdown string)
- **parameters** - Array of `{name, typeId?, typeText?}` for functions
- **returnTypeId** - Symbol ID of return type (if referencing project symbol)
- **returnTypeText** - Raw return type text for display

Type IDs link to other symbols in the graph (e.g., `types.ts:User`), enabling navigation between functions and their parameter/return types.

### Test File Restructuring

Split monolithic test file (~950 lines) into focused files under 500 lines each:

- `test-utils.ts` - Shared test helpers
- `symbolExtractor.ancestors.test.ts` - findContainingFunctionByAncestors + Performance tests
- `symbolExtractor.integration.test.ts` - extractProjectSymbols integration tests
- `symbolExtractor.dependencies.test.ts` - Global/Class/Enum dependency tests
- `symbolExtractor.metadata.test.ts` - New metadata extraction tests

**Total: 63 tests passing**

## Previous Focus

Selection-based dimming with transitive dependency chain highlighting.

## Recent Changes

### Metadata Extraction (New)

1. **ExtractedSymbol interface extended** (`src/main/types.ts`):

   ```typescript
   interface ExtractedSymbol {
     // ... existing fields ...
     description?: string // JSDoc description
     returnTypeId?: string // Symbol ID reference
     returnTypeText?: string // Raw type text
     parameters?: ParameterInfo[] // Function parameters
   }

   interface ParameterInfo {
     name: string
     typeId?: string // Symbol ID if project type
     typeText?: string // Raw type text
   }
   ```

2. **Symbol extraction enhanced** (`src/main/symbolExtractor.ts`):
   - Extracts JSDoc via `node.getJsDocs()`
   - Extracts function parameters via `func.getParameters()`
   - Extracts return types via `func.getReturnTypeNode()`
   - Resolves project type references to symbol IDs

3. **Cross-file type resolution**:
   - Parameter types like `data: User` resolve to `types.ts:User`
   - Return types like `: User` resolve to symbol IDs
   - Non-project types (primitives, externals) have `typeText` only

### Selection-Based Dimming (Completed Earlier)

- Nodes/edges not in dependency chain dim to 20% opacity
- Selected nodes get cyan glow
- Full transitive dependency chain highlighted

## Architecture

### Metadata Extraction Flow

```
extractSymbolsFromSourceFile()
  ├── extractJsDocDescription(node)  // Get JSDoc comment
  ├── extractFunctionParameters(params, projectRoot)  // Params with type IDs
  └── extractReturnType(returnTypeNode, projectRoot)  // Return type + ID
```

### Type Resolution

```
resolveTypeToSymbolId(typeNode, projectRoot)
  ├── Check if TypeReference
  ├── Get symbol from type name
  ├── Follow aliased symbols (imports)
  └── Return "filePath:typeName" if project file
```

## Key Files

- `src/main/types.ts` - ExtractedSymbol, ParameterInfo interfaces
- `src/main/symbolExtractor.ts` - Symbol extraction + metadata helpers
- `src/preload/index.d.ts` - Re-exports ParameterInfo type
- `src/main/*.test.ts` - 4 test files with 63 tests total

## Testing

```bash
npm test -- --run  # 63 tests passing
```

Test files:

- `symbolExtractor.ancestors.test.ts` - 19 tests
- `symbolExtractor.integration.test.ts` - 6 tests
- `symbolExtractor.dependencies.test.ts` - 19 tests
- `symbolExtractor.metadata.test.ts` - 19 tests

## Next Steps

- Display metadata in UI when node is selected (info panel)
- Add type dependency edges (function → parameter types)
- Consider extracting class methods as individual symbols
