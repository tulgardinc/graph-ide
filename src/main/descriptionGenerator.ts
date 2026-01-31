/**
 * Description Generator
 *
 * Generates detailed markdown descriptions for semantic nodes using LLM.
 * - Eager generation for system and domain layers (starts after semantic analysis)
 * - Lazy generation for construct/module layer (on-demand when user opens details)
 *
 * Descriptions are cached to disk at: .graph-ide/llm-outputs/{node-id}.md
 */

import * as fs from 'fs'
import * as path from 'path'
import { sendMessageWithTools } from './llmClient'
import type { SemanticAnalysis, SystemNode, DomainNode, ModuleNode } from './types'

// =============================================================================
// CONSTANTS
// =============================================================================

const CACHE_DIR_NAME = '.graph-ide'
const OUTPUTS_DIR_NAME = 'llm-outputs'

// =============================================================================
// TYPES
// =============================================================================

export type SemanticLayer = 'system' | 'domain' | 'module'

export interface GenerationCallbacks {
  onStart?: (nodeId: string) => void
  onComplete?: (nodeId: string, content: string) => void
  onError?: (nodeId: string, error: string) => void
  onProgress?: (nodeId: string, status: string) => void
}

interface GenerationQueueItem {
  nodeId: string
  layer: SemanticLayer
  priority: number // Lower = higher priority
}

// =============================================================================
// QUEUE STATE
// =============================================================================

let generationQueue: GenerationQueueItem[] = []
let isProcessing = false
let currentProjectPath: string | null = null
let currentAnalysis: SemanticAnalysis | null = null
let callbacks: GenerationCallbacks = {}

// Memory cache for descriptions (nodeId -> markdown content)
const memoryCache = new Map<string, string>()

// =============================================================================
// PATH HELPERS
// =============================================================================

/**
 * Get the path to the llm-outputs directory
 */
function getOutputsDir(projectPath: string): string {
  return path.join(projectPath, CACHE_DIR_NAME, OUTPUTS_DIR_NAME)
}

/**
 * Get the path to a description file for a node
 * Node IDs like "system:frontend" become "system-frontend.md"
 */
function getDescriptionPath(projectPath: string, nodeId: string): string {
  const safeFileName = nodeId.replace(/:/g, '-') + '.md'
  return path.join(getOutputsDir(projectPath), safeFileName)
}

/**
 * Ensure the outputs directory exists
 */
function ensureOutputsDir(projectPath: string): void {
  const outputsDir = getOutputsDir(projectPath)
  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true })
    console.log('[DescriptionGenerator] Created outputs directory:', outputsDir)
  }
}

// =============================================================================
// CACHE OPERATIONS
// =============================================================================

/**
 * Load a description from disk cache
 */
export function loadDescriptionFromDisk(projectPath: string, nodeId: string): string | null {
  const filePath = getDescriptionPath(projectPath, nodeId)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch (error) {
    console.error('[DescriptionGenerator] Error reading description:', error)
    return null
  }
}

/**
 * Save a description to disk cache
 */
function saveDescriptionToDisk(projectPath: string, nodeId: string, content: string): void {
  ensureOutputsDir(projectPath)
  const filePath = getDescriptionPath(projectPath, nodeId)

  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    console.log('[DescriptionGenerator] Saved description:', nodeId)
  } catch (error) {
    console.error('[DescriptionGenerator] Error saving description:', error)
  }
}

/**
 * Get a description from memory cache, disk cache, or null
 */
export function getCachedDescription(projectPath: string, nodeId: string): string | null {
  // Check memory cache first
  if (memoryCache.has(nodeId)) {
    return memoryCache.get(nodeId)!
  }

  // Check disk cache
  const diskContent = loadDescriptionFromDisk(projectPath, nodeId)
  if (diskContent) {
    // Populate memory cache
    memoryCache.set(nodeId, diskContent)
    return diskContent
  }

  return null
}

/**
 * Check if a description exists (either in memory or disk)
 */
export function hasDescription(projectPath: string, nodeId: string): boolean {
  return getCachedDescription(projectPath, nodeId) !== null
}

/**
 * Clear the memory cache (useful when project changes)
 */
export function clearMemoryCache(): void {
  memoryCache.clear()
  console.log('[DescriptionGenerator] Memory cache cleared')
}

// =============================================================================
// PROMPT GENERATION
// =============================================================================

/**
 * Map internal layer names to user-facing terminology
 */
function getLayerDisplayName(layer: SemanticLayer): string {
  switch (layer) {
    case 'system':
      return 'System'
    case 'domain':
      return 'Layer'
    case 'module':
      return 'Construct'
    default:
      return layer
  }
}

/**
 * Get the system prompt for description generation
 */
