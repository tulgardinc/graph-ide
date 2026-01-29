import { GraphPanel } from './components/graph/GraphPanel'
import { ChatPanel } from './components/chat/ChatPanel'

function App(): React.JSX.Element {
  return (
    <div className="h-screen w-screen bg-slate-950 relative">
      <GraphPanel />
      <ChatPanel />
    </div>
  )
}

export default App
