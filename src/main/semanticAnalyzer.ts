/**
 * 5-Step Semantic Analyzer
 *
 * Implements the new analysis pipeline:
 * 1. (LLM) Identify systems - project goals and top-level architecture
 * 2. (LLM) Identify modules with code mappings
 * 3. (LLM) Infer domains from systems + modules
 * 4. (Algorithmic) Module dependencies from symbol call edges
 * 5. (Algorithmic) Domain + System dependencies from module edges
 *
 * Each step is cached independently for resumable analysis.
 */

import { sendMessageWithTools } from './llmClient'
import {
  loadStepCache,
  saveStepCache,
  isStepCacheValid,
  getCompletedSteps,
  invalidateStepCaches,
  isStepAnalysisComplete,
  getStepCacheManifest
} from './cacheManager'
import { extractProjectSymbols } from './symbolExtractor'
import type {
  SemanticAnalysis,
  SystemNode,
  DomainNode,
  ModuleNode,
  SemanticEdge,
  AnalysisStep,
  Step1SystemsResult,
  Step2ModulesResult,
  Step3DomainsResult,
  Step4ModuleEdgesResult,
  Step5DomainEdgesResult,
  Step6ExternalDependenciesResult,
  ProjectSymbols,
  DependencyEdge,
  ExternalDependency
} from './types'

// =============================================================================
// STEP PROMPTS
// =============================================================================

const STEP1_SYSTEMS_PROMPT = `You are a code architecture analyst. Your task is to analyze a codebase and identify its top-level SYSTEMS.

## System Level (Layer 1)

Systems are the highest-level architectural components of a project:
- Examples: "Frontend Application", "Backend API", "CLI Tool", "Shared Libraries", "Database Layer"
- These correspond to major deployable units or distinct architectural boundaries
- Usually map to top-level directories or clear architectural separations

## Your Task

Explore the codebase and identify 2-6 systems that represent the major architectural components.

## Guidelines

- Look at top-level directory structure first
- Consider the project's apparent purpose and goals
- Each system should be a coherent, deployable/architectural unit
- Systems can be thought of as "what you would deploy separately"
- Use kebab-case for IDs (e.g., "system:frontend-app")
- Keep descriptions concise (1-2 sentences)

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
      "summary": "Brief description of this system's purpose and role",
      "layer": "system",
      "children": [],
      "metadata": {
        "keywords": ["keyword1", "keyword2"],
        "responsibility": "Main architectural responsibility"
      }
    }
  ]
}

IMPORTANT: Do not include domains or modules. Only identify systems at this stage.`

const STEP2_MODULES_PROMPT = `You are a code architecture analyst. Your task is to identify MODULES in this codebase.

## Module Level (Layer 3)

Modules are logical groupings of related code that work together:
- Examples: "HTTP Client", "Database Repository", "Authentication Logic", "Form Validation"
- These are cohesive units of functionality
- They group functions, classes, and related symbols that collaborate

## Your Task

1. Explore the codebase structure
2. Examine file contents and exports (use get_file_symbols)
3. Identify 5-20 modules that represent distinct functional areas
4. Map code to modules using the mapping system below

## Module Mapping Strategy (IMPORTANT)

Use an **inheritance-based mapping system** with three levels of specificity:

1. **Directory-level** (most common): Map entire directories to a module
   - Use \`*\` for direct children only: "src/api/*" matches files in src/api/ but NOT subdirectories
   - Use \`**\` for recursive: "src/api/**" matches all files under src/api/ including subdirectories

2. **File-level** (when needed): Override the directory mapping for specific files
   - Use when a file doesn't fit its parent directory's module assignment

3. **Symbol-level** (exception case): Override for individual symbols
   - Use when a specific function/class in a file belongs to a different module
   - Format: "src/utils/validators.ts:formatApiUrl"

## Guidelines

- Every file's exported symbols should belong to exactly one module
- Prefer directory mappings when possible (cheaper to evaluate)
- Only use symbol-level when you detect cross-module usage
- Module names should be descriptive of the functionality
- Use kebab-case for IDs (e.g., "module:http-client")
- 5-20 modules is typical for most projects

## Output Format - CRITICAL INSTRUCTION

Output ONLY a valid JSON object starting with '{'.

**CRITICAL RULES:**
1. Start with '{' immediately
2. NO text before the JSON
3. NO markdown code blocks
4. NO explanations after

The JSON structure:

{
  "modules": [
    {
      "id": "module:module-name",
      "name": "Human Readable Name",
      "summary": "What this module does and its responsibilities",
      "layer": "module",
      "parentId": null,
      "children": [],
      "mappings": {
        "directories": ["src/auth/**", "src/login/*"],
        "files": ["src/utils/authHelpers.ts"],
        "symbols": ["src/utils/validators.ts:formatToken"]
      },
      "metadata": {
        "keywords": ["authentication", "security"]
      }
    }
  ]
}

Leave parentId as null - domains will be inferred in the next step.`

const STEP3_DOMAINS_PROMPT = `You are a code architecture analyst. Your task is to infer DOMAINS from the systems and modules.

## Domain Level (Layer 2)

Domains represent business capabilities or bounded contexts:
- Examples: "User Management", "Authentication", "Payment Processing", "Notification System"
- These group related modules by business concern
- Each domain belongs to exactly one system
- Each module belongs to exactly one domain

## Context from Previous Steps

You have:
- SYSTEMS identified in step 1 (major architectural components)
- MODULES identified in step 2 (functional code groupings)

## Your Task

1. Review the systems and their architectural roles
2. Review all modules and their purposes
3. Group modules into 3-8 domains based on business/functional similarity
4. Assign each domain to the most appropriate system
5. Update each module's parentId to point to its domain

## Guidelines

- Domains should represent business capabilities, not technical layers
- Consider what the code "does for the business" not "how it's implemented"
- Each module must belong to exactly one domain
- Each domain must belong to exactly one system
- Use kebab-case for IDs (e.g., "domain:user-management")
- Domain names should be business-oriented (not "utils", "helpers")

## Output Format - CRITICAL INSTRUCTION

Output ONLY a valid JSON object starting with '{'.

**CRITICAL RULES:**
1. Start with '{' immediately
2. NO text before the JSON
3. NO markdown code blocks
4. NO explanations after

The JSON structure:

{
  "domains": [
    {
      "id": "domain:domain-name",
      "name": "Human Readable Name",
      "summary": "Business capability this domain provides",
      "layer": "domain",
      "parentId": "system:parent-system-id",
      "children": ["module:child-module-id-1", "module:child-module-id-2"],
      "metadata": {
        "keywords": ["user", "account"]
      }
    }
  ],
  "updatedModules": [
    {
      "id": "module:module-name",
      "parentId": "domain:parent-domain-id"
    }
  ]
}

Note: Only include modules that need their parentId updated in updatedModules.`

