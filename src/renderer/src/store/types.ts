import type { ElkLayoutOptions } from '../lib/elkLayout'

// =============================================================================
// ZOOM LEVEL TYPES
// =============================================================================

export type ZoomLevel = 'system' | 'layer' | 'construct' | 'symbol'

export const ZOOM_LEVELS: ZoomLevel[] = ['system', 'layer', 'construct', 'symbol']

export const ZOOM_LEVEL_LABELS: Record<ZoomLevel, string> = {
  system: 'System',
  layer: 'Layer',
  construct: 'Construct',
  symbol: 'Symbol'
}

// Layout options per zoom level
export const LAYOUT_OPTIONS: Record<ZoomLevel, ElkLayoutOptions> = {
  system: { direction: 'RIGHT', nodeSpacing: 80, layerSpacing: 120 },
  layer: { direction: 'DOWN', nodeSpacing: 40, layerSpacing: 80 },
  construct: { direction: 'DOWN', nodeSpacing: 50, layerSpacing: 100 },
  symbol: { direction: 'DOWN', nodeSpacing: 20, layerSpacing: 40 }
}
