import Anthropic from '@anthropic-ai/sdk'
import type {
  MessageParam,
  ContentBlockParam,
  ToolResultBlockParam,
  ToolUseBlock
} from '@anthropic-ai/sdk/resources/messages'
import { tools, executeToolCall, getToolDescription } from './tools'

// =============================================================================
// LLM CLIENT MODULE
// Handles interaction with Anthropic Claude API with tool calling support
// =============================================================================

/** Message format for chat history */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Tool execution callback - called when a tool starts/ends */
export type ToolCallback = (toolName: string, description: string) => void

/** Options for sending a message */
export interface SendMessageOptions {
  messages: ChatMessage[]
  model?: string
  maxTokens?: number
  systemPrompt?: string
}

/** Streaming response callback */
export type StreamCallback = (chunk: string) => void

/** Error callback */
export type ErrorCallback = (error: Error) => void

/** Complete callback */
export type CompleteCallback = (fullResponse: string) => void

// Default configuration
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_MAX_TOKENS = 4096

// Singleton Anthropic client instance
let client: Anthropic | null = null

// Track active stream for cancellation
let activeAbortController: AbortController | null = null

/**
 * Initialize the Anthropic client
 * Uses ANTHROPIC_API_KEY environment variable by default
 */
export function initializeClient(apiKey?: string): void {
  const key = apiKey || process.env.ANTHROPIC_API_KEY

  if (!key) {
    console.warn('[LLM] No API key provided. Set ANTHROPIC_API_KEY environment variable.')
    client = null
    return
  }

  client = new Anthropic({
    apiKey: key
  })

  console.log('[LLM] Anthropic client initialized')
}

/**
 * Check if the client is ready
 */
export function isClientReady(): boolean {
  return client !== null
}

/**
 * Get the current API key status (not the actual key for security)
 */
export function getApiKeyStatus(): { configured: boolean; source: string } {
  if (client) {
    return {
      configured: true,
      source: process.env.ANTHROPIC_API_KEY ? 'environment' : 'runtime'
    }
  }
  return { configured: false, source: 'none' }
}

/**
 * Send a message and stream the response
 * Returns a promise that resolves when streaming is complete
 */
export async function sendMessageStream(
  options: SendMessageOptions,
  onChunk: StreamCallback,
  onError: ErrorCallback,
  onComplete: CompleteCallback
): Promise<void> {
  if (!client) {
    onError(new Error('Anthropic client not initialized. Set ANTHROPIC_API_KEY.'))
    return
  }

  const { messages, model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS, systemPrompt } = options

  // Convert messages to Anthropic format
  const anthropicMessages = messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content
  }))

  // Create abort controller for cancellation
  activeAbortController = new AbortController()

  try {
    const stream = client.messages.stream(
      {
        model,
        max_tokens: maxTokens,
        messages: anthropicMessages,
        thinking: {
          type: 'enabled',
          budget_tokens: 1024
        },
        ...(systemPrompt ? { system: systemPrompt } : {})
      },
      {
        signal: activeAbortController.signal
      }
    )

    let fullResponse = ''

    // Handle streaming events
    stream.on('text', (text) => {
      fullResponse += text
      onChunk(text)
    })

    stream.on('error', (error) => {
      console.error('[LLM] Stream error:', error)
      onError(error instanceof Error ? error : new Error(String(error)))
    })

    // Wait for completion
    await stream.finalMessage()
    onComplete(fullResponse)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('[LLM] Stream cancelled by user')
      onComplete('') // Empty response on cancel
    } else {
      console.error('[LLM] Error sending message:', error)
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  } finally {
    activeAbortController = null
  }
}

/**
 * Send a message and get a complete response (non-streaming)
 */
export async function sendMessage(options: SendMessageOptions): Promise<string> {
  if (!client) {
    throw new Error('Anthropic client not initialized. Set ANTHROPIC_API_KEY.')
  }

  const { messages, model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS, systemPrompt } = options

  const anthropicMessages = messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content
  }))

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: anthropicMessages,
    thinking: {
      type: 'enabled',
      budget_tokens: 1024
    },
    ...(systemPrompt ? { system: systemPrompt } : {})
  })

  // Extract text from response
  const textContent = response.content.find((block) => block.type === 'text')
  return textContent?.type === 'text' ? textContent.text : ''
}

/**
 * Cancel the active stream
 */
export function cancelStream(): boolean {
  if (activeAbortController) {
    activeAbortController.abort()
    activeAbortController = null
    console.log('[LLM] Stream cancellation requested')
    return true
  }
  return false
}

// =============================================================================
// TOOL-ENABLED STREAMING (AGENTIC LOOP)
// =============================================================================

/** Options for sending a message with tools */
export interface SendMessageWithToolsOptions extends SendMessageOptions {
  projectPath: string
  /** If true, only return text from the final response (not intermediate tool-calling iterations) */
  finalResponseOnly?: boolean
}