// =============================================================================
// STEP PROMPTS
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
  completedSteps?: AnalysisStep[]
}

// =============================================================================
// JSON PARSING HELPERS
// =============================================================================

function extractJson(response: string): string {
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }

  return response.trim()
}

function parseStep1Response(response: string): Step1SystemsResult {
  const jsonStr = extractJson(response)
  const parsed = JSON.parse(jsonStr)

  if (!Array.isArray(parsed.systems)) {
    throw new Error('Response missing "systems" array')
  }

  for (const system of parsed.systems) {
    if (!system.id || !system.name || !system.layer) {
      throw new Error(`Invalid system node: ${JSON.stringify(system)}`)
    }
    if (system.layer !== 'system') {
      throw new Error(`System node has wrong layer: ${system.layer}`)
    }
  }

  return {
    step: 1,
    timestamp: new Date().toISOString(),
    systems: parsed.systems as SystemNode[]
  }
}

function parseStep2Response(response: string): Step2ModulesResult {
  const jsonStr = extractJson(response)
  const parsed = JSON.parse(jsonStr)

  if (!Array.isArray(parsed.modules)) {
    throw new Error('Response missing "modules" array')
  }

  for (const module of parsed.modules) {
    if (!module.id || !module.name || !module.layer) {
      throw new Error(`Invalid module node: ${JSON.stringify(module)}`)
    }
    if (module.layer !== 'module') {
      throw new Error(`Module node has wrong layer: ${module.layer}`)
    }
  }

  return {
    step: 2,
    timestamp: new Date().toISOString(),
    modules: parsed.modules as ModuleNode[]
  }
}

function parseStep3Response(
  response: string,
  step2Modules: ModuleNode[]
): { domains: DomainNode[]; updatedModules: ModuleNode[] } {
  const jsonStr = extractJson(response)
  const parsed = JSON.parse(jsonStr)

  if (!Array.isArray(parsed.domains)) {
    throw new Error('Response missing "domains" array')
  }

  for (const domain of parsed.domains) {
    if (!domain.id || !domain.name || !domain.layer) {
      throw new Error(`Invalid domain node: ${JSON.stringify(domain)}`)
    }
    if (domain.layer !== 'domain') {
      throw new Error(`Domain node has wrong layer: ${domain.layer}`)
    }
  }

  // Update modules with parentIds from step 3
  const moduleMap = new Map(step2Modules.map((m) => [m.id, m]))
  const updatedModules = step2Modules.map((m) => ({ ...m }))

  if (parsed.updatedModules) {
    for (const update of parsed.updatedModules) {
      const module = moduleMap.get(update.id)
      if (module) {
        const index = updatedModules.findIndex((m) => m.id === update.id)
        if (index !== -1) {
          updatedModules[index] = { ...module, parentId: update.parentId }
        }
      }
    }
  }

  // Also update modules listed in domain.children
  for (const domain of parsed.domains) {
    if (domain.children) {
      for (const moduleId of domain.children) {
        const index = updatedModules.findIndex((m) => m.id === moduleId)
        if (index !== -1) {
          updatedModules[index] = { ...updatedModules[index], parentId: domain.id }
        }
      }
    }
  }

  return {
    domains: parsed.domains as DomainNode[],
    updatedModules
  }
}

// =============================================================================
// STEP EXECUTORS
// =============================================================================

async function runStep1(
  projectPath: string,
  onProgress: (status: string) => void,
  onToolStart: (toolName: string, description: string) => void,
  onToolEnd: (toolName: string, result: string) => void
): Promise<Step1SystemsResult> {
  onProgress('Step 1/5: Identifying systems...')

  const initialMessage = `Please analyze this codebase and identify its top-level SYSTEMS.

Start by exploring the file structure to understand the overall project layout, then identify the major architectural components (systems).

Begin your exploration now.`

  let fullResponse = ''

  await new Promise<void>((resolve, reject) => {
    sendMessageWithTools(
      {
        messages: [{ role: 'user', content: initialMessage }],
        systemPrompt: STEP1_SYSTEMS_PROMPT,
        projectPath,
        maxTokens: 4096,
        finalResponseOnly: true
      },
      () => {},
      (error) => reject(error),
      (response) => {
        fullResponse = response
        resolve()
      },
      (toolName, description) => {
        console.log(`[Step1] Tool: ${toolName} - ${description}`)
        onToolStart(toolName, description)
      },
      (toolName, result) => {
        onToolEnd(toolName, result)
      }
    )
  })

  console.log('[Step1] Response length:', fullResponse.length)
  return parseStep1Response(fullResponse)
}

async function runStep2(
  projectPath: string,
  step1Result: Step1SystemsResult,
  onProgress: (status: string) => void,
  onToolStart: (toolName: string, description: string) => void,
  onToolEnd: (toolName: string, result: string) => void
): Promise<Step2ModulesResult> {
  onProgress('Step 2/5: Identifying modules...')

  const contextInfo = step1Result.systems.map((s) => `- ${s.name}: ${s.summary}`).join('\n')

  const initialMessage = `Please identify MODULES in this codebase.

Systems identified in step 1:
${contextInfo}

Explore the file structure and examine file contents to understand the codebase's functional organization. Identify modules that represent distinct functional areas.

Begin your exploration now.`

  let fullResponse = ''

  await new Promise<void>((resolve, reject) => {
    sendMessageWithTools(
      {
        messages: [{ role: 'user', content: initialMessage }],
        systemPrompt: STEP2_MODULES_PROMPT,
        projectPath,
        maxTokens: 8192,
        finalResponseOnly: true
      },
      () => {},
      (error) => reject(error),
      (response) => {
        fullResponse = response
        resolve()
      },
      (toolName, description) => {
        console.log(`[Step2] Tool: ${toolName} - ${description}`)
        onToolStart(toolName, description)
      },
      (toolName, result) => {
        onToolEnd(toolName, result)
      }
    )
  })

  console.log('[Step2] Response length:', fullResponse.length)
  return parseStep2Response(fullResponse)
}

