import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface MessageListProps {
  messages: Message[]
}

/**
 * CodeMirror extensions for read-only display
 */
const readOnlyExtensions = [
  javascript({ jsx: true, typescript: true }),
  EditorView.editable.of(false),
  EditorView.lineWrapping,
  EditorView.theme({
    '&': { fontSize: '12px' },
    '.cm-content': { padding: '8px 0' },
    '.cm-gutters': { display: 'none' },
    '.cm-line': { padding: '0 12px' }
  })
]

/**
 * CodeBlock component using CodeMirror for syntax highlighting
 */
function CodeBlock({ code, language }: { code: string; language: string }): React.JSX.Element {
  return (
    <div className="my-2 rounded-lg overflow-hidden bg-slate-950/80 border border-slate-700/50">
      {language && (
        <div className="px-3 py-1 bg-slate-800/50 text-xs text-slate-400 border-b border-slate-700/50">
          {language}
        </div>
      )}
      <CodeMirror value={code} theme={oneDark} extensions={readOnlyExtensions} basicSetup={false} />
    </div>
  )
}

/**
 * Custom code component for CodeMirror syntax highlighting
 * All other elements use Tailwind typography (prose) classes
 */
const markdownComponents = {
  // Code blocks with CodeMirror syntax highlighting
  code: ({
    className,
    children
  }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
    const isInline = !className?.includes('language-')
    const language = className?.replace('language-', '') || ''
    const code = String(children).replace(/\n$/, '')

    if (isInline) {
      // Inline code - let prose handle it but override some styles
      return <code className="!bg-slate-700/50 !text-cyan-300">{children}</code>
    }

    // Block code - use CodeMirror for syntax highlighting
    return <CodeBlock code={code} language={language} />
  }
}

export function MessageList({ messages }: MessageListProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <ScrollArea className="flex-1 px-4">
      <div className="flex flex-col gap-3 py-4">
        {messages.map((message) => (
          <div key={message.id}>
            {message.role === 'user' ? (
              // User messages: right-aligned bubble
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-cyan-500/20 text-cyan-50 border border-cyan-500/30">
                  {message.content}
                </div>
              </div>
            ) : (
              // Assistant messages: full width with prose styling
              <div className="prose prose-invert prose-sm max-w-none prose-headings:text-slate-100 prose-p:text-slate-200 prose-strong:text-slate-100 prose-a:text-cyan-400 prose-code:text-cyan-300 prose-code:bg-slate-700/50 prose-li:text-slate-200 prose-li:marker:text-slate-500 prose-blockquote:border-cyan-500/50 prose-blockquote:text-slate-300">
                <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