function getSystemPrompt(): string {
  return `You are an expert software architect writing documentation for a codebase visualization tool. Your task is to describe the PURPOSE of architectural components - what they do and why they exist.

## Core Principles

1. **Focus on PURPOSE**: Describe WHAT the component does and WHY it exists, not HOW it's implemented
2. **Be concise**: 1-2 short paragraphs maximum. Communicate what is necessary and no more
3. **Avoid implementation details**: Don't mention specific file structures, code patterns, or technical minutiae
4. **For System-level nodes**: It is IMPERATIVE to accurately describe what the system actually does and what purpose it serves in the architecture

## Semantic Hierarchy

The codebase is organized into 4 layers:
- **System**: High-level architectural boundaries (e.g., "Frontend", "Backend API")
- **Layer**: Business/logical groupings within a system (e.g., "User Management", "Authentication")  
- **Construct**: Logical code groupings within a layer (e.g., "Auth Service", "User Validators")
- **Symbol**: Individual code symbols (functions, classes, etc.)

## Using Tools

You have access to tools to explore the codebase:
- **list_files**: See directory structure
- **read_file**: Read file contents
- **search_codebase**: Find patterns/keywords
- **get_file_symbols**: See what files export

Use these tools to understand the code's purpose. Only explore what's necessary.

## Output Format - CRITICAL

Your response MUST follow this EXACT format:

\`\`\`
# [Component Name]

[1-2 paragraph description of what it does and why it exists]
\`\`\`

**STRICT RULES**:
- START immediately with a markdown title (# Title)
- Followed by the description content
- NO preamble like "Based on my exploration..." or "Here's the description..."
- NO explanations about your process, reasoning, or what you discovered
- NO meta-commentary about the task or your understanding
- ONLY the title and description - nothing else
- This output is displayed DIRECTLY to users - any extra text will appear in the UI`
}

/**
 * Build the user prompt for a specific node
 */
function buildUserPrompt(
  node: SystemNode | DomainNode | ModuleNode,
  analysis: SemanticAnalysis
): string {
  const layer = node.layer
  const displayName = getLayerDisplayName(layer)
  const childrenInfo = node.children.length > 0 ? node.children.join(', ') : 'none'

  // Get parent info for Layers and Constructs
  let parentInfo = ''
  if ('parentId' in node && node.parentId) {
    parentInfo = `\n**Parent**: ${node.parentId}`
  }

  // Get mappings for Constructs
  let mappingsInfo = ''
  if (layer === 'module' && 'mappings' in node && node.mappings) {
    const m = node.mappings
    const parts: string[] = []
    if (m.directories?.length) parts.push(`Directories: ${m.directories.join(', ')}`)
    if (m.files?.length) parts.push(`Files: ${m.files.join(', ')}`)
    if (m.symbols?.length) parts.push(`Symbols: ${m.symbols.join(', ')}`)
    if (parts.length > 0) {
      mappingsInfo = `\n**Code Mappings**:\n${parts.map((p) => `- ${p}`).join('\n')}`
    }
  }

  // Build context summary with correct terminology
  const contextSummary = `
**Project Overview**:
- ${analysis.systems.length} System(s): ${analysis.systems.map((s) => s.name).join(', ')}
- ${analysis.domains.length} Layer(s): ${analysis.domains.map((d) => d.name).join(', ')}
- ${analysis.modules.length} Construct(s): ${analysis.modules.map((m) => m.name).join(', ')}
`

  // Special emphasis for System-level nodes
  const systemEmphasis =
    layer === 'system'
      ? `\n\n**IMPORTANT**: This is a System-level node. Accurately describe what this system actually does and what purpose it serves in the overall architecture.`
      : ''

  return `Describe the PURPOSE of this ${displayName}:

**Name**: ${node.name}
**ID**: ${node.id}
**Current Summary**: ${node.summary || 'No summary yet'}${parentInfo}
**Contains**: ${childrenInfo}${mappingsInfo}

${contextSummary}${systemEmphasis}

Explore the codebase as needed to understand what this ${displayName} does.

**Output exactly this format - nothing else:**
# ${node.name}

[Your 1-2 paragraph description here]

Remember: NO preamble, NO explanations about your process, NO "Here's the description" - just the title and description.`
}

// =============================================================================
// GENERATION LOGIC
// =============================================================================

/**
 * Generate a description for a single node
 */
async function generateDescription(
  nodeId: string,
  projectPath: string,
  analysis: SemanticAnalysis
): Promise<string> {
  // Find the node
  const node =
    analysis.systems.find((n) => n.id === nodeId) ||
    analysis.domains.find((n) => n.id === nodeId) ||
    analysis.modules.find((n) => n.id === nodeId)

  if (!node) {
    throw new Error(`Node not found: ${nodeId}`)
  }

  const systemPrompt = getSystemPrompt()
  const userPrompt = buildUserPrompt(node, analysis)

  return new Promise((resolve, reject) => {
    let responseText = ''

    sendMessageWithTools(
      {
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
        projectPath,
        maxTokens: 4096,
        finalResponseOnly: true
      },
      // onChunk
      () => {
        // We use onComplete for the full response
      },
      // onError
      (error) => {
        reject(error)
      },
      // onComplete
      (response) => {
        responseText = response.trim()
        resolve(responseText)
      },
      // onToolStart
      (toolName, description) => {
        console.log(`[DescriptionGenerator] ${nodeId}: Tool ${toolName} - ${description}`)
        callbacks.onProgress?.(nodeId, `Exploring: ${description}`)
      },
      // onToolEnd
      () => {
        // Tool completed
      }
    )
  })
}

