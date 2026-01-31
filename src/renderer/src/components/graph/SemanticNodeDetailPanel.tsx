import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, RefreshCw } from 'lucide-react'
import { Resizable } from 're-resizable'
import { Card, CardHeader, CardTitle, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import Markdown from 'react-markdown'
import { generateBorderColor, generateTransparentBackground } from '@renderer/lib/colorUtils'
import type { SemanticNode } from '../../../../preload/index.d'

// =============================================================================
// TYPES
// =============================================================================

interface SemanticNodeDetailPanelProps {
  /** The semantic node to display */
  node: SemanticNode
  /** Close callback */
  onClose: () => void
  /** Callback when panel is resized */
  onResize?: (width: number) => void
  /** Parent node info (for domains and modules) */
  parentInfo?: {
    id: string
    name: string
    layer: string
  }
  /** Callback when parent badge is clicked */
  onNavigateToParent?: (parentId: string) => void
  /** Children info for navigation */
  childrenInfo?: Array<{
    id: string
    name: string
  }>
  /** Callback when a child is clicked */
  onNavigateToChild?: (childId: string) => void
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SemanticNodeDetailPanel({
  node,
  onClose,
  onResize,
  parentInfo,
  onNavigateToParent,
  // Keep childrenInfo and onNavigateToChild in props for future use, but don't render
  childrenInfo: _childrenInfo,
  onNavigateToChild: _onNavigateToChild
}: SemanticNodeDetailPanelProps): React.JSX.Element {
  // Description state
  const [description, setDescription] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  // Note: node.summary (short summary from semantic analysis) is available but not rendered

  // Load description when node changes
  useEffect(() => {
    let mounted = true

    const loadDescription = async (): Promise<void> => {
      setLoading(true)
      setError(null)
      setProgress(null)

      try {
        // Request description (triggers generation if not cached)
        const result = await window.api.descriptionRequest(node.id)

        if (!mounted) return

        if (result.cached && result.content) {
          // Have cached content
          setDescription(result.content)
          setLoading(false)
        } else if (result.generating) {
          // Generation in progress, keep loading state
          setProgress('Generating description...')
        } else {
          // No content and not generating - shouldn't happen but handle it
          setError('No description available')
          setLoading(false)
        }
      } catch (err) {
        if (!mounted) return
        console.error('Failed to load description:', err)
        setError(err instanceof Error ? err.message : 'Failed to load description')
        setLoading(false)
      }
    }

    loadDescription()

    // Subscribe to description events
    const unsubLoading = window.api.onDescriptionLoading((data) => {
      if (data.nodeId === node.id && mounted) {
        setLoading(true)
        setProgress('Starting generation...')
      }
    })

    const unsubComplete = window.api.onDescriptionComplete((data) => {
      if (data.nodeId === node.id && mounted) {
        setDescription(data.content)
        setLoading(false)
        setProgress(null)
      }
    })

    const unsubError = window.api.onDescriptionError((data) => {
      if (data.nodeId === node.id && mounted) {
        setError(data.error)
        setLoading(false)
        setProgress(null)
      }
    })

    const unsubProgress = window.api.onDescriptionProgress((data) => {
      if (data.nodeId === node.id && mounted) {
        setProgress(data.status)
      }
    })

    return () => {
      mounted = false
      unsubLoading()
      unsubComplete()
      unsubError()
      unsubProgress()
    }
  }, [node.id])

  // Handle refresh button click (regenerate description)
  const handleRefresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setProgress('Regenerating description...')

    // For now, just re-request - in the future we could add a force-refresh option
    try {
      await window.api.descriptionRequest(node.id)
    } catch (err) {
      console.error('Failed to regenerate description:', err)
    }
  }, [node.id])

  // Get layer display info
  const layerInfo = {
    system: { icon: '🏛️', color: 'cyan', label: 'System' },
    domain: { icon: '📦', color: 'purple', label: 'Layer' },
    module: { icon: '🧩', color: 'green', label: 'Construct' }
  }[node.layer] || { icon: '📄', color: 'gray', label: 'Node' }

  const borderColor = generateBorderColor(node.id)

  return (
    <div className="absolute left-4 top-4 bottom-4 z-10 flex">
      <Resizable
        defaultSize={{ width: 400, height: '100%' }}
        minWidth={300}
        maxWidth={600}
        enable={{ left: false, right: true, top: false, bottom: false }}
        className="h-full"
        onResize={(_e, _direction, ref) => {
          onResize?.(ref.offsetWidth)
        }}
        handleStyles={{
          right: {
            width: '6px',
            right: '-3px',
            cursor: 'col-resize'
          }
        }}
        handleClasses={{
          right: 'hover:bg-cyan-500/30 transition-colors'
        }}
      >
        <Card
          className="h-full flex flex-col border-slate-800/50 bg-slate-900/80 backdrop-blur-xl shadow-2xl"
          style={{ borderColor: borderColor, borderWidth: '2px' }}
        >
          <CardHeader className="shrink-0 border-b border-slate-800/50 pb-4 pr-12 relative">
            <CardTitle
              className="text-slate-100 text-lg font-semibold truncate flex items-center gap-2"
              title={node.name}
            >
              <span>{layerInfo.icon}</span>
              <span>{node.name}</span>
            </CardTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge
                variant="outline"
                className="text-xs px-2 py-0"
                style={{
                  borderColor: borderColor,
                  color: borderColor,
                  backgroundColor: generateTransparentBackground(node.id, 0.2)
                }}
              >
                {layerInfo.label}
              </Badge>

              {/* Parent badge */}
              {parentInfo && (
                <>
                  <span className="text-xs text-slate-600">•</span>
                  <Badge
                    variant="outline"
                    className={`text-xs px-2 py-0 ${onNavigateToParent ? 'cursor-pointer hover:opacity-80' : ''}`}
                    title={`Navigate to parent: ${parentInfo.name}`}
                    style={{
                      borderColor: generateBorderColor(parentInfo.id),
                      color: generateBorderColor(parentInfo.id),
                      backgroundColor: generateTransparentBackground(parentInfo.id, 0.2)
                    }}
                    onClick={() => onNavigateToParent?.(parentInfo.id)}
                  >
                    ↑ {parentInfo.name}
                  </Badge>
                </>
              )}
            </div>

            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Description section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">Description:</span>
                    {!loading && description && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-slate-400 hover:text-slate-200"
                        onClick={handleRefresh}
                        title="Regenerate description"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Refresh
                      </Button>
                    )}
                  </div>

                  {/* Loading state */}
                  {loading && (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                      <Loader2 className="h-8 w-8 animate-spin mb-2" />
                      <p className="text-sm">{progress || 'Loading description...'}</p>
                    </div>
                  )}

                  {/* Error state */}
                  {!loading && error && (
                    <div className="p-4 rounded-lg bg-red-900/20 border border-red-500/30">
                      <p className="text-sm text-red-400">{error}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-xs text-red-400 hover:text-red-300"
                        onClick={handleRefresh}
                      >
                        Try Again
                      </Button>
                    </div>
                  )}

                  {/* Description content */}
                  {!loading && !error && description && (
                    <div className="prose prose-invert prose-sm max-w-none text-slate-300 prose-headings:text-slate-200 prose-code:text-cyan-300 prose-code:bg-slate-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-800 prose-a:text-cyan-400 prose-li:marker:text-slate-500">
                      <Markdown>{description}</Markdown>
                    </div>
                  )}

                  {/* No description yet */}
                  {!loading && !error && !description && (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                      <p className="text-sm">No description available yet.</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-xs"
                        onClick={handleRefresh}
                      >
                        Generate Description
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </Resizable>
    </div>
  )
}
