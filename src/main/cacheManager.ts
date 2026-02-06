/**
 * Cache Manager for Semantic Analysis
 *
 * Manages the .graph-ide/ directory that caches LLM-generated semantic nodes.
 * Handles cache creation, validation, and invalidation.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { walkDirectory } from './fileWalker'
import type {
  SemanticAnalysis,
  CacheManifest,
  AnalysisStep,
  StepCacheEntry,
  StepAnalysisCacheManifest,
  Step1SystemsResult,
  Step2ModulesResult,
  Step3DomainsResult,
  Step4ModuleEdgesResult,
  Step5DomainEdgesResult,
  Step6ExternalDependenciesResult
} from './types'

// =============================================================================
// CONSTANTS
// =============================================================================

const CACHE_DIR_NAME = '.graph-ide'
const MANIFEST_FILE = 'manifest.json'
const ANALYSIS_FILE = 'semantic-analysis.json'
const CACHE_VERSION = '1.0.0'

// =============================================================================
// PATH HELPERS
// =============================================================================

/**
 * Get the path to the .graph-ide directory for a project
 */
function getCacheDir(projectPath: string): string {
  return path.join(projectPath, CACHE_DIR_NAME)
}

/**
 * Get the path to the manifest file
 */
function getManifestPath(projectPath: string): string {
  return path.join(getCacheDir(projectPath), MANIFEST_FILE)
}

/**
 * Get the path to the semantic analysis file
 */
function getAnalysisPath(projectPath: string): string {
  return path.join(getCacheDir(projectPath), ANALYSIS_FILE)
}

// =============================================================================
// HASH UTILITIES
// =============================================================================

/**
 * Compute MD5 hash of a file's contents
 */
function computeFileHash(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath)
    return crypto.createHash('md5').update(content).digest('hex')
  } catch {
    return ''
  }
}

/**
 * Compute a hash representing the project structure
 * This is a quick check before doing per-file validation
 */
export async function computeProjectHash(projectPath: string): Promise<string> {
  try {
    // Get all TypeScript/JavaScript files
    const files = walkDirectory(projectPath, {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      excludeDirs: [
        'node_modules',
        '.git',
        'dist',
        'out',
        'build',
        '.next',
        'coverage',
        CACHE_DIR_NAME
      ]
    })

    // Sort files for consistent hashing
    files.sort()

    // Create a hash from file paths and their modification times
    const hashInput = files
      .map((file) => {
        try {
          const stat = fs.statSync(file)
          const relativePath = path.relative(projectPath, file)
          return `${relativePath}:${stat.mtimeMs}`
        } catch {
          return ''
        }
      })
      .join('|')

    return crypto.createHash('md5').update(hashInput).digest('hex')
  } catch (error) {
    console.error('[CacheManager] Error computing project hash:', error)
    return ''
  }
}

// =============================================================================
// CACHE INITIALIZATION
// =============================================================================

/**
 * Initialize the cache directory if it doesn't exist
 */
export async function initializeCache(projectPath: string): Promise<void> {
  const cacheDir = getCacheDir(projectPath)

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
    console.log('[CacheManager] Created cache directory:', cacheDir)
  }
}

// =============================================================================
// MANIFEST OPERATIONS
// =============================================================================

/**
 * Get the cache manifest if it exists
 */
