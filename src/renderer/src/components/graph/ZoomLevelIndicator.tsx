import { ChevronRight } from 'lucide-react'
import {
  useGraphStore,
  ZOOM_LEVELS,
  ZOOM_LEVEL_LABELS,
  type ZoomLevel
} from '../../store/graphStore'
import { cn } from '../../lib/utils'

interface ZoomLevelIndicatorProps {
  /** Left offset in pixels (to position after the detail panel) */
  leftOffset?: number
}

export function ZoomLevelIndicator({
  leftOffset = 16
}: ZoomLevelIndicatorProps): React.JSX.Element {
  const zoomLevel = useGraphStore((state) => state.zoomLevel)
  const setZoomLevel = useGraphStore((state) => state.setZoomLevel)

  return (
    <div
      className="absolute top-4 z-10 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/90 px-2 py-1.5 backdrop-blur-sm transition-[left] duration-150"
      style={{ left: leftOffset }}
    >
      {ZOOM_LEVELS.map((level, index) => (
        <div key={level} className="flex items-center">
          <ZoomLevelButton
            level={level}
            isActive={zoomLevel === level}
            onClick={() => setZoomLevel(level)}
          />
          {index < ZOOM_LEVELS.length - 1 && (
            <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-slate-600" />
          )}
        </div>
      ))}
    </div>
  )
}

interface ZoomLevelButtonProps {
  level: ZoomLevel
  isActive: boolean
  onClick: () => void
}

function ZoomLevelButton({ level, isActive, onClick }: ZoomLevelButtonProps): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
        isActive
          ? 'bg-cyan-500/20 text-cyan-300 shadow-sm'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
      )}
    >
      {ZOOM_LEVEL_LABELS[level]}
    </button>
  )
}
