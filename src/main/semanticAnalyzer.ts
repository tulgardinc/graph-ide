/**
 * Semantic Analyzer
 *
 * Uses LLM with tool calling to analyze the codebase and generate
 * semantic nodes for layers 1-3 (System, Domain, Module).
 */

import { sendMessageWithTools } from './llmClient'
import { loadSemanticAnalysis, saveSemanticAnalysis, isCacheValid } from './cacheManager'
import type { SemanticAnalysis, SystemNode, DomainNode, ModuleNode, SemanticEdge } from './types'

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const SEMANTIC_ANALYSIS_SYSTEM_PROMPT = `You are a code architecture analyst. Your task is to analyze a codebase and identify its semantic structure across three levels:

## The Three Semantic Layers

1. **System Level** (Layer 1 - highest): Major architectural components
   - Examples: "Frontend Application", "Backend API", "CLI Tool", "Shared Libraries"
   - These are the broadest groupings, often corresponding to deployable units

2. **Domain Level** (Layer 2 - middle): Business domains and bounded contexts
   - Examples: "User Management", "Authentication", "Payment Processing", "Notification System"
   - These represent business capabilities or feature areas

3. **Module Level** (Layer 3 - lowest): Logical groupings of related code
   - Examples: "HTTP Client", "Database Repository", "State Management", "Form Validation"
   - These are cohesive groups of functions/classes that work together

## Your Process

1. **Start with the file tree**: Use list_files to understand the overall project structure
2. **Identify systems**: Look at top-level directories to identify major architectural components
3. **Explore domains**: Examine subdirectories and their purposes
4. **Identify modules**: Use get_file_symbols to understand what files export, and group related functionality
5. **Only read files** when you need to understand ambiguous code or import patterns

## Guidelines

- Use directory names and file names as strong signals for grouping
- Only use read_file when the purpose isn't clear from names alone
- Every file's exported symbols should belong to exactly one module
- Every module belongs to exactly one domain
- Every domain belongs to exactly one system
- Use kebab-case for IDs (e.g., "module:user-auth", "domain:payment-processing")
- Keep descriptions concise (1-2 sentences)
- Focus on WHAT code does, not HOW it's implemented

## Module Mapping Strategy (IMPORTANT)

For modules, use an **inheritance-based mapping system** with three levels of specificity:

1. **Directory-level** (most common): Map entire directories to a module
   - Use \`*\` for direct children only: "src/api/*" matches files in src/api/ but NOT subdirectories
   - Use \`**\` for recursive: "src/api/**" matches all files under src/api/ including subdirectories

2. **File-level** (when needed): Override the directory mapping for specific files
   - Use when a file doesn't fit its parent directory's module assignment

3. **Symbol-level** (exception case): Override for individual symbols
   - Use when a specific function/class in a file belongs to a different module than the rest of the file
   - This happens when you notice cross-module imports that don't fit the directory structure

**Example scenario**: If \`src/utils/validators.ts\` mostly contains validation logic but also exports \`formatApiUrl()\` which is clearly HTTP-related:
- Assign "src/utils/**" to \`module:validation\`
- Assign symbol "src/utils/validators.ts:formatApiUrl" to \`module:http-client\`

## Output Format - CRITICAL INSTRUCTION

After exploring the codebase, you MUST output ONLY a valid JSON object. 

**CRITICAL RULES:**
1. Your response MUST start with the character '{' immediately
2. NO text before the JSON (no "I'll analyze", "Here's the analysis", etc.)
3. NO markdown code blocks (no triple backticks)
4. NO explanations after the JSON
5. ONLY the raw JSON object

The JSON must match this exact structure:

{
  "systems": [
    {
      "id": "system:system-name",
      "name": "Human Readable Name",
      "description": "Brief description of this system component",
      "layer": "system",
      "children": ["domain:child-domain-id"],
      "metadata": {
        "keywords": ["keyword1", "keyword2"],
        "responsibility": "Main responsibility"
      }
    }
  ],
  "domains": [
    {
      "id": "domain:domain-name",
      "name": "Human Readable Name",
      "description": "Business capability this domain provides",
      "layer": "domain",
      "parentId": "system:parent-system-id",
      "children": ["module:child-module-id"],
      "metadata": {
        "keywords": ["keyword1"]
      }
    }
  ],
  "modules": [
    {
      "id": "module:module-name",
      "name": "Human Readable Name",
      "description": "What this module does",
      "layer": "module",
      "parentId": "domain:parent-domain-id",
      "children": [],
      "mappings": {
        "directories": ["src/auth/**", "src/login/*"],
        "files": ["src/utils/authHelpers.ts"],
        "symbols": ["src/utils/validators.ts:validateToken"]
      },
      "metadata": {
        "keywords": ["authentication", "login"]
      }
    }
  ],
  "edges": [
    {
      "id": "source-id->target-id",
      "source": "domain:auth",
      "target": "domain:user-management",
      "type": "depends-on"
    }
  ]
}

### Mapping Rules:
- **directories**: Use glob patterns. \`*\` = direct children, \`**\` = recursive
- **files**: Specific file paths that override their directory's assignment
- **symbols**: Specific symbol IDs (format: "filePath:symbolName") that override their file's assignment
- Prefer directory mappings when possible (cheaper to evaluate)
- Only use symbol-level when you detect cross-module usage during analysis

### Edge types:
- "contains": Parent contains child (implicit from children arrays)
- "depends-on": One component uses/imports from another
- "communicates-with": Components interact at runtime (API calls, events)

IMPORTANT: Your final response must be ONLY the JSON object. No markdown code blocks, no explanations before or after.`

