import Anthropic from '@anthropic-ai/sdk'

// =============================================================================
// LLM CLIENT MODULE
// Handles interaction with Anthropic Claude API
// =============================================================================

/** Message format for chat history */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

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

// NOTE: Do not auto-initialize here - call initializeClient() explicitly
// after dotenv has loaded in the main process
