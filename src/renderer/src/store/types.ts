import type { ElkLayoutOptions } from '../lib/elkLayout'

// =============================================================================
// ZOOM LEVEL TYPES
// =============================================================================

// All possible levels including internal views
export type ZoomLevel = 'system' | 'domain' | 'module' | 'symbol'

// Levels shown in the zoom navigator (symbol is accessed via module double-click)
export const ZOOM_LEVELS: ZoomLevel[] = ['system', 'domain', 'module']

// All levels including internal views
export const ALL_ZOOM_LEVELS: ZoomLevel[] = ['system', 'domain', 'module', 'symbol']

export const ZOOM_LEVEL_LABELS: Record<ZoomLevel, string> = {
  system: 'System',
  domain: 'Domain',
  module: 'Module',
  symbol: 'Symbol'
}

// Layout options per zoom level
export const LAYOUT_OPTIONS: Record<ZoomLevel, ElkLayoutOptions> = {
  system: { direction: 'RIGHT', nodeSpacing: 80, layerSpacing: 120 },
  domain: { direction: 'DOWN', nodeSpacing: 40, layerSpacing: 80 },
  module: { direction: 'DOWN', nodeSpacing: 50, layerSpacing: 100 },
  symbol: { direction: 'DOWN', nodeSpacing: 20, layerSpacing: 40 }
}
