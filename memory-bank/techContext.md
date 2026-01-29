# Map IDE — Tech Context

## Technology Stack

### Core Platform

| Layer           | Technology           | Purpose                                        |
| --------------- | -------------------- | ---------------------------------------------- |
| Desktop Runtime | Electron             | Cross-platform desktop app, file system access |
| Build Tool      | Vite + electron-vite | Fast HMR, modern bundling                      |
| UI Framework    | React 19             | Component-based UI                             |
| Language        | TypeScript           | Type safety throughout                         |

### UI Libraries

| Library      | Purpose             | Notes                                     |
| ------------ | ------------------- | ----------------------------------------- |
| React Flow   | Graph visualization | Canvas, nodes, edges, pan/zoom, selection |
| Tailwind CSS | Styling             | Utility-first, dark mode                  |
| shadcn/ui    | UI components       | Radix-based, accessible, customizable     |

### State Management

| Library | Purpose                             |
| ------- | ----------------------------------- |
| Zustand | Global state (graph, chat, project) |

### Code Analysis (Future)

| Library                | Purpose                                  | Notes                                |
| ---------------------- | ---------------------------------------- | ------------------------------------ |
| tree-sitter (WASM)     | Syntax parsing                           | Fast, incremental, language-agnostic |
| web-tree-sitter        | Tree-sitter runtime for browser/Electron |                                      |
| tree-sitter-typescript | TypeScript grammar                       |                                      |

### LLM Integration

| Approach            | Notes                                       |
| ------------------- | ------------------------------------------- |
| Direct API calls    | OpenAI, Anthropic, or configurable provider |
| Streaming responses | For responsive UX                           |
| MCP (future)        | Tool calling protocol for file operations   |

## Development Setup

### Prerequisites

- Node.js 20+
- npm (or pnpm)
- Git

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd map-ide

# Install dependencies
npm install

# Start development
npm run dev
```

### Scripts

| Script              | Purpose                            |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Start Electron in development mode |
| `npm run build`     | Build for production               |
| `npm run lint`      | Run ESLint                         |
| `npm run typecheck` | Run TypeScript type checking       |
| `npm run format`    | Format code with Prettier          |

### Project Structure

```
map-ide/
├── src/
│   ├── main/                 # Electron main process
│   │   └── index.ts          # Main entry, window creation
│   ├── preload/              # Preload scripts
│   │   └── index.ts          # IPC bridge to renderer
│   └── renderer/             # React application
│       ├── index.html
│       └── src/
│           ├── main.tsx      # React entry
│           ├── App.tsx       # Root component
│           ├── components/   # UI components
│           ├── store/        # Zustand stores
│           ├── lib/          # Utilities
│           └── types/        # TypeScript types
├── memory-bank/              # Project documentation
├── resources/                # App icons
├── build/                    # Build assets
├── electron.vite.config.ts   # Vite config for Electron
├── tailwind.config.js        # Tailwind configuration
├── postcss.config.js         # PostCSS configuration
├── tsconfig.json             # Base TypeScript config
├── tsconfig.node.json        # Node (main/preload) config
└── tsconfig.web.json         # Web (renderer) config
```

## Technical Constraints

### Electron Considerations

1. **Process Isolation**: Main and renderer are separate processes
   - Main: Node.js environment, file system access
   - Renderer: Browser environment, React app
   - Communication via IPC (preload bridge)

2. **Security**: Context isolation enabled
   - Renderer cannot directly access Node APIs
   - All sensitive operations go through IPC

3. **Performance**: Heavy computations should happen in main process
   - File parsing, tree-sitter operations
   - Results sent to renderer via IPC

### React Flow Constraints

1. **Node/Edge Data**: Must be serializable (for Zustand persistence)
2. **Custom Nodes**: Memoize to prevent unnecessary re-renders
3. **Large Graphs**: May need virtualization for 1000+ nodes

### Tailwind + Electron

1. **Dark Mode**: Set at `:root` level, electron windows default dark
2. **CSS Reset**: Tailwind preflight handles normalization

## Dependencies

### Current (package.json)

```json
{
  "dependencies": {
    "@electron-toolkit/preload": "^3.0.2",
    "@electron-toolkit/utils": "^4.0.0",
    "electron-updater": "^6.3.9"
  },
  "devDependencies": {
    "electron": "^39.x",
    "electron-vite": "^5.0.0",
    "react": "^19.x",
    "react-dom": "^19.x",
    "typescript": "^5.x",
    "tailwindcss": "^4.x",
    "@tailwindcss/postcss": "latest",
    "autoprefixer": "latest"
  }
}
```

### To Be Added

| Package                    | Purpose                          |
| -------------------------- | -------------------------------- |
| `@xyflow/react`            | React Flow (graph visualization) |
| `zustand`                  | State management                 |
| `web-tree-sitter`          | Tree-sitter WASM runtime         |
| `tree-sitter-typescript`   | TypeScript grammar               |
| `class-variance-authority` | For shadcn/ui                    |
| `clsx` + `tailwind-merge`  | Class utilities for shadcn/ui    |
| `lucide-react`             | Icons                            |

## Configuration Files

### tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // shadcn/ui will add theme extensions here
    }
  },
  plugins: []
}
```

### electron.vite.config.ts

Handles three build targets:

- `main` - Electron main process
- `preload` - Preload scripts
- `renderer` - React application

### tsconfig Structure

- `tsconfig.json` - Base config with references
- `tsconfig.node.json` - For main/preload (Node environment)
- `tsconfig.web.json` - For renderer (DOM environment)

## Tool Usage Patterns

### React Flow Setup

```typescript
import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

function GraphPanel() {
  const { nodes, edges, onNodesChange, onEdgesChange } = useGraphStore()

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={customNodeTypes}
      fitView
    >
      <Background />
      <Controls />
    </ReactFlow>
  )
}
```

### Zustand Store Pattern

```typescript
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface GraphState {
  nodes: Node[]
  edges: Edge[]
  selectedIds: Set<string>
  selectNode: (id: string) => void
}

export const useGraphStore = create<GraphState>()(
  immer((set) => ({
    nodes: [],
    edges: [],
    selectedIds: new Set(),
    selectNode: (id) =>
      set((state) => {
        state.selectedIds.add(id)
      })
  }))
)
```

### IPC Communication Pattern

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld('api', {
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  sendChat: (message: string) => ipcRenderer.invoke('llm:chat', message)
})

// main/index.ts
ipcMain.handle('fs:readFile', async (_, path) => {
  return fs.readFile(path, 'utf-8')
})

// renderer usage
const content = await window.api.readFile('/some/path')
```

## Environment Variables

| Variable            | Purpose           | Default             |
| ------------------- | ----------------- | ------------------- |
| `OPENAI_API_KEY`    | OpenAI API access | (required for chat) |
| `ANTHROPIC_API_KEY` | Claude API access | (optional)          |

Store in `.env.local` (gitignored).