async function runStep3(
  projectPath: string,
  step1Result: Step1SystemsResult,
  step2Result: Step2ModulesResult,
  onProgress: (status: string) => void,
  onToolStart: (toolName: string, description: string) => void,
  onToolEnd: (toolName: string, result: string) => void
): Promise<{ domains: DomainNode[]; updatedModules: ModuleNode[] }> {
  onProgress('Step 3/5: Inferring domains...')

  const systemsInfo = step1Result.systems
    .map((s) => `- ${s.name} (${s.id}): ${s.summary}`)
    .join('\n')

  const modulesInfo = step2Result.modules
    .slice(0, 30) // Limit to avoid token limits
    .map((m) => `- ${m.name} (${m.id}): ${m.summary}`)
    .join('\n')

  const initialMessage = `Please infer DOMAINS from the systems and modules.

Systems identified:
${systemsInfo}

Modules identified (first 30):
${modulesInfo}

${step2Result.modules.length > 30 ? `... and ${step2Result.modules.length - 30} more modules` : ''}

Group the modules into domains based on business/functional similarity. Assign each domain to the most appropriate system. Update each module's parentId to point to its domain.

Begin analysis now.`

  let fullResponse = ''

  await new Promise<void>((resolve, reject) => {
    sendMessageWithTools(
      {
        messages: [{ role: 'user', content: initialMessage }],
        systemPrompt: STEP3_DOMAINS_PROMPT,
        projectPath,
        maxTokens: 8192,
        finalResponseOnly: true
      },
      () => {},
      (error) => reject(error),
      (response) => {
        fullResponse = response
        resolve()
      },
      (toolName, description) => {
        console.log(`[Step3] Tool: ${toolName} - ${description}`)
        onToolStart(toolName, description)
      },
      (toolName, result) => {
        onToolEnd(toolName, result)
      }
    )
  })

  console.log('[Step3] Response length:', fullResponse.length)
  return parseStep3Response(fullResponse, step2Result.modules)
}

// =============================================================================
// STEP 6: External Dependencies Detection
// =============================================================================

async function runStep6(
  projectPath: string,
  step2Result: Step2ModulesResult,
  step3Result: { domains: DomainNode[]; updatedModules: ModuleNode[] },
  onProgress: (status: string) => void,
  onToolStart: (toolName: string, description: string) => void,
  onToolEnd: (toolName: string, result: string) => void
): Promise<Step6ExternalDependenciesResult> {
  onProgress('Step 6/6: Detecting external dependencies...')

  const systemsInfo = `Systems: ${step3Result.domains
    .map((d) => d.parentId)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .map((id) => id?.replace('system:', '') || 'unknown')
    .join(', ')}`

  const modulesInfo = step2Result.modules
    .slice(0, 50)
    .map((m) => `- \`${m.id}\`: ${m.name} - ${m.summary || 'No description'}`)
    .join('\n')

  const step6Prompt = `You are a network dependency analyst. Your task is to identify all services that this codebase communicates with over the network and classify them as INTERNAL or EXTERNAL.

## Dependency Classification

### INTERNAL Dependencies
Services that are PART OF THIS PROJECT (same codebase/monorepo):
- Backend API running on localhost when frontend is in the same project
- Internal microservices within the same repository
- Example: \`http://localhost:3001\` when project has a backend module

### EXTERNAL Dependencies  
Third-party services OUTSIDE THIS PROJECT:
- REST APIs (Stripe, Twilio, OpenAI, etc.)
- Databases (Firebase, Supabase, external PostgreSQL, etc.)
- Authentication services (Auth0, Clerk, Okta, etc.)
- Storage services (S3, Cloudinary, etc.)
- Example: \`https://api.stripe.com\`, \`https://firebaseio.com\`

## Your Task

1. Read package.json to identify network-related dependencies
2. Use search_codebase to find network calls in the codebase
3. read_file relevant code to identify the services
4. CLASSIFY each service as INTERNAL or EXTERNAL
5. For INTERNAL: Identify which module(s) in THIS project handle the requests
6. For EXTERNAL: Create a unique ID for the external service

## Module Reference

Use this information to identify internal targets. Match the URL pattern to the module's purpose:

${modulesInfo}

## Rules

- MAXIMUM 30 tool calls total - use them efficiently
- Focus on finding unique services, not every call site
- For INTERNAL: You MUST specify which module(s) handle the URL in targetModules
- For EXTERNAL: Create a descriptive ID (e.g., "external:stripe-api", "external:firebase")
- If you cannot determine the internal target module, classify as EXTERNAL
- Include authentication method if identifiable

## Output Format - CRITICAL INSTRUCTION

Output ONLY a valid JSON object starting with '{'.

**CRITICAL RULES:**
1. Start with '{' immediately
2. NO text before the JSON
3. NO markdown code blocks
4. NO explanations after

The JSON structure:

{
  "externalDependencies": [
    {
      "dependencyType": "internal",
      "sourceModules": ["module:todo-management"],
      "targetModules": ["module:todo-api"],
      "urlPattern": "http://localhost:3001",
      "type": "api",
      "endpoints": [
        {"path": "/todos", "method": "GET", "file": "frontend/src/api.ts", "line": 45}
      ]
    },
    {
      "dependencyType": "external",
      "id": "external:stripe-api",
      "name": "Stripe API",
      "sourceModules": ["module:payment-processor"],
      "urlPattern": "https://api.stripe.com",
      "type": "api",
      "authType": "bearer-token",
      "endpoints": [
        {"path": "/v1/charges", "method": "POST", "file": "src/payment/stripe.ts", "line": 45}
      ]
    }
  ]
}`

  const initialMessage = `Please identify all services that this codebase communicates with over the network.

${systemsInfo}

Modules identified (first 50):
${modulesInfo}

${step2Result.modules.length > 50 ? `... and ${step2Result.modules.length - 50} more modules` : ''}

First, read package.json to identify network-related dependencies. Then use search_codebase and read_file to find network calls and identify services.

MAXIMUM 30 TOOL CALLS - use them efficiently.

Begin exploration now.`

  let fullResponse = ''

  await new Promise<void>((resolve, reject) => {
    sendMessageWithTools(
      {
        messages: [{ role: 'user', content: initialMessage }],
        systemPrompt: step6Prompt,
        projectPath,
        maxTokens: 8192,
        finalResponseOnly: true
      },
      () => {},
      (error) => reject(error),
      (response) => {
        fullResponse = response
        resolve()
      },
      (toolName, description) => {
        console.log(`[Step6] Tool: ${toolName} - ${description}`)
        onToolStart(toolName, description)
      },
      (toolName, result) => {
        onToolEnd(toolName, result)
      }
    )
  })

  console.log('[Step6] Response length:', fullResponse.length)
  return parseStep6Response(fullResponse)
}

