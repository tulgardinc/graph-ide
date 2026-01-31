/**
 * Color Utilities
 *
 * Provides deterministic color generation for semantic nodes
 * to create visual hierarchy between zoom levels.
 *
 * Colors are designed for a dark theme (slate-950 background)
 * with cyan accent (#22d3ee).
 */

// =============================================================================
// PREDEFINED COLOR PALETTE (10 vibrant, distinct colors)
// =============================================================================

/**
 * Curated color palette for first 10 nodes of each type
 * These are carefully chosen to be distinct and work well on dark backgrounds
 *
 * Each color has:
 * - hue: Base hue value
 * - bgSat: Background saturation (higher = more vibrant)
 * - bgLight: Background lightness (dark but visible)
 */
const PREDEFINED_PALETTE = [
  { hue: 187, bgSat: 85, bgLight: 42 }, // Cyan (matches accent) - GLOWING
  { hue: 220, bgSat: 80, bgLight: 40 }, // Blue - GLOWING
  { hue: 265, bgSat: 75, bgLight: 42 }, // Violet/Purple - GLOWING
  { hue: 320, bgSat: 80, bgLight: 40 }, // Pink/Magenta - GLOWING
  { hue: 0, bgSat: 75, bgLight: 42 }, // Red - GLOWING
  { hue: 32, bgSat: 85, bgLight: 45 }, // Orange - GLOWING
  { hue: 50, bgSat: 80, bgLight: 48 }, // Amber/Yellow - GLOWING (higher for visibility)
  { hue: 140, bgSat: 70, bgLight: 38 }, // Emerald/Green - GLOWING
  { hue: 165, bgSat: 75, bgLight: 40 }, // Teal - GLOWING
  { hue: 290, bgSat: 70, bgLight: 42 } // Fuchsia - GLOWING
]

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default border color for system nodes (slate) */
export const SYSTEM_BORDER_COLOR = '#475569'

/** Border color for unclassified/unmapped symbols */
export const UNCLASSIFIED_BORDER_COLOR = '#71717a' // zinc-500 - neutral gray

/** Text color for unclassified symbols */
export const UNCLASSIFIED_TEXT_COLOR = '#a1a1aa' // zinc-400

// HSL ranges for randomly generated colors (beyond the first 10)
const RANDOM_HUE_STEPS = [15, 45, 75, 105, 135, 195, 225, 255, 285, 315, 345] // Avoid clustering
const RANDOM_SATURATION = { min: 55, max: 75 } // Higher saturation for vibrancy
const RANDOM_LIGHTNESS = { min: 18, max: 24 } // Dark backgrounds

// Text colors - always light for contrast on dark backgrounds
const TEXT_SATURATION = { min: 60, max: 80 }
const TEXT_LIGHTNESS = { min: 78, max: 88 }

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
  /** Background color (HSL string) */
  background: string
  /** Text color (HSL string) */
  text: string
  /** Raw hue value (for deriving related colors) */
  hue: number
}

/**
 * Generate unique, deterministic colors for a node based on its ID
 *
 * Uses predefined colors for the first 10 nodes (by hash index),
 * then generates random saturated colors for additional nodes.
 *
 * @param nodeId - Unique identifier for the node (e.g., "system:frontend")
 * @returns Colors object with background, text, and hue values
 */
export function generateNodeColors(nodeId: string): NodeColors {
  const hash = hashString(nodeId)
  const paletteIndex = hash % PREDEFINED_PALETTE.length

  let hue: number
  let bgSaturation: number
  let bgLightness: number

  // Use predefined palette based on hash
  const palette = PREDEFINED_PALETTE[paletteIndex]
  hue = palette.hue
  bgSaturation = palette.bgSat
  bgLightness = palette.bgLight

  // Add slight variation based on hash to make similar IDs distinguishable
  const hueVariation = ((hash >> 8) % 15) - 7 // -7 to +7 degrees
  const satVariation = ((hash >> 16) % 10) - 5 // -5 to +5 %
  const lightVariation = ((hash >> 24) % 6) - 3 // -3 to +3 %

  hue = (hue + hueVariation + 360) % 360
  bgSaturation = Math.max(65, Math.min(90, bgSaturation + satVariation)) // Higher saturation for glow
  bgLightness = Math.max(35, Math.min(52, bgLightness + lightVariation)) // Brighter for glow effect

  // Text uses same hue but much lighter for readability
  const textSaturation = hashToRange(hash >> 12, TEXT_SATURATION.min, TEXT_SATURATION.max)
  const textLightness = hashToRange(hash >> 20, TEXT_LIGHTNESS.min, TEXT_LIGHTNESS.max)

  return {
    background: `hsl(${hue}, ${bgSaturation}%, ${bgLightness}%)`,
    text: `hsl(${hue}, ${textSaturation}%, ${textLightness}%)`,
    hue
  }
}

/**
 * Convert HSL background to a suitable border color
 * Uses the same hue with higher saturation and lightness for vibrancy
 *
 * @param nodeId - Node ID to generate color from
 * @returns Border color string
 */
export function generateBorderColor(nodeId: string): string {
  const { hue } = generateNodeColors(nodeId)
  // Border is vibrant: high saturation and medium-high lightness
  return `hsl(${hue}, 80%, 55%)`
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

  // Process systems (border = slate)
  for (const system of systems) {
    const colors = generateNodeColors(system.id)
    colorMap.set(system.id, {
      background: colors.background,
      text: colors.text,
      border: SYSTEM_BORDER_COLOR
    })
  }

  // Process domains (border = parent system's background)
  for (const domain of domains) {
    const colors = generateNodeColors(domain.id)
    let border = SYSTEM_BORDER_COLOR // fallback

    // Find parent system's color for border
    if (domain.parentId) {
      const parentEntry = colorMap.get(domain.parentId)
      if (parentEntry) {
        border = parentEntry.background
      }
    } else {
      // Derive parent from systems' children arrays
      const parentSystem = systems.find((s) => s.children?.includes(domain.id))
      if (parentSystem) {
        const parentEntry = colorMap.get(parentSystem.id)
        if (parentEntry) {
          border = parentEntry.background
        }
      }
    }

    colorMap.set(domain.id, {
      background: colors.background,
      text: colors.text,
      border
    })
  }

  // Process modules (border = parent domain's background)
  for (const module of modules) {
    const colors = generateNodeColors(module.id)
    let border = SYSTEM_BORDER_COLOR // fallback

    // Find parent domain's color for border
    if (module.parentId) {
      const parentEntry = colorMap.get(module.parentId)
      if (parentEntry) {
        border = parentEntry.background
      }
    } else {
      // Derive parent from domains' children arrays
      const parentDomain = domains.find((d) => d.children?.includes(module.id))
      if (parentDomain) {
        const parentEntry = colorMap.get(parentDomain.id)
        if (parentEntry) {
          border = parentEntry.background
        }
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

  const entry = colorMap.get(constructId)
  if (!entry) {
    return UNCLASSIFIED_BORDER_COLOR
  }

  // Symbol border = construct's background color
  return entry.background
}