// =============================================================================
// ANALYSIS TYPES
// =============================================================================

export interface AnalyzeOptions {
  projectPath: string
  forceRefresh?: boolean
  onProgress?: (status: string) => void
  onToolStart?: (toolName: string, description: string) => void
  onToolEnd?: (toolName: string, result: string) => void
}

export interface AnalysisResult {
  success: boolean
  analysis?: SemanticAnalysis
  error?: string
  cached?: boolean
}

// =============================================================================
// JSON PARSING
// =============================================================================

/**
 * Extract JSON from LLM response (handles potential markdown wrapping)
 */
function extractJson(response: string): string {
  // Try to find JSON in code blocks first
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // Try to find raw JSON (starts with { and ends with })
  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }

  // Return as-is if no patterns found
  return response.trim()
}

/**
 * Parse and validate the LLM response
 */
function parseAnalysisResponse(response: string, projectPath: string): SemanticAnalysis {
  const jsonStr = extractJson(response)

  let parsed: {
    systems?: SystemNode[]
    domains?: DomainNode[]
    modules?: ModuleNode[]
    edges?: SemanticEdge[]
  }

  try {
    parsed = JSON.parse(jsonStr)
  } catch (error) {
    throw new Error(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  // Validate required arrays exist
  if (!Array.isArray(parsed.systems)) {
    throw new Error('Response missing "systems" array')
  }
  if (!Array.isArray(parsed.domains)) {
    throw new Error('Response missing "domains" array')
  }
  if (!Array.isArray(parsed.modules)) {
    throw new Error('Response missing "modules" array')
  }

  // Validate each system node
  for (const system of parsed.systems) {
    if (!system.id || !system.name || !system.layer) {
      throw new Error(`Invalid system node: ${JSON.stringify(system)}`)
    }
    if (system.layer !== 'system') {
      throw new Error(`System node has wrong layer: ${system.layer}`)
    }
    // Ensure children array exists
    if (!Array.isArray(system.children)) {
      system.children = []
    }
  }

  // Validate each domain node
  for (const domain of parsed.domains) {
    if (!domain.id || !domain.name || !domain.layer) {
      throw new Error(`Invalid domain node: ${JSON.stringify(domain)}`)
    }
    if (domain.layer !== 'domain') {
      throw new Error(`Domain node has wrong layer: ${domain.layer}`)
    }
    if (!Array.isArray(domain.children)) {
      domain.children = []
    }
  }

  // Validate each module node
  for (const module of parsed.modules) {
    if (!module.id || !module.name || !module.layer) {
      throw new Error(`Invalid module node: ${JSON.stringify(module)}`)
    }
    if (module.layer !== 'module') {
      throw new Error(`Module node has wrong layer: ${module.layer}`)
    }
    if (!Array.isArray(module.children)) {
      module.children = []
    }
  }

  // Validate edges if present
  const edges = parsed.edges || []
  for (const edge of edges) {
    if (!edge.id || !edge.source || !edge.target || !edge.type) {
      throw new Error(`Invalid edge: ${JSON.stringify(edge)}`)
    }
  }

  // Build the analysis result
  const analysis: SemanticAnalysis = {
    projectPath,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    systems: parsed.systems as SystemNode[],
    domains: parsed.domains as DomainNode[],
    modules: parsed.modules as ModuleNode[],
    edges
  }

  return analysis
}

// =============================================================================
// MAIN ANALYSIS FUNCTION
// =============================================================================

/**
 * Analyze the codebase and generate semantic nodes
 *
 * Flow:
 * 1. Check cache validity
 * 2. If valid cache exists, return cached analysis
 * 3. Otherwise, run LLM analysis with tool calling
 * 4. Parse and validate the response
 * 5. Save to cache
 * 6. Return the analysis
 */
export async function analyzeSemantics(options: AnalyzeOptions): Promise<AnalysisResult> {
  const { projectPath, forceRefresh = false, onProgress, onToolStart, onToolEnd } = options

  console.log('[SemanticAnalyzer] Starting analysis for:', projectPath)

  // Check cache unless force refresh
  if (!forceRefresh) {
    onProgress?.('Checking cache...')
    const cachedAnalysis = await loadSemanticAnalysis(projectPath)

    if (cachedAnalysis) {
      console.log('[SemanticAnalyzer] Using cached analysis from:', cachedAnalysis.timestamp)
      onProgress?.('Using cached analysis')
      return {
        success: true,
        analysis: cachedAnalysis,
        cached: true
      }
    }
  }

  onProgress?.('Starting LLM analysis...')
  console.log('[SemanticAnalyzer] Running fresh LLM analysis')

  // Prepare the initial message to start the analysis
  const initialMessage = `Please analyze this codebase and identify its semantic structure.

Start by exploring the file structure to understand the project layout, then identify:
1. System-level components (major architectural parts)
2. Domain-level groupings (business capabilities)
3. Module-level groupings (related code units)

Begin your exploration now.`

  let fullResponse = ''

  try {
    // Use the existing agentic loop with tool calling
    await new Promise<void>((resolve, reject) => {
      sendMessageWithTools(
        {
          messages: [{ role: 'user', content: initialMessage }],
          systemPrompt: SEMANTIC_ANALYSIS_SYSTEM_PROMPT,
          projectPath,
          maxTokens: 8192, // Larger for JSON output
          finalResponseOnly: true // Only capture the final JSON response, not intermediate tool-calling text
        },
        // onChunk - don't accumulate here, we'll get filtered response from onComplete
        () => {
          // Intentionally empty - we use onComplete to get the filtered final response
        },
        // onError
        (error) => {
          reject(error)
        },
        // onComplete - receive the filtered final response (only last iteration when finalResponseOnly=true)
        (response) => {
          fullResponse = response
          resolve()
        },
        // onToolStart
        (toolName, description) => {
          console.log(`[SemanticAnalyzer] Tool: ${toolName} - ${description}`)
          onProgress?.(`Exploring: ${description}`)
          onToolStart?.(toolName, description)
        },
        // onToolEnd
        (toolName, result) => {
          onToolEnd?.(toolName, result)
        }
      )
    })

    console.log('[SemanticAnalyzer] LLM response length:', fullResponse.length)

    // Parse the response
    onProgress?.('Parsing analysis results...')
    const analysis = parseAnalysisResponse(fullResponse, projectPath)

    console.log('[SemanticAnalyzer] Analysis complete:', {
      systems: analysis.systems.length,
      domains: analysis.domains.length,
      modules: analysis.modules.length,
      edges: analysis.edges.length
    })

    // Save to cache
    onProgress?.('Saving to cache...')
    await saveSemanticAnalysis(projectPath, analysis)

    onProgress?.('Analysis complete')
    return {
      success: true,
      analysis,
      cached: false
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[SemanticAnalyzer] Analysis failed:', errorMessage)

    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * Quick check if semantic analysis exists and is valid
 */
export async function hasValidAnalysis(projectPath: string): Promise<boolean> {
  return await isCacheValid(projectPath)
}

/**
 * Get cached analysis without running LLM (fast)
 */
export async function getCachedAnalysis(projectPath: string): Promise<SemanticAnalysis | null> {
  return await loadSemanticAnalysis(projectPath)
}