function parseStep6Response(response: string): Step6ExternalDependenciesResult {
  const jsonStr = extractJson(response)
  const parsed = JSON.parse(jsonStr)

  if (!Array.isArray(parsed.externalDependencies)) {
    console.warn('[Step6] Response missing "externalDependencies" array, returning empty')
    return {
      step: 6,
      timestamp: new Date().toISOString(),
      externalDependencies: []
    }
  }

  const dependencies: ExternalDependency[] = []

  for (const dep of parsed.externalDependencies) {
    const dependencyType = dep.dependencyType || 'external'

    const dependency: ExternalDependency = {
      dependencyType,
      sourceModules: dep.sourceModules || [],
      urlPattern: dep.urlPattern || dep.name || 'unknown',
      type: dep.type || 'api',
      endpoints: (dep.endpoints || []).map(
        (e: { path?: string; method?: string; file: string; line: number }) => ({
          path: e.path || '/',
          method: e.method,
          file: e.file,
          line: e.line || 1
        })
      )
    }

    if (dependencyType === 'internal') {
      dependency.targetModules = dep.targetModules || []
    } else {
      dependency.id =
        dep.id || `external:${dep.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown'}`
      dependency.name = dep.name || 'Unknown External Service'
      dependency.authType = dep.authType
    }

    dependencies.push(dependency)
  }

  console.log(
    `[Step6] Identified ${dependencies.length} dependencies (${dependencies.filter((d) => d.dependencyType === 'internal').length} internal, ${dependencies.filter((d) => d.dependencyType === 'external').length} external)`
  )

  return {
    step: 6,
    timestamp: new Date().toISOString(),
    externalDependencies: dependencies
  }
}

// =============================================================================
// ALGORITHMIC STEPS (4-5)
// =============================================================================

function resolveSymbolToModule(symbolId: string, modules: ModuleNode[]): string | undefined {
  // Extract file path from symbol ID (format: filePath:symbolName)
  const colonIndex = symbolId.lastIndexOf(':')
  if (colonIndex === -1) return undefined
  const filePath = symbolId.substring(0, colonIndex)

  // Check modules in order of specificity
  for (const module of modules) {
    const mappings = module.mappings
    if (!mappings) continue

    // Check symbol-level first (highest priority)
    if (mappings.symbols?.includes(symbolId)) {
      return module.id
    }

    // Check file-level
    if (mappings.files?.includes(filePath)) {
      return module.id
    }

    // Check directory-level
    if (mappings.directories) {
      for (const pattern of mappings.directories) {
        // Convert glob pattern to regex
        const regexPattern = pattern
          .replace(/\*\*/g, '<<GLOBSTAR>>')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '.')
          .replace(/<<GLOBSTAR>>/g, '.*')

        const regex = new RegExp(`^${regexPattern}$`)
        if (regex.test(filePath)) {
          return module.id
        }
      }
    }
  }

  return undefined
}

function runStep4(
  modules: ModuleNode[],
  callEdges: DependencyEdge[],
  onProgress: (status: string) => void
): Step4ModuleEdgesResult {
  onProgress('Step 4/5: Computing module dependencies...')

  const moduleEdges: SemanticEdge[] = []
  const seenEdges = new Set<string>()

  // Build symbol -> module map
  const allSymbolIds = new Set<string>()
  for (const edge of callEdges) {
    allSymbolIds.add(edge.source)
    allSymbolIds.add(edge.target)
  }

  const symbolToModule = new Map<string, string | undefined>()
  for (const symbolId of allSymbolIds) {
    symbolToModule.set(symbolId, resolveSymbolToModule(symbolId, modules))
  }

  // Aggregate symbol edges to module edges
  for (const edge of callEdges) {
    const sourceModule = symbolToModule.get(edge.source)
    const targetModule = symbolToModule.get(edge.target)

    if (!sourceModule || !targetModule) continue
    if (sourceModule === targetModule) continue // Skip internal edges

    const edgeId = `${sourceModule}->${targetModule}`
    if (seenEdges.has(edgeId)) continue

    seenEdges.add(edgeId)
    moduleEdges.push({
      id: edgeId,
      source: sourceModule,
      target: targetModule,
      type: 'depends-on'
    })
  }

  console.log(
    `[Step4] Computed ${moduleEdges.length} module edges from ${callEdges.length} symbol edges`
  )

  return {
    step: 4,
    timestamp: new Date().toISOString(),
    edges: moduleEdges
  }
}

function runStep5(
  _domains: DomainNode[],
  modules: ModuleNode[],
  moduleEdges: SemanticEdge[],
  onProgress: (status: string) => void
): Step5DomainEdgesResult {
  onProgress('Step 5/5: Computing domain dependencies...')

  const domainEdges: SemanticEdge[] = []
  const seenEdges = new Set<string>()

  // Build module -> domain map
  const moduleToDomain = new Map<string, string>()
  for (const module of modules) {
    if (module.parentId) {
      moduleToDomain.set(module.id, module.parentId)
    }
  }

  // Aggregate module edges to domain edges
  for (const moduleEdge of moduleEdges) {
    const sourceDomain = moduleToDomain.get(moduleEdge.source)
    const targetDomain = moduleToDomain.get(moduleEdge.target)

    if (!sourceDomain || !targetDomain) continue
    if (sourceDomain === targetDomain) continue // Skip internal edges

    const edgeId = `${sourceDomain}->${targetDomain}`
    if (seenEdges.has(edgeId)) continue

    seenEdges.add(edgeId)
    domainEdges.push({
      id: edgeId,
      source: sourceDomain,
      target: targetDomain,
      type: 'depends-on'
    })
  }

  console.log(
    `[Step5] Computed ${domainEdges.length} domain edges from ${moduleEdges.length} module edges`
  )

  return {
    step: 5,
    timestamp: new Date().toISOString(),
    edges: domainEdges
  }
}

