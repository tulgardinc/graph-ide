import { useState, useCallback, type KeyboardEvent } from 'react'
import { Send, Square } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

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

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (trimmed && !disabled && !isLoading) {
      onSendMessage(trimmed)
      setInputValue('')
    }
  }, [inputValue, onSendMessage, disabled, isLoading])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
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
    <div className="flex items-center gap-2 border-t border-slate-800/50 bg-slate-900/50 p-4">
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isLoading ? 'Waiting for response...' : 'Type a message...'}
        disabled={disabled || isLoading}
        className="flex-1 border-slate-700/50 bg-slate-800/50 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-500/50"
      />
      {isLoading ? (
        <Button
          onClick={handleCancel}
          size="icon"
          variant="outline"
          className="shrink-0 border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          onClick={handleSend}
          disabled={disabled || !inputValue.trim()}
          size="icon"
          className="shrink-0 bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500"
        >
          <Send className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