/**
 * Process the next item in the queue
 */
async function processQueue(): Promise<void> {
  if (isProcessing || generationQueue.length === 0) {
    return
  }

  if (!currentProjectPath || !currentAnalysis) {
    console.error('[DescriptionGenerator] Cannot process queue: no project or analysis')
    return
  }

  isProcessing = true

  // Sort queue by priority (lower = higher priority)
  generationQueue.sort((a, b) => a.priority - b.priority)

  const item = generationQueue.shift()!
  const { nodeId } = item

  console.log(`[DescriptionGenerator] Processing: ${nodeId} (${generationQueue.length} remaining)`)
  callbacks.onStart?.(nodeId)

  try {
    const content = await generateDescription(nodeId, currentProjectPath, currentAnalysis)

    // Save to both caches
    memoryCache.set(nodeId, content)
    saveDescriptionToDisk(currentProjectPath, nodeId, content)

    callbacks.onComplete?.(nodeId, content)
    console.log(`[DescriptionGenerator] Completed: ${nodeId}`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[DescriptionGenerator] Failed: ${nodeId}`, errorMsg)
    callbacks.onError?.(nodeId, errorMsg)
  }

  isProcessing = false

  // Process next item
  if (generationQueue.length > 0) {
    // Small delay between requests to avoid rate limiting
    setTimeout(() => processQueue(), 500)
  }
}

/**
 * Add a node to the generation queue if not already cached
 */
function queueNode(nodeId: string, layer: SemanticLayer, priority: number): boolean {
  if (!currentProjectPath) return false

  // Skip if already cached
  if (hasDescription(currentProjectPath, nodeId)) {
    console.log(`[DescriptionGenerator] Skipping ${nodeId} (already cached)`)
    return false
  }

  // Skip if already in queue
  if (generationQueue.some((item) => item.nodeId === nodeId)) {
    console.log(`[DescriptionGenerator] Skipping ${nodeId} (already queued)`)
    return false
  }

  generationQueue.push({ nodeId, layer, priority })
  console.log(`[DescriptionGenerator] Queued: ${nodeId} (priority ${priority})`)
  return true
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Initialize the description generator with project context
 */
export function initializeGenerator(
  projectPath: string,
  analysis: SemanticAnalysis,
  generationCallbacks: GenerationCallbacks = {}
): void {
  currentProjectPath = projectPath
  currentAnalysis = analysis
  callbacks = generationCallbacks
  generationQueue = []
  isProcessing = false

  console.log('[DescriptionGenerator] Initialized for project:', projectPath)
}

/**
 * Start eager generation for system and domain layers
 * Priority: systems (1) before domains (2)
 */
export function startEagerGeneration(): void {
  if (!currentAnalysis) {
    console.error('[DescriptionGenerator] Cannot start: no analysis loaded')
    return
  }

  console.log('[DescriptionGenerator] Starting eager generation...')

  // Queue all systems (priority 1)
  for (const system of currentAnalysis.systems) {
    queueNode(system.id, 'system', 1)
  }

  // Queue all domains (priority 2)
  for (const domain of currentAnalysis.domains) {
    queueNode(domain.id, 'domain', 2)
  }

  // Start processing
  processQueue()
}

/**
 * Request a description for a specific node (lazy generation for constructs)
 * Returns the cached content if available, otherwise queues for generation
 */
export function requestDescription(nodeId: string): string | null {
  if (!currentProjectPath || !currentAnalysis) {
    console.error('[DescriptionGenerator] Cannot request: no project or analysis')
    return null
  }

  // Check cache first
  const cached = getCachedDescription(currentProjectPath, nodeId)
  if (cached) {
    return cached
  }

  // Determine layer from ID
  let layer: SemanticLayer = 'module'
  if (nodeId.startsWith('system:')) {
    layer = 'system'
  } else if (nodeId.startsWith('domain:')) {
    layer = 'domain'
  }

  // Queue with high priority (0) for on-demand requests
  queueNode(nodeId, layer, 0)
  processQueue()

  return null
}

/**
 * Get the current queue status
 */
export function getQueueStatus(): {
  isProcessing: boolean
  queueLength: number
  currentItem: string | null
} {
  return {
    isProcessing,
    queueLength: generationQueue.length,
    currentItem: isProcessing && generationQueue.length > 0 ? generationQueue[0].nodeId : null
  }
}

/**
 * Check if a node is currently being generated or queued
 */
export function isGenerating(nodeId: string): boolean {
  return generationQueue.some((item) => item.nodeId === nodeId)
}

/**
 * Stop all generation (clears queue)
 */
export function stopGeneration(): void {
  generationQueue = []
  console.log('[DescriptionGenerator] Generation stopped, queue cleared')
}
