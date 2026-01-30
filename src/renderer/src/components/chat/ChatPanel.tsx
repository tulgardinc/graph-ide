import { useState, useCallback, useEffect, useRef } from 'react'
import { MessageSquare, AlertCircle, Search, FileText, FolderTree, Loader2 } from 'lucide-react'
import { Resizable } from 're-resizable'
import { Card, CardHeader, CardTitle, CardContent } from '@renderer/components/ui/card'
import { MessageList, type Message } from './MessageList'
import { Composer } from './Composer'

/** Tool execution status for UI feedback */
interface ToolStatus {
  toolName: string
  description: string
}

export function ChatPanel(): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [activeTool, setActiveTool] = useState<ToolStatus | null>(null)
  const streamingMessageRef = useRef<string>('')
  const streamingMessageIdRef = useRef<string | null>(null)

  // Check chat status on mount
  useEffect(() => {
    const checkStatus = async (): Promise<void> => {
      try {
        const status = await window.api.chatStatus()
        setIsReady(status.ready)
        if (!status.ready) {
          setError('API key not configured. Set ANTHROPIC_API_KEY environment variable.')
        }
      } catch (err) {
        console.error('Failed to check chat status:', err)
        setError('Failed to connect to LLM service')
      }
    }
    checkStatus()
  }, [])

  // Set up streaming event listeners
  useEffect(() => {
    const unsubChunk = window.api.onChatChunk((chunk) => {
      streamingMessageRef.current += chunk
      // Update the message in state
      if (streamingMessageIdRef.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMessageIdRef.current
              ? { ...msg, content: streamingMessageRef.current }
              : msg
          )
        )
      }
    })

    const unsubError = window.api.onChatError((errorMsg) => {
      setError(errorMsg)
      setIsLoading(false)
      streamingMessageIdRef.current = null
    })

    const unsubComplete = window.api.onChatComplete(() => {
      setIsLoading(false)
      setActiveTool(null)
      streamingMessageIdRef.current = null
      streamingMessageRef.current = ''
    })

    // Tool execution events - embed tool calls into the response stream
    const unsubToolStart = window.api.onToolStart((data) => {
      console.log('[Chat] Tool started:', data)
      setActiveTool({ toolName: data.toolName, description: data.description })

      // Append tool call indicator to the streaming message
      const toolMarker = `\n\n> 🔧 **${data.description}**...\n\n`
      streamingMessageRef.current += toolMarker
      if (streamingMessageIdRef.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMessageIdRef.current
              ? { ...msg, content: streamingMessageRef.current }
              : msg
          )
        )
      }
    })

    const unsubToolEnd = window.api.onToolEnd((data) => {
      console.log('[Chat] Tool ended:', data)
      setActiveTool(null)
    })

    return () => {
      unsubChunk()
      unsubError()
      unsubComplete()
      unsubToolStart()
      unsubToolEnd()
    }
  }, [])

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!isReady) {
        setError('Chat not ready. API key may not be configured.')
        return
      }

      setError(null)
      setIsLoading(true)

      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content
      }
      setMessages((prev) => [...prev, userMessage])

      // Create placeholder for assistant message
      const assistantMessageId = (Date.now() + 1).toString()
      streamingMessageIdRef.current = assistantMessageId
      streamingMessageRef.current = ''

      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: ''
      }
      setMessages((prev) => [...prev, assistantMessage])

      // Prepare messages for API (convert to ChatMessage format)
      const chatMessages = [...messages, userMessage].map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))

      try {
        const result = await window.api.chatSend({
          messages: chatMessages,
          systemPrompt: `You are an expert software engineer assistant with direct access to the user's codebase. Your role is to help developers understand, navigate, and improve their code.

## Your Capabilities

You have access to three powerful tools to interact with the codebase:

1. **list_files** - Get the file tree structure with line counts. Use this FIRST when you need to understand the project structure or find where code lives.

2. **search_codebase** - Search for text patterns using ripgrep. Use this to find:
   - Function/class definitions
   - Symbol usages and references
   - Import statements
   - Specific code patterns or text

3. **read_file** - Read file contents (full or specific line ranges). Use this to examine implementations, understand code flow, or get context.

## Guidelines

- **Explore first**: When asked about the codebase, start by listing files or searching to understand the structure before making assumptions.
- **Use tools proactively**: Don't hesitate to use multiple tools to gather context. It's better to have complete information.
- **Be specific with searches**: Use targeted patterns to find relevant code quickly.
- **Reference actual code**: When explaining, refer to specific files and line numbers you've seen.
- **Be concise but thorough**: Give clear, actionable answers backed by what you found in the codebase.
- **Suggest improvements**: When you spot potential issues or improvements, point them out.

## Response Style

- Use code blocks 
- Reference file paths and line numbers when discussing code
- Explain your reasoning when analyzing code
- Provide complete, working solutions when helping with coding tasks

You are working within a specific project directory. All file paths are relative to the project root.`
        })

        if (!result.success && result.error) {
          setError(result.error)
          // Remove the empty assistant message on error
          setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId))
        }
      } catch (err) {
        console.error('Failed to send message:', err)
        setError(err instanceof Error ? err.message : 'Failed to send message')
        setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId))
        setIsLoading(false)
      }
    },
    [messages, isReady]
  )

  const handleCancel = useCallback(async () => {
    await window.api.chatCancel()
    setIsLoading(false)
  }, [])

  return (
    <div className="absolute right-4 top-4 bottom-4 flex">
      <Resizable
        defaultSize={{ width: 400, height: '100%' }}
        minWidth={300}
        maxWidth={600}
        enable={{ left: true, right: false, top: false, bottom: false }}
        boundsByDirection
        className="h-full"
        handleStyles={{
          left: {
            width: '6px',
            left: '-3px',
            cursor: 'col-resize'
          }
        }}
        handleClasses={{
          left: 'hover:bg-cyan-500/30 transition-colors'
        }}
      >
        <Card className="h-full flex flex-col border-slate-800/50 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <CardHeader className="shrink-0 border-b border-slate-800/50 pb-4">
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <MessageSquare className="h-5 w-5 text-cyan-400" />
              Chat
              {!isReady && (
                <span className="ml-auto text-xs text-amber-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Not configured
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 min-h-0">
            {error && (
              <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
            <MessageList messages={messages} />
            {activeTool && (
              <div className="px-4 py-2 bg-cyan-500/10 border-t border-cyan-500/20 flex items-center gap-2">
                {activeTool.toolName === 'search_codebase' ? (
                  <Search className="h-4 w-4 text-cyan-400" />
                ) : activeTool.toolName === 'read_file' ? (
                  <FileText className="h-4 w-4 text-cyan-400" />
                ) : activeTool.toolName === 'list_files' ? (
                  <FolderTree className="h-4 w-4 text-cyan-400" />
                ) : (
                  <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
                )}
                <span className="text-xs text-cyan-300">{activeTool.description}</span>
                <Loader2 className="h-3 w-3 text-cyan-400 animate-spin ml-auto" />
              </div>
            )}
            <Composer
              onSendMessage={handleSendMessage}
              onCancel={handleCancel}
              isLoading={isLoading}
              disabled={!isReady}
            />
          </CardContent>
        </Card>
      </Resizable>
    </div>
  )
}
