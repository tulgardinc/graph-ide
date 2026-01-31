/**
 * Color Utilities
 *
 * Provides deterministic color generation for semantic nodes
 * to create visual hierarchy between zoom levels.
 *
 * NEW APPROACH:
 * - Consistent dark background for all semantic nodes (layers 1-3)
 * - Unique vibrant text colors to distinguish nodes
 * - Border colors for hierarchy indication
 */

// =============================================================================
// PREDEFINED TEXT COLOR PALETTE (10 vibrant, distinct colors)
// =============================================================================

/**
 * Curated text color palette - vibrant and glowing
 * These are carefully chosen to be distinct and readable on dark backgrounds
 */
const PREDEFINED_TEXT_HUES = [
  187, // Cyan (matches app accent)
  220, // Blue
  265, // Violet/Purple
  320, // Pink/Magenta
  0, // Red
  32, // Orange
  50, // Amber/Yellow
  140, // Emerald/Green
  165, // Teal
  290 // Fuchsia
]

// =============================================================================
// CONSTANTS
// =============================================================================

/** Consistent dark background for all semantic nodes (matches symbol node backgrounds) */
export const SEMANTIC_NODE_BACKGROUND = '#0f172a' // slate-900 (same as function symbols)

/** Consistent text color for all semantic nodes (off-white for readability) */
export const SEMANTIC_NODE_TEXT_COLOR = '#f1f5f9' // slate-100 (off-white)

/** Default border color for system nodes (slate) */
export const SYSTEM_BORDER_COLOR = '#475569' // slate-600

/** Border color for unclassified/unmapped symbols */
export const UNCLASSIFIED_BORDER_COLOR = '#71717a' // zinc-500 - neutral gray

/** Text color for unclassified symbols */
export const UNCLASSIFIED_TEXT_COLOR = '#a1a1aa' // zinc-400

// Text color generation parameters - vibrant and glowing
const TEXT_SATURATION = { min: 75, max: 90 } // High saturation for vibrancy
const TEXT_LIGHTNESS = { min: 60, max: 72 } // Bright enough to glow on dark bg

// =============================================================================
// HASH FUNCTION
// =============================================================================

/**
 * Simple string hash function (djb2 algorithm)
 * Produces a consistent numeric hash for any string
 */
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) + hash + char // hash * 33 + char
  }
  return Math.abs(hash)
}

/**
 * Convert hash to a value within a range
 */
function hashToRange(hash: number, min: number, max: number): number {
  return min + (hash % (max - min + 1))
}

// =============================================================================
// COLOR GENERATION
// =============================================================================

export interface NodeColors {
  /** Background color (consistent for all semantic nodes) */
  background: string
  /** Text color (unique per node - vibrant/glowing) */
  text: string
  /** Raw hue value (for deriving related colors like borders) */
  hue: number
}

/**
 * Generate unique, deterministic colors for a node based on its ID
 *
 * Uses consistent dark background + unique vibrant text color
 *
 * @param nodeId - Unique identifier for the node (e.g., "system:frontend")
 * @returns Colors object with background, text, and hue values
 */
export function generateNodeColors(nodeId: string): NodeColors {
  const hash = hashString(nodeId)
  const paletteIndex = hash % PREDEFINED_TEXT_HUES.length

  // Get base hue from predefined palette
  let hue = PREDEFINED_TEXT_HUES[paletteIndex]

  // Add slight variation based on hash to make similar IDs distinguishable
  const hueVariation = ((hash >> 8) % 20) - 10 // -10 to +10 degrees
  hue = (hue + hueVariation + 360) % 360

  // Generate vibrant text color
  const textSaturation = hashToRange(hash >> 12, TEXT_SATURATION.min, TEXT_SATURATION.max)
  const textLightness = hashToRange(hash >> 20, TEXT_LIGHTNESS.min, TEXT_LIGHTNESS.max)

  return {
    background: SEMANTIC_NODE_BACKGROUND,
    text: SEMANTIC_NODE_TEXT_COLOR, // Consistent text color for all semantic nodes
    hue
  }
}

/**
 * Generate a vibrant border color from a hue
 * Uses high saturation and medium lightness for a glowing effect
 *
 * @param hue - Base hue value
 * @returns Border color string
 */
export function generateBorderFromHue(hue: number): string {
  return `hsl(${hue}, 85%, 50%)`
}