export async function getCacheManifest(projectPath: string): Promise<CacheManifest | null> {
  const manifestPath = getManifestPath(projectPath)

  if (!fs.existsSync(manifestPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(manifestPath, 'utf-8')
    return JSON.parse(content) as CacheManifest
  } catch (error) {
    console.error('[CacheManager] Error reading manifest:', error)
    return null
  }
}

/**
 * Save the cache manifest
 */
async function saveManifest(projectPath: string, manifest: CacheManifest): Promise<void> {
  await initializeCache(projectPath)
  const manifestPath = getManifestPath(projectPath)

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  console.log('[CacheManager] Saved manifest')
}

/**
 * Create a new manifest from the current project state
 */
async function createManifest(projectPath: string): Promise<CacheManifest> {
  const files = walkDirectory(projectPath, {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    excludeDirs: [
      'node_modules',
      '.git',
      'dist',
      'out',
      'build',
      '.next',
      'coverage',
      CACHE_DIR_NAME
    ]
  })

  const fileHashes = files.map((file) => ({
    path: path.relative(projectPath, file),
    hash: computeFileHash(file)
  }))

  const projectHash = await computeProjectHash(projectPath)

  return {
    version: CACHE_VERSION,
    lastUpdated: new Date().toISOString(),
    projectHash,
    fileCount: files.length,
    files: fileHashes
  }
}

// =============================================================================
// CACHE VALIDATION
// =============================================================================

/**
 * Check if the cache is valid (no files have changed)
 * Returns true if cache is valid, false if invalidated
 */
export async function isCacheValid(projectPath: string): Promise<boolean> {
  const manifest = await getCacheManifest(projectPath)

  if (!manifest) {
    console.log('[CacheManager] No manifest found - cache invalid')
    return false
  }

  // Quick check: compare project hash
  const currentHash = await computeProjectHash(projectPath)
  if (currentHash !== manifest.projectHash) {
    console.log('[CacheManager] Project hash mismatch - cache invalid')
    return false
  }

  // Get current files
  const currentFiles = walkDirectory(projectPath, {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    excludeDirs: [
      'node_modules',
      '.git',
      'dist',
      'out',
      'build',
      '.next',
      'coverage',
      CACHE_DIR_NAME
    ]
  })

  // Check if file count changed
  if (currentFiles.length !== manifest.fileCount) {
    console.log('[CacheManager] File count changed - cache invalid')
    return false
  }

  // Build a map of manifest files for O(1) lookup
  const manifestFileMap = new Map<string, string>()
  for (const file of manifest.files) {
    manifestFileMap.set(file.path, file.hash)
  }

  // Check each current file against manifest
  for (const file of currentFiles) {
    const relativePath = path.relative(projectPath, file)
    const manifestHash = manifestFileMap.get(relativePath)

    if (!manifestHash) {
      console.log('[CacheManager] New file found:', relativePath)
      return false
    }

    const currentHash = computeFileHash(file)
    if (currentHash !== manifestHash) {
      console.log('[CacheManager] File changed:', relativePath)
      return false
    }
  }

  console.log('[CacheManager] Cache is valid')
  return true
}

// =============================================================================
// SEMANTIC ANALYSIS CACHE
// =============================================================================

/**
 * Load cached semantic analysis if it exists and is valid
 */
export async function loadSemanticAnalysis(projectPath: string): Promise<SemanticAnalysis | null> {
  const analysisPath = getAnalysisPath(projectPath)

  if (!fs.existsSync(analysisPath)) {
    console.log('[CacheManager] No cached analysis found')
    return null
  }

  // Check if cache is valid before returning
  const isValid = await isCacheValid(projectPath)
  if (!isValid) {
    console.log('[CacheManager] Cache is invalid, not loading')
    return null
  }

  try {
    const content = fs.readFileSync(analysisPath, 'utf-8')
    const analysis = JSON.parse(content) as SemanticAnalysis
    console.log('[CacheManager] Loaded cached analysis from', analysis.timestamp)
    return analysis
  } catch (error) {
    console.error('[CacheManager] Error reading analysis:', error)
    return null
  }
}

/**
 * Save semantic analysis to cache
 */
export async function saveSemanticAnalysis(
  projectPath: string,
  analysis: SemanticAnalysis
): Promise<void> {
  await initializeCache(projectPath)

  // Save the analysis
  const analysisPath = getAnalysisPath(projectPath)
  fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2), 'utf-8')
  console.log('[CacheManager] Saved semantic analysis')

  // Create and save a new manifest
  const manifest = await createManifest(projectPath)
  await saveManifest(projectPath, manifest)
}

// =============================================================================
// CACHE INVALIDATION
// =============================================================================

/**
 * Invalidate (delete) the cache
 */
export async function invalidateCache(projectPath: string): Promise<void> {
  const cacheDir = getCacheDir(projectPath)

  if (fs.existsSync(cacheDir)) {
    // Delete all files in the cache directory
    const files = fs.readdirSync(cacheDir)
    for (const file of files) {
      const filePath = path.join(cacheDir, file)
      fs.unlinkSync(filePath)
    }
    console.log('[CacheManager] Cache invalidated')
  }
}