function computeSystemEdges(domains: DomainNode[], domainEdges: SemanticEdge[]): SemanticEdge[] {
  const systemEdges: SemanticEdge[] = []
  const seenEdges = new Set<string>()

  // Build domain -> system map
  const domainToSystem = new Map<string, string>()
  for (const domain of domains) {
    if (domain.parentId) {
      domainToSystem.set(domain.id, domain.parentId)
    }
  }

  // Aggregate domain edges to system edges
  for (const domainEdge of domainEdges) {
    const sourceSystem = domainToSystem.get(domainEdge.source)
    const targetSystem = domainToSystem.get(domainEdge.target)

    if (!sourceSystem || !targetSystem) continue
    if (sourceSystem === targetSystem) continue

    const edgeId = `${sourceSystem}->${targetSystem}`
    if (seenEdges.has(edgeId)) continue

    seenEdges.add(edgeId)
    systemEdges.push({
      id: edgeId,
      source: sourceSystem,
      target: targetSystem,
      type: 'depends-on'
    })
  }

  console.log(`[SystemEdges] Computed ${systemEdges.length} system edges`)
  return systemEdges
}

function computeExternalEdges(
  externalDependencies: ExternalDependency[],
  modules: ModuleNode[]
): SemanticEdge[] {
  const externalEdges: SemanticEdge[] = []
  const seenEdges = new Set<string>()

  // Build module ID lookup (handle shorthand IDs)
  const moduleIds = new Set(modules.map((m) => m.id))
  const moduleNameToId = new Map<string, string>()
  for (const module of modules) {
    const shortName = module.id.replace('module:', '')
    moduleNameToId.set(shortName, module.id)
    moduleNameToId.set(module.name.toLowerCase().replace(/\s+/g, '-'), module.id)
  }

  for (const dep of externalDependencies) {
    // Resolve source modules to full IDs
    for (const sourceModule of dep.sourceModules) {
      let resolvedSourceId = sourceModule

      // If shorthand ID is provided, resolve to full ID
      if (!moduleIds.has(sourceModule)) {
        resolvedSourceId = moduleNameToId.get(sourceModule) || sourceModule
      }

      if (dep.dependencyType === 'internal' && dep.targetModules) {
        // Internal: Create edges from source module to target modules
        for (const targetModule of dep.targetModules) {
          let resolvedTargetId = targetModule

          if (!moduleIds.has(targetModule)) {
            resolvedTargetId = moduleNameToId.get(targetModule) || targetModule
          }

          const edgeId = `${resolvedSourceId}->${resolvedTargetId}`
          if (seenEdges.has(edgeId)) continue

          seenEdges.add(edgeId)
          externalEdges.push({
            id: edgeId,
            source: resolvedSourceId,
            target: resolvedTargetId,
            type: 'communicates-with'
          })
        }
      } else if (dep.id) {
        // External: Create edge from source module to external node
        const edgeId = `${resolvedSourceId}->${dep.id}`
        if (seenEdges.has(edgeId)) continue

        seenEdges.add(edgeId)
        externalEdges.push({
          id: edgeId,
          source: resolvedSourceId,
          target: dep.id,
          type: 'communicates-with'
        })
      }
    }
  }

  console.log(`[ExternalEdges] Computed ${externalEdges.length} external (communicates-with) edges`)
  return externalEdges
}

function computeExternalDomainEdges(
  externalDependencies: ExternalDependency[],
  domains: DomainNode[]
): SemanticEdge[] {
  const externalEdges: SemanticEdge[] = []
  const seenEdges = new Set<string>()

  // Build module -> domain map
  const moduleToDomain = new Map<string, string>()
  for (const domain of domains) {
    for (const child of domain.children) {
      if (!moduleToDomain.has(child)) {
        moduleToDomain.set(child, domain.id)
      }
    }
  }

  for (const dep of externalDependencies) {
    if (dep.dependencyType === 'internal' && dep.targetModules) {
      // Internal: Aggregate module→module edges to domain→domain edges
      for (const sourceModule of dep.sourceModules) {
        const sourceDomain = moduleToDomain.get(sourceModule)
        if (!sourceDomain) continue

        for (const targetModule of dep.targetModules) {
          const targetDomain = moduleToDomain.get(targetModule)
          if (!targetDomain) continue
          if (sourceDomain === targetDomain) continue

          const edgeId = `${sourceDomain}->${targetDomain}`
          if (seenEdges.has(edgeId)) continue
          seenEdges.add(edgeId)

          externalEdges.push({
            id: edgeId,
            source: sourceDomain,
            target: targetDomain,
            type: 'communicates-with'
          })
        }
      }
    } else if (dep.id) {
      // External: Aggregate module→external to domain→external
      for (const sourceModule of dep.sourceModules) {
        const domainId = moduleToDomain.get(sourceModule)
        if (!domainId) continue

        const edgeId = `${domainId}->${dep.id}`
        if (seenEdges.has(edgeId)) continue
        seenEdges.add(edgeId)

        externalEdges.push({
          id: edgeId,
          source: domainId,
          target: dep.id,
          type: 'communicates-with'
        })
      }
    }
  }

  console.log(`[ExternalDomainEdges] Computed ${externalEdges.length} domain-level external edges`)
  return externalEdges
}

