import { useState, useCallback } from 'react'
import { MessageSquare } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@renderer/components/ui/card'
import { MessageList, type Message } from './MessageList'
import { Composer } from './Composer'

const EXAMPLE_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'user',
    content: 'Can you explain the architecture of this system?'
  },
  {
    id: '2',
    role: 'assistant',
    content:
      'This system has a React web app frontend that connects to a Node.js server backend. The server handles API requests and communicates with a PostgreSQL database for persistent storage. Authentication is handled by an external Auth Provider using OAuth 2.0.'
  },
  {
    id: '3',
    role: 'user',
    content: 'What database are we using?'
  },
  {
    id: '4',
    role: 'assistant',
    content:
      'The system uses PostgreSQL as the main data store. It provides ACID compliance, excellent performance for complex queries, and robust support for JSON data types which is useful for storing flexible schema data alongside structured tables.'
  }
]

export function ChatPanel(): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>(EXAMPLE_MESSAGES)

  const handleSendMessage = useCallback((content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content
    }
    setMessages((prev) => [...prev, newMessage])

    // Simulate assistant response after a short delay
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I received your message: "${content}". This is a demo response - in the future, this will be connected to an AI backend.`
      }
      setMessages((prev) => [...prev, assistantMessage])
    }, 500)
  }, [])

  return (
    <Card className="absolute right-4 top-4 bottom-4 w-[400px] flex flex-col border-slate-800/50 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
      <CardHeader className="shrink-0 border-b border-slate-800/50 pb-4">
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <MessageSquare className="h-5 w-5 text-cyan-400" />
          Chat
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        <MessageList messages={messages} />
        <Composer onSendMessage={handleSendMessage} />
      </CardContent>
    </Card>
  )
}
