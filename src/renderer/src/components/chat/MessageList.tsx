import { useEffect, useRef } from 'react'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface MessageListProps {
  messages: Message[]
}

export function MessageList({ messages }: MessageListProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <ScrollArea className="flex-1 px-4">
      <div className="flex flex-col gap-4 py-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                message.role === 'user'
                  ? 'bg-cyan-500/20 text-cyan-50 border border-cyan-500/30'
                  : 'bg-slate-800/80 text-slate-200 border border-slate-700/50'
              )}
            >
              {message.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
