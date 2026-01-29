import { create } from 'zustand'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge
} from '@xyflow/react'

// Demo nodes representing a simple system architecture
const initialNodes: Node[] = [
  // System level nodes
  {
    id: 'web',
    type: 'default',
    position: { x: 100, y: 50 },
    data: { label: '🌐 Web App' },
    style: {
      background: '#1e293b',
      color: '#f1f5f9',
      border: '2px solid #3b82f6',
      borderRadius: '12px',
      padding: '16px',
      fontWeight: 600,
      width: 140
    }
  },
  {
    id: 'server',
    type: 'default',
    position: { x: 350, y: 50 },
    data: { label: '⚙️ Server' },
    style: {
      background: '#1e293b',
      color: '#f1f5f9',
      border: '2px solid #10b981',
      borderRadius: '12px',
      padding: '16px',
      fontWeight: 600,
      width: 140
    }
  },
  {
    id: 'database',
    type: 'default',
    position: { x: 600, y: 50 },
    data: { label: '🗄️ Database' },
    style: {
      background: '#1e293b',
      color: '#f1f5f9',
      border: '2px solid #f59e0b',
      borderRadius: '12px',
      padding: '16px',
      fontWeight: 600,
      width: 140
    }
  },
  // Layer nodes for Web App
  {
    id: 'ui-layer',
    type: 'default',
    position: { x: 50, y: 180 },
    data: { label: '🎨 UI Layer' },
    style: {
      background: '#0f172a',
      color: '#94a3b8',
      border: '1px solid #334155',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '13px',
      width: 120
    }
  },
  {
    id: 'state-layer',
    type: 'default',
    position: { x: 50, y: 280 },
    data: { label: '📦 State Layer' },
    style: {
      background: '#0f172a',
      color: '#94a3b8',
      border: '1px solid #334155',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '13px',
      width: 120
    }
  },
  // Layer nodes for Server
  {
    id: 'handlers-layer',
    type: 'default',
    position: { x: 300, y: 180 },
    data: { label: '🔌 Handlers' },
    style: {
      background: '#0f172a',
      color: '#94a3b8',
      border: '1px solid #334155',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '13px',
      width: 120
    }
  },
  {
    id: 'domain-layer',
    type: 'default',
    position: { x: 300, y: 280 },
    data: { label: '🧠 Domain' },
    style: {
      background: '#0f172a',
      color: '#94a3b8',
      border: '1px solid #334155',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '13px',
      width: 120
    }
  },
  {
    id: 'data-layer',
    type: 'default',
    position: { x: 300, y: 380 },
    data: { label: '💾 Data Layer' },
    style: {
      background: '#0f172a',
      color: '#94a3b8',
      border: '1px solid #334155',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '13px',
      width: 120
    }
  },
  // External service
  {
    id: 'auth-provider',
    type: 'default',
    position: { x: 550, y: 280 },
    data: { label: '🔐 Auth Provider' },
    style: {
      background: '#1e1b4b',
      color: '#c4b5fd',
      border: '1px dashed #6366f1',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '13px',
      width: 130
    }
  }
]

const initialEdges: Edge[] = [
  // System connections
  {
    id: 'web-server',
    source: 'web',
    target: 'server',
    animated: true,
    style: { stroke: '#3b82f6', strokeWidth: 2 },
    label: 'HTTP',
    labelStyle: { fill: '#94a3b8', fontSize: 11 },
    labelBgStyle: { fill: '#0f172a' }
  },
  {
    id: 'server-db',
    source: 'server',
    target: 'database',
    animated: true,
    style: { stroke: '#10b981', strokeWidth: 2 },
    label: 'SQL',
    labelStyle: { fill: '#94a3b8', fontSize: 11 },
    labelBgStyle: { fill: '#0f172a' }
  },
  // Web App layers
  {
    id: 'web-ui',
    source: 'web',
    target: 'ui-layer',
    style: { stroke: '#475569', strokeWidth: 1 }
  },
  {
    id: 'ui-state',
    source: 'ui-layer',
    target: 'state-layer',
    style: { stroke: '#475569', strokeWidth: 1 }
  },
  // Server layers
  {
    id: 'server-handlers',
    source: 'server',
    target: 'handlers-layer',
    style: { stroke: '#475569', strokeWidth: 1 }
  },
  {
    id: 'handlers-domain',
    source: 'handlers-layer',
    target: 'domain-layer',
    style: { stroke: '#475569', strokeWidth: 1 }
  },
  {
    id: 'domain-data',
    source: 'domain-layer',
    target: 'data-layer',
    style: { stroke: '#475569', strokeWidth: 1 }
  },
  // External connections
  {
    id: 'server-auth',
    source: 'server',
    target: 'auth-provider',
    style: { stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '5,5' },
    label: 'OAuth',
    labelStyle: { fill: '#94a3b8', fontSize: 11 },
    labelBgStyle: { fill: '#0f172a' }
  },
  {
    id: 'data-db',
    source: 'data-layer',
    target: 'database',
    style: { stroke: '#f59e0b', strokeWidth: 1 }
  }
]

interface GraphState {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  // Derived state helper
  getSelectedNodes: () => Node[]
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes)
    })
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges)
    })
  },

  onConnect: (connection) => {
    set({
      edges: addEdge({ ...connection, style: { stroke: '#475569', strokeWidth: 1 } }, get().edges)
    })
  },

  // Helper to get currently selected nodes (React Flow manages selection via node.selected)
  getSelectedNodes: () => {
    return get().nodes.filter((node) => node.selected)
  }
}))
