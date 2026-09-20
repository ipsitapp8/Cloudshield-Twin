import { useState } from 'react'
import { LiveProvider } from './hooks/LiveContext'
import { ConnectionBadge } from './components/ConnectionBadge'
import { ReplayControls } from './components/ReplayControls'
import { TwinDashboard } from './components/TwinDashboard'
import { FindingsPanel } from './components/FindingsPanel'
import { FailurePanel } from './components/FailurePanel'
import { AttackPanel } from './components/AttackPanel'
import { SpofPanel } from './components/SpofPanel'
import { ProbePanel } from './components/ProbePanel'
import { EventsPanel } from './components/EventsPanel'
import { ExplainPanel } from './components/ExplainPanel'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', render: () => <TwinDashboard /> },
  { id: 'findings', label: 'Findings & Fix', render: () => <FindingsPanel /> },
  { id: 'failure', label: 'Failure', render: () => <FailurePanel /> },
  { id: 'attack', label: 'Attack', render: () => <AttackPanel /> },
  { id: 'spof', label: 'SPOF', render: () => <SpofPanel /> },
  { id: 'probe', label: 'Probe', render: () => <ProbePanel /> },
  { id: 'events', label: 'Events', render: () => <EventsPanel /> },
  { id: 'explain', label: 'Explain', render: () => <ExplainPanel /> },
] as const

function Shell() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('dashboard')
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100">CloudShield Twin</h1>
          <p className="text-xs text-slate-500">Observe → Understand → Simulate → Remediate → Prove</p>
        </div>
        <div className="flex items-center gap-3">
          <ReplayControls />
          <ConnectionBadge />
        </div>
      </header>

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={t.id === tab ? 'page' : undefined}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              t.id === tab
                ? 'bg-purple-800 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>{active.render()}</main>
    </div>
  )
}

export default function App() {
  return (
    <LiveProvider>
      <Shell />
    </LiveProvider>
  )
}
