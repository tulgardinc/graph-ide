import type { ElkLayoutOptions } from '../lib/elkLayout'

// =============================================================================
// ZOOM LEVEL TYPES
// =============================================================================

export type ZoomLevel = 'system' | 'domain' | 'module' | 'symbol'

export const ZOOM_LEVELS: ZoomLevel[] = ['system', 'domain', 'module', 'symbol']

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
