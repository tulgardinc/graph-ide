import { useState, useCallback, useEffect, useRef } from 'react'
import { MessageSquare, AlertCircle } from 'lucide-react'
import { Resizable } from 're-resizable'
import { Card, CardHeader, CardTitle, CardContent } from '@renderer/components/ui/card'
import { MessageList, type Message } from './MessageList'
import { Composer } from './Composer'

export function ChatPanel(): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
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
      streamingMessageIdRef.current = null
      streamingMessageRef.current = ''
    })

    return () => {
      unsubChunk()
      unsubError()
      unsubComplete()
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
          systemPrompt:
            'You are a helpful coding assistant. You help developers understand and work with their codebase. Be concise and technical in your responses.'
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
