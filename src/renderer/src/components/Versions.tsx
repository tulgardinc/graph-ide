import { useState } from 'react'

function Versions(): React.JSX.Element {
  const [versions] = useState(window.electron.process.versions)

  return (
    <ul className="flex flex-wrap items-center justify-center gap-3 rounded-full border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-300">
      <li className="rounded-full border border-slate-700 px-3 py-1">
        Electron v{versions.electron}
      </li>
      <li className="rounded-full border border-slate-700 px-3 py-1">
        Chromium v{versions.chrome}
      </li>
      <li className="rounded-full border border-slate-700 px-3 py-1">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