/**
 * Send a message with tool calling support
 * Implements an agentic loop: Claude can call tools, get results, and continue
 *
 * Flow:
 * 1. Send message with tools available
 * 2. If Claude responds with tool_use, execute the tool
 * 3. Send tool_result back to Claude
 * 4. Repeat until Claude responds with end_turn (final text response)
 */
export async function sendMessageWithTools(
  options: SendMessageWithToolsOptions,
  onChunk: StreamCallback,
  onError: ErrorCallback,
  onComplete: CompleteCallback,
  onToolStart?: ToolCallback,
  onToolEnd?: ToolCallback
): Promise<void> {
  if (!client) {
    onError(new Error('Anthropic client not initialized. Set ANTHROPIC_API_KEY.'))
    return
  }

  const {
    messages,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    systemPrompt,
    projectPath,
    finalResponseOnly = false
  } = options

  // Convert initial messages to Anthropic format
  const anthropicMessages: MessageParam[] = messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content
  }))

  // Create local abort controller for this request (to avoid race conditions with concurrent requests)
  const localAbortController = new AbortController()

  let fullResponse = ''
  let currentIterationText = '' // Track text for current iteration only
  let iterationCount = 0
  const MAX_ITERATIONS = 10 // Prevent infinite loops

  try {
    while (iterationCount < MAX_ITERATIONS) {
      iterationCount++
      console.log(`[LLM] Tool loop iteration ${iterationCount}`)

      // Check for cancellation
      if (localAbortController.signal.aborted) {
        console.log('[LLM] Cancelled during tool loop')
        break
      }

      // Make the API call with streaming
      const stream = client.messages.stream(
        {
          model,
          max_tokens: maxTokens,
          messages: anthropicMessages,
          tools,
          thinking: {
            type: 'enabled',
            budget_tokens: 1024
          },
          ...(systemPrompt ? { system: systemPrompt } : {})
        },
        {
          signal: localAbortController.signal
        }
      )

      // Reset current iteration text at the start of each iteration
      currentIterationText = ''
      const toolUseBlocks: ToolUseBlock[] = []

      // Handle streaming text
      stream.on('text', (text) => {
        currentIterationText += text
        // Only accumulate to fullResponse if not in finalResponseOnly mode
        // (we'll set fullResponse from currentIterationText at the end if needed)
        if (!finalResponseOnly) {
          fullResponse += text
        }
        onChunk(text)
      })

      // Wait for the final message
      const finalMessage = await stream.finalMessage()

      console.log('[LLM] Stop reason:', finalMessage.stop_reason)

      // Collect any tool_use blocks from the response
      for (const block of finalMessage.content) {
        if (block.type === 'tool_use') {
          toolUseBlocks.push(block)
        }
      }

      // If no tool calls, we're done
      if (finalMessage.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        console.log('[LLM] Conversation complete (no more tool calls)')
        break
      }

      // Handle tool calls
      if (finalMessage.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
        // Add assistant's response to conversation history
        anthropicMessages.push({
          role: 'assistant',
          content: finalMessage.content as ContentBlockParam[]
        })

        // Execute each tool and collect results
        const toolResults: ToolResultBlockParam[] = []

        for (const toolUse of toolUseBlocks) {
          const toolInput = toolUse.input as Record<string, unknown>
          const description = getToolDescription(toolUse.name, toolInput)

          // Notify UI that tool is starting
          if (onToolStart) {
            onToolStart(toolUse.name, description)
          }

          console.log(`[LLM] Executing tool: ${toolUse.name}`, toolInput)

          // Execute the tool
          const result = await executeToolCall(toolUse.name, toolInput, projectPath)

          console.log(`[LLM] Tool result success: ${result.success}`)

          // Notify UI that tool finished
          if (onToolEnd) {
            onToolEnd(toolUse.name, result.success ? 'completed' : `error: ${result.error}`)
          }

          // Add tool result
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result.success ? result.result || 'Success' : `Error: ${result.error}`
          })
        }

        // Add tool results as user message
        anthropicMessages.push({
          role: 'user',
          content: toolResults
        })

        // Continue the loop to get Claude's next response
        continue
      }

      // If we get here with an unexpected stop reason, break
      console.log('[LLM] Unexpected stop reason, ending loop')
      break
    }

    if (iterationCount >= MAX_ITERATIONS) {
      console.warn('[LLM] Max iterations reached in tool loop')
    }

    // If finalResponseOnly mode, only return text from the last iteration (the JSON output)
    const responseToReturn = finalResponseOnly ? currentIterationText : fullResponse
    console.log(
      `[LLM] Returning response (finalResponseOnly=${finalResponseOnly}), length: ${responseToReturn.length}`
    )
    onComplete(responseToReturn)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('[LLM] Stream cancelled by user')
      onComplete(fullResponse) // Return what we have so far
    } else {
      console.error('[LLM] Error in tool loop:', error)
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  } finally {
    activeAbortController = null
  }
}

// NOTE: Do not auto-initialize here - call initializeClient() explicitly
// after dotenv has loaded in the main process
