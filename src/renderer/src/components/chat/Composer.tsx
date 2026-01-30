import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react'
import { Send, Square } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

interface ComposerProps {
  onSendMessage: (content: string) => void
  onCancel?: () => void
  isLoading?: boolean
  disabled?: boolean
}

export function Composer({
  onSendMessage,
  onCancel,
  isLoading = false,
  disabled = false
}: ComposerProps): React.JSX.Element {
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      // Reset height to calculate proper scrollHeight
      textarea.style.height = 'auto'
      // Set new height (max 200px)
      const newHeight = Math.min(textarea.scrollHeight, 200)
      textarea.style.height = `${newHeight}px`
    }
  }, [inputValue])

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (trimmed && !disabled && !isLoading) {
      onSendMessage(trimmed)
      setInputValue('')
    }
  }, [inputValue, onSendMessage, disabled, isLoading])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleCancel = useCallback(() => {
    onCancel?.()
  }, [onCancel])

  return (
    <div className="flex items-end gap-2 border-t border-slate-800/50 bg-slate-900/50 p-4">
      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          isLoading ? 'Waiting for response...' : 'Type a message... (Shift+Enter for new line)'
        }
        disabled={disabled || isLoading}
        rows={1}
        className="flex-1 min-h-[40px] max-h-[200px] px-3 py-2 text-sm rounded-md resize-none overflow-hidden border border-slate-700/50 bg-slate-800/50 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {isLoading ? (
        <Button
          onClick={handleCancel}
          size="icon"
          variant="outline"
          className="shrink-0 h-10 w-10 border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          onClick={handleSend}
          disabled={disabled || !inputValue.trim()}
          size="icon"
          className="shrink-0 h-10 w-10 bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500"
        >
          <Send className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
