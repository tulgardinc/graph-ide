# Map IDE — Product Context

## Why This Project Exists

### The Problem with File-Centric IDEs

Modern codebases are complex systems, yet our tools force us to think in terms of files, folders, and lines. This creates several pain points:

1. **Cognitive overhead**: Developers must hold mental models of architecture while navigating file trees
2. **Lost context**: Switching between files breaks flow and loses the "big picture"
3. **Unsafe AI assistance**: LLMs lack boundaries—they can hallucinate or edit files they shouldn't touch
4. **Onboarding friction**: New team members struggle to understand system architecture from file structure alone

### The Opportunity

LLMs are transforming how we write code, but they work best when given:

- Clear context boundaries
- Structural understanding of the codebase
- Constraints on what they can modify

A visual, map-first approach naturally provides all three.

## What Problems It Solves

### For Individual Developers

| Problem                            | Map IDE Solution                                           |
| ---------------------------------- | ---------------------------------------------------------- |
| "Where should I make this change?" | Navigate the architecture map to the right layer/construct |
| "What does this module do?"        | Select it and ask the chat; get evidence-backed summaries  |
| "Will this change break anything?" | See dependencies and impact surface on the map             |
| "How do these pieces connect?"     | Visualize edges between constructs at any zoom level       |

### For AI-Assisted Coding

| Problem                   | Map IDE Solution                              |
| ------------------------- | --------------------------------------------- |
| LLM edits wrong files     | Selection constrains what the agent can touch |
| LLM hallucinates APIs     | Summaries are grounded with evidence pointers |
| Hard to verify AI changes | Impact surface visible on map before/after    |
| Context window limits     | Scope selection naturally limits context size |

## How It Should Work

### Primary Workflow

```
1. Open project → See System Map (highest zoom level)
2. Click to zoom into a system → See Layer View
3. Click a layer → See Construct Groups
4. Click a construct → See Symbol Map
5. Click a symbol → See Code (behind glass)

At any level:
- Select nodes to scope the conversation
- Chat with AI about the selection
- Request changes within the scoped area
```

### Key Interactions

#### Navigation (Mouse/Keyboard)

- **Click node**: Select it (adds to scope)
- **Double-click node**: Zoom into that level
- **Breadcrumb**: Zoom back out to parent levels
- **Cmd/Ctrl+Click**: Multi-select nodes

#### Chat (Natural Language)

- **Questions**: "What does this service do?" / "How does auth flow work?"
- **Navigation**: "Show me everything related to checkout"
- **Changes**: "Rename this function" / "Add error handling here"
- **Analysis**: "What would break if I changed this interface?"

### Zoom Levels (Semantic Views)

Each zoom level repopulates the canvas with different node types:

| Level         | Nodes                                  | Edges                   | Typical Questions                    |
| ------------- | -------------------------------------- | ----------------------- | ------------------------------------ |
| **System**    | Deployable units, external services    | HTTP, DB, integrations  | "How do web and server communicate?" |
| **Layer**     | UI, State, Domain, Data, Shared        | Allowed/actual deps     | "Are there any layering violations?" |
| **Construct** | Stores, services, handlers, components | Group dependencies      | "What stores does checkout use?"     |
| **Symbol**    | Functions, types, classes              | Call/use/type relations | "What calls this function?"          |
| **Code**      | Source lines                           | Control flow (optional) | "Explain this implementation"        |

## User Experience Goals

### Principles

1. **Architecture-first, code-second**: Users should rarely need to see raw code
2. **Conversation-native**: Chat is the primary way to understand and modify
3. **Safe by default**: Scoping prevents accidental wide-reaching changes
4. **Progressive disclosure**: Details appear only when requested

### Feel

- **Calm**: No overwhelming file trees or tab bars
- **Confident**: Clear boundaries, evidence-backed answers
- **Fast**: Instant graph updates, streaming chat responses
- **Explorable**: Easy to zoom in/out and navigate laterally
