import { useCallback, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type OnSelectionChangeParams,
  type Node
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useGraphStore } from '../../store/graphStore'

export function GraphPanel(): React.JSX.Element {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useGraphStore()

  // Track selected nodes for the info panel
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([])

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedNodes(params.nodes)
  }, [])

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        // Selection configuration:
        // - Click = select single node (default behavior)
        // - Shift+Click = multi-select (multiSelectionKeyCode)
        // - Shift+Drag = draw selection box (selectionKeyCode)
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        selectNodesOnDrag={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#030712' }}
      >
        <Background color="#1e293b" gap={20} size={1} />
        <Controls className="[&>button]:!bg-slate-800 [&>button]:!border-slate-700 [&>button]:!text-slate-300 [&>button:hover]:!bg-slate-700" />
      </ReactFlow>

      {/* Selection info panel */}
      {selectedNodes.length > 0 && (
        <div className="absolute bottom-4 left-4 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-3 backdrop-blur-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Selected ({selectedNodes.length})
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {selectedNodes.map((node) => (
              <span
                key={node.id}
                className="rounded-full bg-cyan-500/20 px-2.5 py-1 text-xs font-medium text-cyan-300"
              >
                {String(node.data?.label ?? node.id)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