/**
 * Convert HSL text color to a suitable border color
 * Uses the same hue with high saturation for vibrancy
 *
 * @param nodeId - Node ID to generate color from
 * @returns Border color string
 */
export function generateBorderColor(nodeId: string): string {
  const { hue } = generateNodeColors(nodeId)
  return generateBorderFromHue(hue)
}

/**
 * Generate a transparent background color from a node ID
 * Uses the same hue as the border but with transparency
 *
 * @param nodeId - Node ID to generate color from
 * @param alpha - Alpha value (0-1), defaults to 0.2
 * @returns HSLA color string
 */
export function generateTransparentBackground(nodeId: string, alpha: number = 0.2): string {
  const { hue } = generateNodeColors(nodeId)
  return `hsla(${hue}, 85%, 50%, ${alpha})`
}

// =============================================================================
// COLOR MAP BUILDER
// =============================================================================

export interface ColorMapEntry {
  background: string
  text: string
  border: string
}

export type ColorMap = Map<string, ColorMapEntry>

/**
 * Build a color map for semantic nodes with parent-child border inheritance
 *
 * Background is consistent (dark slate)
 * Text colors are unique per node (vibrant/glowing)
 * Border colors indicate hierarchy (parent's text color)
 *
 * @param systems - System nodes (layer 1)
 * @param domains - Domain nodes (layer 2)
 * @param modules - Module nodes (layer 3)
 * @returns Map of nodeId → colors
 */
export function buildColorMap(
  systems: Array<{ id: string; children?: string[] }>,
  domains: Array<{ id: string; parentId?: string; children?: string[] }>,
  modules: Array<{ id: string; parentId?: string }>
): ColorMap {
  const colorMap: ColorMap = new Map()

  // First pass: compute unique border colors for all nodes based on their hue
  const nodeBorders = new Map<string, string>()

  for (const system of systems) {
    nodeBorders.set(system.id, generateBorderColor(system.id))
  }
  for (const domain of domains) {
    nodeBorders.set(domain.id, generateBorderColor(domain.id))
  }
  for (const module of modules) {
    nodeBorders.set(module.id, generateBorderColor(module.id))
  }

  // Process systems (border = slate since no parent)
  for (const system of systems) {
    const colors = generateNodeColors(system.id)
    colorMap.set(system.id, {
      background: colors.background,
      text: colors.text,
      border: SYSTEM_BORDER_COLOR
    })
  }

  // Process domains (border = parent system's unique border color)
  for (const domain of domains) {
    const colors = generateNodeColors(domain.id)
    let border = SYSTEM_BORDER_COLOR // fallback

    // Find parent system's border color
    if (domain.parentId) {
      border = nodeBorders.get(domain.parentId) || SYSTEM_BORDER_COLOR
    } else {
      const parentSystem = systems.find((s) => s.children?.includes(domain.id))
      if (parentSystem) {
        border = nodeBorders.get(parentSystem.id) || SYSTEM_BORDER_COLOR
      }
    }

    colorMap.set(domain.id, {
      background: colors.background,
      text: colors.text,
      border
    })
  }

  // Process modules (border = parent domain's unique border color)
  for (const module of modules) {
    const colors = generateNodeColors(module.id)
    let border = SYSTEM_BORDER_COLOR // fallback

    // Find parent domain's border color
    if (module.parentId) {
      border = nodeBorders.get(module.parentId) || SYSTEM_BORDER_COLOR
    } else {
      const parentDomain = domains.find((d) => d.children?.includes(module.id))
      if (parentDomain) {
        border = nodeBorders.get(parentDomain.id) || SYSTEM_BORDER_COLOR
      }
    }

    colorMap.set(module.id, {
      background: colors.background,
      text: colors.text,
      border
    })
  }

  return colorMap
}

/**
 * Get colors for a symbol based on its parent construct
 *
 * @param constructId - The construct/module this symbol belongs to (or undefined if unclassified)
 * @param colorMap - Pre-built color map
 * @returns Border color for the symbol
 */
export function getSymbolBorderColor(constructId: string | undefined, colorMap: ColorMap): string {
  if (!constructId) {
    return UNCLASSIFIED_BORDER_COLOR
  }

  // Generate unique border color from construct ID (since text colors are now consistent)
  return generateBorderColor(constructId)
}