/**
 * Check if cache exists (regardless of validity)
 */
export function cacheExists(projectPath: string): boolean {
  const analysisPath = getAnalysisPath(projectPath)
  return fs.existsSync(analysisPath)
}

/**
 * Get cache info for debugging/UI
 */
export async function getCacheInfo(projectPath: string): Promise<{
  exists: boolean
  valid: boolean
  lastUpdated: string | null
  fileCount: number
}> {
  const manifest = await getCacheManifest(projectPath)
  const exists = cacheExists(projectPath)

  if (!manifest || !exists) {
    return {
      exists: false,
      valid: false,
      lastUpdated: null,
      fileCount: 0
    }
  }

  const valid = await isCacheValid(projectPath)

  return {
    exists: true,
    valid,
    lastUpdated: manifest.lastUpdated,
    fileCount: manifest.fileCount
  }
}

// =============================================================================
// 5-STEP ANALYSIS PER-STEP CACHING
// =============================================================================

const STEP_MANIFEST_FILE = 'step-manifest.json'

/**
 * Get the path to the step manifest file
 */
function getStepManifestPath(projectPath: string): string {
  return path.join(getCacheDir(projectPath), STEP_MANIFEST_FILE)
}

/**
 * Get the path to a specific step cache file
 */
function getStepCachePath(projectPath: string, step: AnalysisStep): string {
  return path.join(getCacheDir(projectPath), `step-${step}-cache.json`)
}

/**
 * Get the step analysis cache manifest
 */