function computeExternalSystemEdges(
  externalDependencies: ExternalDependency[],
  systems: SystemNode[],
  domains: DomainNode[]
): SemanticEdge[] {
  const externalEdges: SemanticEdge[] = []
  const seenEdges = new Set<string>()

  // Build domain -> system map
  const domainToSystem = new Map<string, string>()
  for (const system of systems) {
    for (const child of system.children) {
      if (!domainToSystem.has(child)) {
        domainToSystem.set(child, system.id)
      }
    }
  }

  // Build module -> domain map
  const moduleToDomain = new Map<string, string>()
  for (const domain of domains) {
    for (const child of domain.children) {
      if (!moduleToDomain.has(child)) {
        moduleToDomain.set(child, domain.id)
      }
    }
  }

  // Build module -> system map (direct, via domain)
  const moduleToSystem = new Map<string, string>()
  for (const system of systems) {
    for (const child of system.children) {
      const domain = domains.find((d) => d.id === child)
      if (domain) {
        for (const moduleId of domain.children) {
          moduleToSystem.set(moduleId, system.id)
        }
      }
    }
  }

  const seenModuleSystems = new Set<string>()

  for (const dep of externalDependencies) {
    if (dep.dependencyType === 'internal' && dep.targetModules) {
      // Internal: Aggregate module→module to domain→domain to system→system
      for (const sourceModule of dep.sourceModules) {
        const sourceDomain = moduleToDomain.get(sourceModule)
        if (!sourceDomain) continue
        const sourceSystem = domainToSystem.get(sourceDomain)
        if (!sourceSystem) continue

        for (const targetModule of dep.targetModules) {
          const targetDomain = moduleToDomain.get(targetModule)
          if (!targetDomain) continue
          const targetSystem = domainToSystem.get(targetDomain)
          if (!targetSystem) continue
          if (sourceSystem === targetSystem) continue

          const key = `${sourceSystem}->${targetSystem}`
          if (seenEdges.has(key)) continue
          seenEdges.add(key)

          externalEdges.push({
            id: key,
            source: sourceSystem,
            target: targetSystem,
            type: 'communicates-with'
          })
        }
      }
    } else if (dep.id) {
      // External: Aggregate module→external to system→external
      for (const sourceModule of dep.sourceModules) {
        const systemId = moduleToSystem.get(sourceModule)
        if (!systemId) continue

        const key = `${systemId}->${dep.id}`
        if (seenEdges.has(key)) continue
        seenEdges.add(key)

        externalEdges.push({
          id: key,
          source: systemId,
          target: dep.id,
          type: 'communicates-with'
        })
        seenModuleSystems.add(key)
      }

      // Also aggregate domain external edges to system level
      for (const sourceModule of dep.sourceModules) {
        const domainId = moduleToDomain.get(sourceModule)
        if (!domainId) continue

        const systemId = domainToSystem.get(domainId)
        if (!systemId) continue

        const key = `${systemId}->${dep.id}`
        if (seenEdges.has(key) || seenModuleSystems.has(key)) continue
        seenEdges.add(key)

        externalEdges.push({
          id: key,
          source: systemId,
          target: dep.id,
          type: 'communicates-with'
        })
      }
    }
  }

  console.log(`[ExternalSystemEdges] Computed ${externalEdges.length} system-level external edges`)
  return externalEdges
}

function populateSystemChildren(systems: SystemNode[], domains: DomainNode[]): void {
  for (const system of systems) {
    system.children = domains.filter((d) => d.parentId === system.id).map((d) => d.id)
  }
}

