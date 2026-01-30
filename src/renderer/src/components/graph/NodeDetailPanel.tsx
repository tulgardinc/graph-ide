import { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { Resizable } from 're-resizable'
import { Card, CardHeader, CardTitle, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import Markdown from 'react-markdown'
import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState } from '@codemirror/state'
import { lineNumbers } from '@codemirror/view'
import type { ExtractedSymbol } from '../../../../preload/index.d'

interface NodeDetailPanelProps {
  symbol: ExtractedSymbol
  onClose: () => void
  /** Set of node IDs currently in the graph (to check navigability) */
  graphNodeIds: Set<string>
  /** Callback when a type badge is clicked (for navigation) */
  onNavigateToSymbol?: (symbolId: string) => void
  /** Callback when panel is resized */
  onResize?: (width: number) => void
}

export function NodeDetailPanel({
  symbol,
  onClose,
  graphNodeIds,
  onNavigateToSymbol,
  onResize
}: NodeDetailPanelProps): React.JSX.Element {
  const [sourceCode, setSourceCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)

  // Load source code from file
  useEffect(() => {
    const loadSourceCode = async (): Promise<void> => {
      setLoading(true)
      setError(null)
      try {
        const code = await window.api.readFileLines(
          symbol.filePath,
          symbol.startLine,
          symbol.endLine
        )
        setSourceCode(code)
      } catch (err) {
        console.error('Failed to load source code:', err)
        setError(err instanceof Error ? err.message : 'Failed to load source code')
      } finally {
        setLoading(false)
      }
    }
    loadSourceCode()
  }, [symbol.filePath, symbol.startLine, symbol.endLine])

  // Initialize CodeMirror editor
  useEffect(() => {
    if (!editorRef.current || sourceCode === null) return

    // Clean up previous editor
    if (editorViewRef.current) {
      editorViewRef.current.destroy()
      editorViewRef.current = null
    }

    // Calculate line number offset - CodeMirror shows lines 1-based internally,
    // but we want to show actual file line numbers
    const lineOffset = symbol.startLine - 1

    const state = EditorState.create({
      doc: sourceCode,
      extensions: [
        basicSetup,
        javascript({ typescript: true, jsx: true }),
        oneDark,
        EditorView.editable.of(false),
        EditorView.lineWrapping,
        EditorState.readOnly.of(true),
        // Override line numbers to show actual file line numbers
        lineNumbers({
          formatNumber: (lineNo) => String(lineNo + lineOffset)
        })
      ]
    })

    editorViewRef.current = new EditorView({
      state,
      parent: editorRef.current
    })

    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.destroy()
        editorViewRef.current = null
      }
    }
  }, [sourceCode, symbol.startLine])

  // Handle type badge click
  const handleTypeBadgeClick = useCallback(
    (typeId: string | undefined) => {
      if (!typeId || !onNavigateToSymbol) return
      // Only navigate if the symbol exists in the graph
      if (graphNodeIds.has(typeId)) {
        onNavigateToSymbol(typeId)
      }
    },
    [graphNodeIds, onNavigateToSymbol]
  )

  // Check if a type ID is navigable (exists in the graph)
  const isNavigable = (typeId: string | undefined): boolean => {
    return !!typeId && graphNodeIds.has(typeId)
  }

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
        <Card className="h-full flex flex-col border-slate-800/50 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <CardHeader className="shrink-0 border-b border-slate-800/50 pb-4 pr-12 relative">
            <CardTitle
              className="text-slate-100 text-lg font-semibold truncate"
              title={symbol.name}
            >
              {symbol.name}
            </CardTitle>
            <span className="text-xs text-slate-400 mt-1">{symbol.kind}</span>
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
                {/* Type badges section */}
                <div className="space-y-2">
                  {/* Return type */}
                  {symbol.returnTypeText && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500 font-medium">Returns:</span>
                      <Badge
                        className={`bg-cyan-500/20 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/30 ${
                          isNavigable(symbol.returnTypeId) ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => handleTypeBadgeClick(symbol.returnTypeId)}
                      >
                        {symbol.returnTypeText}
                      </Badge>
                    </div>
                  )}

                  {/* Parameters */}
                  {symbol.parameters && symbol.parameters.length > 0 && (
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-xs text-slate-500 font-medium mt-1">Params:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {symbol.parameters.map((param, index) => (
                          <Badge
                            key={index}
                            className={`bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600 ${
                              isNavigable(param.typeId) ? 'cursor-pointer' : ''
                            }`}
                            onClick={() => handleTypeBadgeClick(param.typeId)}
                            title={param.typeText ? `${param.name}: ${param.typeText}` : param.name}
                          >
                            {param.name}
                            {param.typeText && (
                              <span className="text-slate-400 ml-1">: {param.typeText}</span>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Source code section */}
                <div className="space-y-2">
                  <span className="text-xs text-slate-500 font-medium">Definition:</span>
                  <div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-950">
                    {loading && (
                      <div className="p-4 text-sm text-slate-400 italic">
                        Loading source code...
                      </div>
                    )}
                    {error && <div className="p-4 text-sm text-red-400">Error: {error}</div>}
                    {!loading && !error && (
                      <div
                        ref={editorRef}
                        className="max-h-[500px] overflow-auto text-sm [&_.cm-editor]:bg-transparent [&_.cm-gutters]:bg-slate-900 [&_.cm-gutters]:border-r-slate-700"
                      />
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {symbol.filePath.split(/[/\\]/).pop()}:{symbol.startLine}-{symbol.endLine}
                  </div>
                </div>

                {/* Description section */}
                {symbol.description && (
                  <div className="space-y-2">
                    <span className="text-xs text-slate-500 font-medium">Description:</span>
                    <div className="prose prose-invert prose-sm max-w-none text-slate-300 prose-headings:text-slate-200 prose-code:text-cyan-300 prose-code:bg-slate-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-800 prose-a:text-cyan-400">
                      <Markdown>{symbol.description}</Markdown>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </Resizable>
    </div>
  )
}
