import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'

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
 * Custom components for ReactMarkdown to style the rendered content
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
      return (
        <code className="px-1.5 py-0.5 bg-slate-700/50 text-cyan-300 rounded text-xs font-mono">
          {children}
        </code>
      )
    }

    return <CodeBlock code={code} language={language} />
  },

  // Paragraphs
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,

  // Headers
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-lg font-bold mb-2 text-slate-100">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-bold mb-2 text-slate-100">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-bold mb-1 text-slate-200">{children}</h3>
  ),

  // Lists
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-slate-200">{children}</li>
  ),

  // Links
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
    >
      {children}
    </a>
  ),

  // Blockquotes
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-cyan-500/50 pl-3 my-2 text-slate-300 italic">
      {children}
    </blockquote>
  ),

  // Strong and emphasis
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-slate-100">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-slate-300">{children}</em>
  ),

  // Horizontal rule
  hr: () => <hr className="my-3 border-slate-700" />
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
              // Assistant messages: full width, no bubble
              <div className="w-full min-w-0 overflow-hidden text-sm leading-relaxed text-slate-200">
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
