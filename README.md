# Map IDE

A **map-first, chat-driven IDE** where the primary interaction is conversation, and a visual architecture map serves as a scoping and grounding model for understanding and editing code.

## Vision

Traditional IDEs are file-centric. Map IDE flips this paradigm:

- **Architecture first, code second** — navigate concepts, not folders
- **Chat as primary interface** — ask questions, request changes
- **Selection = Scope = Safety** — map selection constrains AI operations

## Features (Planned)

### Phase 1: Foundation (Current)

- [ ] Graph visualization with React Flow
- [ ] Semantic zoom (System → Layer → Construct → Symbol → Code)
- [ ] Chat panel with LLM integration
- [ ] Selection-based context scoping

### Phase 2: Code Intelligence

- [ ] Tree-sitter WASM for TypeScript parsing
- [ ] Symbol extraction and import graph
- [ ] Project manifest configuration

### Phase 3: IDE Capabilities

- [ ] MCP tool calling for file operations
- [ ] Agent-style code modifications
- [ ] Evidence-backed summaries with invalidation

## Tech Stack

| Category | Technology               |
| -------- | ------------------------ |
| Platform | Electron                 |
| Build    | Vite + electron-vite     |
| UI       | React 19 + TypeScript    |
| Graph    | React Flow               |
| Styling  | Tailwind CSS + shadcn/ui |
| State    | Zustand                  |
| Parsing  | Tree-sitter WASM         |

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
# Install dependencies
npm install

# Start development
npm run dev
```

### Scripts

| Command             | Description               |
| ------------------- | ------------------------- |
| `npm run dev`       | Start in development mode |
| `npm run build`     | Build for production      |
| `npm run lint`      | Run ESLint                |
| `npm run typecheck` | TypeScript type checking  |
| `npm run format`    | Format with Prettier      |

## Project Structure

```
map-ide/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # IPC bridge
│   └── renderer/       # React application
│       └── src/
│           ├── components/
│           │   ├── graph/    # React Flow components
│           │   ├── chat/     # Chat UI
│           │   └── ui/       # shadcn/ui components
│           ├── store/        # Zustand stores
│           ├── lib/          # Utilities
│           └── types/        # TypeScript types
├── memory-bank/        # Project documentation
└── resources/          # App assets
```

## Documentation

See the `memory-bank/` directory for detailed documentation:

- [Project Brief](memory-bank/projectbrief.md) — Vision and scope
- [Product Context](memory-bank/productContext.md) — Problems and solutions
- [System Patterns](memory-bank/systemPatterns.md) — Architecture decisions
- [Tech Context](memory-bank/techContext.md) — Technology details

## Design Principles

1. **Deterministic spine, semantic overlay** — Symbol graph is computed, labels are overlaid
2. **Code behind glass** — Raw code shown only on explicit drill-down
3. **Selection = scope = safety** — Map selection drives chat context and edit permissions
4. **Views over "true architecture"** — Multiple useful views, not one claimed truth

## License

MIT
