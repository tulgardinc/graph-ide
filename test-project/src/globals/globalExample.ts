/**
 * Example file demonstrating global variable dependencies
 * This file is used for manual testing and verification of the
 * global variable read/write detection feature.
 */

// ============================================================================
// GLOBAL VARIABLES (Module-level constants and variables)
// ============================================================================

/** API base URL - should be read-only */
export const API_BASE_URL = 'https://api.example.com'

/** Request timeout in milliseconds */
export const DEFAULT_TIMEOUT = 5000

/** Mutable counter for tracking requests */
export let requestCount = 0

/** Configuration object */
export const config = {
  debug: false,
  maxRetries: 3
}

// ============================================================================
// FUNCTIONS THAT READ GLOBAL VARIABLES
// ============================================================================

/**
 * Makes an API request using the global API_BASE_URL
 * Expected edge: makeRequest -> API_BASE_URL (global-read)
 */
export function makeRequest(endpoint: string): string {
  return `${API_BASE_URL}${endpoint}`
}

/**
 * Gets the configured timeout
 * Expected edge: getTimeout -> DEFAULT_TIMEOUT (global-read)
 */
export function getTimeout(): number {
  return DEFAULT_TIMEOUT
}

/**
 * Gets current request stats
 * Expected edge: getStats -> requestCount (global-read)
 * Expected edge: getStats -> config (global-read)
 */
export function getStats() {
  return {
    count: requestCount,
    debug: config.debug
  }
}

// ============================================================================
// FUNCTIONS THAT WRITE GLOBAL VARIABLES
// ============================================================================

/**
 * Increments the request counter using ++
 * Expected edge: trackRequest -> requestCount (global-write)
 */
export function trackRequest(): void {
  requestCount++
}

/**
 * Resets the request counter using assignment
 * Expected edge: resetCounter -> requestCount (global-write)
 */
export function resetCounter(): void {
  requestCount = 0
}

/**
 * Adds to the request counter using +=
 * Expected edge: addToCounter -> requestCount (global-write)
 */
export function addToCounter(amount: number): void {
  requestCount += amount
}

// ============================================================================
// FUNCTIONS THAT BOTH READ AND WRITE
// ============================================================================

/**
 * Doubles the request counter (reads then writes)
 * Expected edges:
 *   - doubleCounter -> requestCount (global-read)
 *   - doubleCounter -> requestCount (global-write)
 */
export function doubleCounter(): void {
  const current = requestCount // read
  requestCount = current * 2 // write
}

// ============================================================================
// FUNCTIONS WITH LOCAL VARIABLES (should NOT create global edges)
// ============================================================================

/**
 * Uses only local variables - should NOT have any global-read/write edges
 */
export function localOnly(): number {
  const localCounter = 0
  const localConfig = { debug: true }
  return localCounter + (localConfig.debug ? 1 : 0)
}

/**
 * Uses function parameters - should NOT create global edges for params
 */
export function useParams(data: string, count: number): string {
  return `${data}: ${count}`
}