export async function analyzeSemantics(options: AnalyzeOptions): Promise<AnalysisResult> {
  const {
    projectPath,
    forceRefresh = false,
    onProgress = () => {},
    onToolStart = () => {},
    onToolEnd = () => {}
  } = options

  console.log('[SemanticAnalyzer] Starting 5-step analysis for:', projectPath)

  // Handle force refresh
  if (forceRefresh) {
    console.log('[SemanticAnalyzer] Force refresh - invalidating all caches')
    await invalidateStepCaches(projectPath)
  }

  try {
    // Check if we have a complete cached analysis
    if (!forceRefresh && (await isStepAnalysisComplete(projectPath, 6))) {
      console.log('[SemanticAnalyzer] Using complete cached analysis')
      onProgress('Loading cached analysis...')

      const step1 = await loadStepCache(projectPath, 1)
      const step2 = await loadStepCache(projectPath, 2)
      const step3 = await loadStepCache(projectPath, 3)
      const step4 = await loadStepCache(projectPath, 4)
      const step5 = await loadStepCache(projectPath, 5)
      const step6 = await loadStepCache(projectPath, 6)

      if (step1 && step2 && step3 && step4 && step5 && step6) {
        const systems = (step1.data as Step1SystemsResult).systems
        const modules = (step3.data as Step3DomainsResult & { updatedModules: ModuleNode[] })
          .updatedModules
        const domains = (step3.data as Step3DomainsResult).domains
        const moduleEdges = (step4.data as Step4ModuleEdgesResult).edges
        const domainEdges = (step5.data as Step5DomainEdgesResult).edges
        const step6Result = step6.data as unknown as Step6ExternalDependenciesResult
        const externalEdges = computeExternalEdges(step6Result.externalDependencies, modules)

        const analysis: SemanticAnalysis = {
          projectPath,
          timestamp: new Date().toISOString(),
          version: '2.0.0',
          systems,
          domains,
          modules,
          edges: [...moduleEdges, ...domainEdges, ...externalEdges]
        }

        const completedSteps = await getCompletedSteps(projectPath)
        return {
          success: true,
          analysis,
          cached: true,
          completedSteps
        }
      }
    }

    // Execute steps 1-3 (LLM steps)
    let step1Result: Step1SystemsResult
    let step2Result: Step2ModulesResult
    let step3Result: { domains: DomainNode[]; updatedModules: ModuleNode[] }

    // Step 1: Identify systems
    if (await isStepCacheValid(projectPath, 1)) {
      onProgress('Loading cached systems...')
      const cached = await loadStepCache(projectPath, 1)
      if (cached) {
        step1Result = cached.data as Step1SystemsResult
        console.log('[SemanticAnalyzer] Loaded cached step 1')
      } else {
        step1Result = await runStep1(projectPath, onProgress, onToolStart, onToolEnd)
        await saveStepCache(projectPath, 1, step1Result)
      }
    } else {
      step1Result = await runStep1(projectPath, onProgress, onToolStart, onToolEnd)
      await saveStepCache(projectPath, 1, step1Result)
    }

    // Step 2: Identify modules
    if (await isStepCacheValid(projectPath, 2)) {
      onProgress('Loading cached modules...')
      const cached = await loadStepCache(projectPath, 2)
      if (cached) {
        step2Result = cached.data as Step2ModulesResult
        console.log('[SemanticAnalyzer] Loaded cached step 2')
      } else {
        step2Result = await runStep2(projectPath, step1Result, onProgress, onToolStart, onToolEnd)
        await saveStepCache(projectPath, 2, step2Result)
      }
    } else {
      step2Result = await runStep2(projectPath, step1Result, onProgress, onToolStart, onToolEnd)
      await saveStepCache(projectPath, 2, step2Result)
    }

    // Step 3: Infer domains
    if (await isStepCacheValid(projectPath, 3)) {
      onProgress('Loading cached domains...')
      const cached = await loadStepCache(projectPath, 3)
      if (cached) {
        const step3Data = cached.data as Step3DomainsResult & { updatedModules: ModuleNode[] }
        step3Result = { domains: step3Data.domains, updatedModules: step3Data.updatedModules }
        console.log('[SemanticAnalyzer] Loaded cached step 3')
      } else {
        step3Result = await runStep3(
          projectPath,
          step1Result,
          step2Result,
          onProgress,
          onToolStart,
          onToolEnd
        )
        await saveStepCache(projectPath, 3, {
          step: 3,
          timestamp: new Date().toISOString(),
          domains: step3Result.domains,
          updatedModules: step3Result.updatedModules
        } as Step3DomainsResult & { updatedModules: ModuleNode[] })
      }
    } else {
      step3Result = await runStep3(
        projectPath,
        step1Result,
        step2Result,
        onProgress,
        onToolStart,
        onToolEnd
      )
      await saveStepCache(projectPath, 3, {
        step: 3,
        timestamp: new Date().toISOString(),
        domains: step3Result.domains,
        updatedModules: step3Result.updatedModules
      } as Step3DomainsResult & { updatedModules: ModuleNode[] })
    }

    // Steps 1-3 complete - now extract symbols and compute dependencies (steps 4-5)
    onProgress('Step 4/5: Extracting code symbols...')

    // Extract symbols using TypeScript compiler
    const projectSymbols = extractProjectSymbols(projectPath)
    console.log('[SemanticAnalyzer] Extracted symbols:', {
      files: projectSymbols.totalFiles,
      symbols: projectSymbols.totalSymbols,
      edges: projectSymbols.callEdges.length
    })

    // Step 4: Compute module dependencies
    let step4Result: Step4ModuleEdgesResult
    if (await isStepCacheValid(projectPath, 4)) {
      onProgress('Loading cached module dependencies...')
      const cached = await loadStepCache(projectPath, 4)
      if (cached) {
        step4Result = cached.data as Step4ModuleEdgesResult
        console.log('[SemanticAnalyzer] Loaded cached step 4')
      } else {
        step4Result = runStep4(step3Result.updatedModules, projectSymbols.callEdges, onProgress)
        await saveStepCache(projectPath, 4, step4Result)
      }
    } else {
      step4Result = runStep4(step3Result.updatedModules, projectSymbols.callEdges, onProgress)
      await saveStepCache(projectPath, 4, step4Result)
    }

    // Step 5: Compute domain dependencies
    let step5Result: Step5DomainEdgesResult
    if (await isStepCacheValid(projectPath, 5)) {
      onProgress('Loading cached domain dependencies...')
      const cached = await loadStepCache(projectPath, 5)
      if (cached) {
        step5Result = cached.data as Step5DomainEdgesResult
        console.log('[SemanticAnalyzer] Loaded cached step 5')
      } else {
        step5Result = runStep5(
          step3Result.domains,
          step3Result.updatedModules,
          step4Result.edges,
          onProgress
        )
        await saveStepCache(projectPath, 5, step5Result)
      }
    } else {
      step5Result = runStep5(
        step3Result.domains,
        step3Result.updatedModules,
        step4Result.edges,
        onProgress
      )
      await saveStepCache(projectPath, 5, step5Result)
    }

    // Step 6: Detect external dependencies (communicates-with)
    let step6Result: Step6ExternalDependenciesResult
    if (await isStepCacheValid(projectPath, 6)) {
      onProgress('Loading cached external dependencies...')
      const cached = await loadStepCache(projectPath, 6)
      if (cached) {
        step6Result = cached.data as unknown as Step6ExternalDependenciesResult
        console.log('[SemanticAnalyzer] Loaded cached step 6')
      } else {
        step6Result = await runStep6(
          projectPath,
          step2Result,
          step3Result,
          onProgress,
          onToolStart,
          onToolEnd
        )
        await saveStepCache(
          projectPath,
          6,
          step6Result as unknown as Step6ExternalDependenciesResult
        )
      }
    } else {
      step6Result = await runStep6(
        projectPath,
        step2Result,
        step3Result,
        onProgress,
        onToolStart,
        onToolEnd
      )
      await saveStepCache(projectPath, 6, step6Result as unknown as Step6ExternalDependenciesResult)
    }

    // Compute system edges from domain edges
    const systemEdges = computeSystemEdges(step3Result.domains, step5Result.edges)

    // Populate system children from domains (needed for system-level edge computation)
    populateSystemChildren(step1Result.systems, step3Result.domains)

    // Compute external edges (communicates-with)
    const externalEdges = computeExternalEdges(
      step6Result.externalDependencies,
      step3Result.updatedModules
    )
    const externalDomainEdges = computeExternalDomainEdges(
      step6Result.externalDependencies,
      step3Result.domains
    )
    const externalSystemEdges = computeExternalSystemEdges(
      step6Result.externalDependencies,
      step1Result.systems,
      step3Result.domains
    )

    // Build final analysis
    const analysis: SemanticAnalysis = {
      projectPath,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      systems: step1Result.systems,
      domains: step3Result.domains,
      modules: step3Result.updatedModules,
      edges: [
        ...step4Result.edges,
        ...step5Result.edges,
        ...systemEdges,
        ...externalEdges,
        ...externalDomainEdges,
        ...externalSystemEdges
      ]
    }

    onProgress('Analysis complete')

    return {
      success: true,
      analysis,
      cached: false,
      completedSteps: [1, 2, 3, 4, 5, 6]
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[SemanticAnalyzer] Analysis failed:', errorMessage)

    return {
      success: false,
      error: errorMessage,
      completedSteps: await getCompletedSteps(projectPath)
    }
  }
}

/**
 * Complete the analysis with symbol dependencies (steps 4-6)
 * This should be called after symbol extraction is complete
 */
export async function completeAnalysisWithSymbols(
  projectPath: string,
  projectSymbols: ProjectSymbols,
  onProgress: (status: string) => void = () => {}
): Promise<AnalysisResult> {
  console.log('[SemanticAnalyzer] Completing analysis with symbol data')

  try {
    // Load cached steps 1-3
    const step1Cache = await loadStepCache(projectPath, 1)
    const step2Cache = await loadStepCache(projectPath, 2)
    const step3Cache = await loadStepCache(projectPath, 3)

    if (!step1Cache || !step2Cache || !step3Cache) {
      return {
        success: false,
        error: 'Missing cached steps 1-3. Please run analyzeSemantics first.'
      }
    }

    const systems = (step1Cache.data as Step1SystemsResult).systems
    const modules = (step3Cache.data as Step3DomainsResult & { updatedModules: ModuleNode[] })
      .updatedModules
    const domains = (step3Cache.data as Step3DomainsResult).domains

    // Step 4: Compute module dependencies
    let step4Result: Step4ModuleEdgesResult
    if (await isStepCacheValid(projectPath, 4)) {
      onProgress('Loading cached module dependencies...')
      const cached = await loadStepCache(projectPath, 4)
      if (cached) {
        step4Result = cached.data as Step4ModuleEdgesResult
      } else {
        step4Result = runStep4(modules, projectSymbols.callEdges, onProgress)
        await saveStepCache(projectPath, 4, step4Result)
      }
    } else {
      step4Result = runStep4(modules, projectSymbols.callEdges, onProgress)
      await saveStepCache(projectPath, 4, step4Result)
    }

    // Step 5: Compute domain dependencies
    let step5Result: Step5DomainEdgesResult
    if (await isStepCacheValid(projectPath, 5)) {
      onProgress('Loading cached domain dependencies...')
      const cached = await loadStepCache(projectPath, 5)
      if (cached) {
        step5Result = cached.data as Step5DomainEdgesResult
      } else {
        step5Result = runStep5(domains, modules, step4Result.edges, onProgress)
        await saveStepCache(projectPath, 5, step5Result)
      }
    } else {
      step5Result = runStep5(domains, modules, step4Result.edges, onProgress)
      await saveStepCache(projectPath, 5, step5Result)
    }

    // Step 6: Load external dependencies (communicates-with)
    let step6Result: Step6ExternalDependenciesResult | null = null
    let externalEdges: SemanticEdge[] = []
    if (await isStepCacheValid(projectPath, 6)) {
      onProgress('Loading cached external dependencies...')
      const cached = await loadStepCache(projectPath, 6)
      if (cached) {
        step6Result = cached.data as unknown as Step6ExternalDependenciesResult
        externalEdges = computeExternalEdges(step6Result.externalDependencies, modules)
      }
    }

    // Compute system edges
    const systemEdges = computeSystemEdges(domains, step5Result.edges)

    // Build final analysis
    const analysis: SemanticAnalysis = {
      projectPath,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      systems,
      domains,
      modules,
      edges: [...step4Result.edges, ...step5Result.edges, ...systemEdges, ...externalEdges]
    }

    onProgress('Analysis complete')

    return {
      success: true,
      analysis,
      cached: false,
      completedSteps: step6Result ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[SemanticAnalyzer] Failed to complete analysis:', errorMessage)

    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * Get cached analysis without running LLM (fast)
 */
export async function getCachedAnalysis(projectPath: string): Promise<SemanticAnalysis | null> {
  if (!(await isStepAnalysisComplete(projectPath, 6))) {
    return null
  }

  try {
    const step1 = await loadStepCache(projectPath, 1)
    const step2 = await loadStepCache(projectPath, 2)
    const step3 = await loadStepCache(projectPath, 3)
    const step4 = await loadStepCache(projectPath, 4)
    const step5 = await loadStepCache(projectPath, 5)
    const step6 = await loadStepCache(projectPath, 6)

    if (!step1 || !step2 || !step3 || !step4 || !step5 || !step6) {
      return null
    }

    const systems = (step1.data as Step1SystemsResult).systems
    const modules = (step3.data as Step3DomainsResult & { updatedModules: ModuleNode[] })
      .updatedModules
    const domains = (step3.data as Step3DomainsResult).domains
    const moduleEdges = (step4.data as Step4ModuleEdgesResult).edges
    const domainEdges = (step5.data as Step5DomainEdgesResult).edges
    const step6Result = step6.data as unknown as Step6ExternalDependenciesResult

    // Populate system children from domains (needed for system-level edge computation)
    populateSystemChildren(systems, domains)

    const systemEdges = computeSystemEdges(domains, domainEdges)
    const externalEdges = computeExternalEdges(step6Result.externalDependencies, modules)
    const externalDomainEdges = computeExternalDomainEdges(
      step6Result.externalDependencies,
      domains
    )
    const externalSystemEdges = computeExternalSystemEdges(
      step6Result.externalDependencies,
      systems,
      domains
    )

    return {
      projectPath,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      systems,
      domains,
      modules,
      edges: [
        ...moduleEdges,
        ...domainEdges,
        ...systemEdges,
        ...externalEdges,
        ...externalDomainEdges,
        ...externalSystemEdges
      ]
    }
  } catch (error) {
    console.error('[SemanticAnalyzer] Error loading cached analysis:', error)
    return null
  }
}

/**
 * Check if valid semantic analysis cache exists
 */
export async function hasValidAnalysis(projectPath: string): Promise<boolean> {
  return await isStepAnalysisComplete(projectPath, 6)
}

/**
 * Get cache info for debugging/UI
 */
export async function getCacheInfo(projectPath: string): Promise<{
  exists: boolean
  valid: boolean
  lastUpdated: string | null
  fileCount: number
  completedSteps: AnalysisStep[]
}> {
  const manifest = await getStepCacheManifest(projectPath)
  const exists = manifest !== null

  if (!manifest) {
    return {
      exists: false,
      valid: false,
      lastUpdated: null,
      fileCount: 0,
      completedSteps: []
    }
  }

  const valid = await isStepAnalysisComplete(projectPath, 6)

  return {
    exists,
    valid,
    lastUpdated: manifest.lastUpdated,
    fileCount: manifest.fileCount,
    completedSteps: manifest.completedSteps
  }
}

/**
 * Invalidate (delete) the cache
 */
export async function invalidateCache(projectPath: string): Promise<void> {
  await invalidateStepCaches(projectPath)
}
