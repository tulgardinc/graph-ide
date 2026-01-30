import { useEffect } from 'react'
import { GraphPanel } from './components/graph/GraphPanel'
import { ChatPanel } from './components/chat/ChatPanel'
import { useGraphStore } from './store/graphStore'

function LoadingOverlay(): React.JSX.Element | null {
  const semanticLoading = useGraphStore((state) => state.semanticLoading)
  const semanticProgress = useGraphStore((state) => state.semanticProgress)
  const semanticError = useGraphStore((state) => state.semanticError)
  const semanticCurrentTool = useGraphStore((state) => state.semanticCurrentTool)

  if (!semanticLoading && !semanticError) return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900 px-8 py-6 shadow-2xl min-w-[320px]">
        {semanticLoading ? (
          <>
            {/* Spinner */}
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-cyan-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-slate-200">Analyzing Codebase</p>
              <p className="mt-1 text-sm text-slate-400">{semanticProgress || 'Please wait...'}</p>
            </div>

            {/* Current Tool Display */}
            {semanticCurrentTool && (
              <div className="mt-2 w-full rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                  <span className="text-xs font-medium uppercase tracking-wider text-cyan-400">
                    {semanticCurrentTool.name}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-300 truncate">
                  {semanticCurrentTool.description}
                </p>
              </div>
            )}
          </>
        ) : semanticError ? (
          <>
            {/* Error icon */}
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
              <svg
                className="h-6 w-6 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-red-400">Analysis Failed</p>
              <p className="mt-1 max-w-xs text-sm text-slate-400">{semanticError}</p>
            </div>
            <button
              onClick={() => useGraphStore.getState().loadSemanticAnalysis(true)}
              className="mt-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600 transition-colors"
            >
              Retry
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

function App(): React.JSX.Element {
  const loadSemanticAnalysis = useGraphStore((state) => state.loadSemanticAnalysis)

  // Auto-trigger semantic analysis on app mount
  useEffect(() => {
    console.log('[App] Triggering semantic analysis on mount...')
    loadSemanticAnalysis()
  }, [loadSemanticAnalysis])

  return (
    <div className="h-screen w-screen bg-slate-950 relative">
      <GraphPanel />
      <ChatPanel />
      <LoadingOverlay />
    </div>
  )
}

export default App
