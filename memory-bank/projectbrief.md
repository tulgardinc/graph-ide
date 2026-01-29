# Map IDE — Project Brief

## Vision

A **map-first, chat-driven IDE** where developers interact primarily through conversation, using a visual graph as a scoping and grounding model. The map represents architecture and concepts—not files—while still allowing precise drill-down to code when needed.

## Core Problem

Traditional IDEs are file-centric. Developers spend excessive cognitive effort:

- Navigating folder trees and tabs
- Building mental models of system architecture
- Ensuring AI assistants don't hallucinate or make unsafe edits

## Solution

Map IDE provides:

1. **Visual architecture map** — 4 semantic zoom levels on the canvas (System → Layer → Construct → Symbol), with code viewed in a separate modal/popup
2. **Chat as primary interface** — ask questions, request changes, explore the codebase
3. **Selection = Scope = Safety** — map selection constrains what the LLM can see and edit

## MVP Scope

### Target

- TypeScript projects only (React web + Node server pattern)
- Projects created inside Map IDE (enforced structure)
- Single developer workflow

### Initial Focus (Phase 1)

1. Graph rendering with semantic zoom (React Flow)
2. Chat panel with LLM integration
3. Basic conversation about project structure

### Future Phases

- Tree-sitter symbol extraction
- MCP tool calling for file operations
- TypeScript compiler API for deeper semantic analysis
- Manifest-driven architecture constraints
- Multi-language support

## Success Criteria (MVP)

- Developer can visualize project architecture at multiple zoom levels
- Developer can chat with LLM about the codebase
- Selection on the map scopes the conversation context
- System feels responsive (graph updates, chat responses)

## Non-Goals (MVP)

- Arbitrary repository import
- Perfect call graphs for dynamic code
- Automatic feature inference without guardrails
- Multi-user collaboration