export async function getStepCacheManifest(
  projectPath: string
): Promise<StepAnalysisCacheManifest | null> {
  const manifestPath = getStepManifestPath(projectPath)

  if (!fs.existsSync(manifestPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(manifestPath, 'utf-8')
    return JSON.parse(content) as StepAnalysisCacheManifest
  } catch (error) {
    console.error('[CacheManager] Error reading step manifest:', error)
    return null
  }
}

/**
 * Save the step analysis cache manifest
 */
async function saveStepManifest(
  projectPath: string,
  manifest: StepAnalysisCacheManifest
): Promise<void> {
  await initializeCache(projectPath)
  const manifestPath = getStepManifestPath(projectPath)
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
}

/**
 * Initialize a new step cache manifest
 */
async function initializeStepManifest(projectPath: string): Promise<StepAnalysisCacheManifest> {
  const files = walkDirectory(projectPath, {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    excludeDirs: [
      'node_modules',
      '.git',
      'dist',
      'out',
      'build',
      '.next',
      'coverage',
      CACHE_DIR_NAME
    ]
  })

  const fileHashes = files.map((file) => ({
    path: path.relative(projectPath, file),
    hash: computeFileHash(file)
  }))

  const projectHash = await computeProjectHash(projectPath)

  const manifest: StepAnalysisCacheManifest = {
    version: CACHE_VERSION,
    lastUpdated: new Date().toISOString(),
    projectHash,
    fileCount: files.length,
    files: fileHashes,
    completedSteps: [],
    stepDependencies: {
      1: null,
      2: [1],
      3: [1, 2],
      4: [2],
      5: [3, 4],
      6: [2, 3]
    }
  }

  await saveStepManifest(projectPath, manifest)
  return manifest
}

/**
 * Check if a specific step's cache is valid
 * Returns true if:
 * 1. The step manifest exists and is valid
 * 2. The step is marked as completed
 * 3. All dependent steps are also cached
 */
export async function isStepCacheValid(projectPath: string, step: AnalysisStep): Promise<boolean> {
  const manifest = await getStepCacheManifest(projectPath)

  if (!manifest) {
    return false
  }

  // Check if project hash matches
  const currentHash = await computeProjectHash(projectPath)
  if (currentHash !== manifest.projectHash) {
    console.log(`[CacheManager] Step ${step}: Project hash mismatch`)
    return false
  }

  // Check if step is marked as completed
  if (!manifest.completedSteps.includes(step)) {
    return false
  }

  // Check if step cache file exists
  const stepPath = getStepCachePath(projectPath, step)
  if (!fs.existsSync(stepPath)) {
    return false
  }

  // Check if all dependencies are met
  const dependencies = manifest.stepDependencies[step]
  if (dependencies) {
    for (const depStep of dependencies) {
      if (!manifest.completedSteps.includes(depStep)) {
        console.log(`[CacheManager] Step ${step}: Missing dependency step ${depStep}`)
        return false
      }
    }
  }

  console.log(`[CacheManager] Step ${step}: Cache is valid`)
  return true
}

/**
 * Get completed steps from cache
 */
export async function getCompletedSteps(projectPath: string): Promise<AnalysisStep[]> {
  const manifest = await getStepCacheManifest(projectPath)
  return manifest?.completedSteps ?? []
}

/**
 * Load a specific step's cached result
 */
export async function loadStepCache(
  projectPath: string,
  step: AnalysisStep
): Promise<StepCacheEntry | null> {
  if (!(await isStepCacheValid(projectPath, step))) {
    return null
  }

  const stepPath = getStepCachePath(projectPath, step)

  try {
    const content = fs.readFileSync(stepPath, 'utf-8')
    const entry = JSON.parse(content) as StepCacheEntry
    console.log(`[CacheManager] Loaded step ${step} cache from`, entry.timestamp)
    return entry
  } catch (error) {
    console.error(`[CacheManager] Error reading step ${step} cache:`, error)
    return null
  }
}

/**
 * Save a step's result to cache
 */
export async function saveStepCache(
  projectPath: string,
  step: AnalysisStep,
  data:
    | Step1SystemsResult
    | Step2ModulesResult
    | Step3DomainsResult
    | Step4ModuleEdgesResult
    | Step5DomainEdgesResult
    | Step6ExternalDependenciesResult
): Promise<void> {
  await initializeCache(projectPath)

  // Get or create manifest
  let manifest = await getStepCacheManifest(projectPath)
  if (!manifest) {
    manifest = await initializeStepManifest(projectPath)
  }

  // Create cache entry
  const entry: StepCacheEntry = {
    step,
    timestamp: new Date().toISOString(),
    completed: true,
    projectHash: manifest.projectHash,
    data
  }

  // Save step cache file
  const stepPath = getStepCachePath(projectPath, step)
  fs.writeFileSync(stepPath, JSON.stringify(entry, null, 2), 'utf-8')
  console.log(`[CacheManager] Saved step ${step} cache`)

  // Update manifest with completed step
  if (!manifest.completedSteps.includes(step)) {
    manifest.completedSteps.push(step)
    manifest.completedSteps.sort((a, b) => a - b)
    manifest.lastUpdated = new Date().toISOString()
    await saveStepManifest(projectPath, manifest)
  }
}

/**
 * Invalidate all step caches (force full re-analysis)
 */
export async function invalidateStepCaches(projectPath: string): Promise<void> {
  const cacheDir = getCacheDir(projectPath)

  if (!fs.existsSync(cacheDir)) {
    return
  }

  // Delete step manifest
  const manifestPath = getStepManifestPath(projectPath)
  if (fs.existsSync(manifestPath)) {
    fs.unlinkSync(manifestPath)
  }

  // Delete all step cache files
  for (let step = 1; step <= 5; step++) {
    const stepPath = getStepCachePath(projectPath, step as AnalysisStep)
    if (fs.existsSync(stepPath)) {
      fs.unlinkSync(stepPath)
    }
  }

  console.log('[CacheManager] Step caches invalidated')
}

/**
 * Check if step analysis is complete (all steps up to maxStep cached)
 * @param projectPath Path to the project
 * @param maxStep Maximum step number to check (default 5, use 6 for including external deps)
 */
export async function isStepAnalysisComplete(
  projectPath: string,
  maxStep: number = 5
): Promise<boolean> {
  const manifest = await getStepCacheManifest(projectPath)

  if (!manifest) {
    return false
  }

  // Check if all steps up to maxStep are completed
  const requiredSteps = Array.from({ length: maxStep }, (_, i) => i + 1)
  return requiredSteps.every((step) => manifest.completedSteps.includes(step as AnalysisStep))
}
