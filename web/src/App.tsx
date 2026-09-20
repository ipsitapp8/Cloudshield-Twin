import { useState } from 'react'
import { LiveProvider } from './hooks/LiveContext'
import { ConnectionBadge } from './components/ConnectionBadge'
import { ReplayControls } from './components/ReplayControls'
import { TwinDashboard } from './components/TwinDashboard'
import { FindingsPanel } from './components/FindingsPanel'
import { FailurePanel } from './components/FailurePanel'
import { AttackPanel } from './components/AttackPanel'
import { SpofPanel } from './components/SpofPanel'
import { PerformancePanel } from './components/PerformancePanel'
import { ProbePanel } from './components/ProbePanel'
import { EventsPanel } from './components/EventsPanel'
import { ExplainPanel } from './components/ExplainPanel'
import { LandingPage } from './components/LandingPage'
import { RiskBar } from './components/RiskBar'
import { AgentStatusBadge } from './components/AgentStatusBadge'
import { ToastStack } from './components/ToastStack'
import { IncidentStory } from './components/IncidentStory'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', render: () => <TwinDashboard /> },
  { id: 'findings', label: 'Findings & Fix', render: () => <FindingsPanel /> },
  { id: 'failure', label: 'Failure', render: () => <FailurePanel /> },
  { id: 'attack', label: 'Attack', render: () => <AttackPanel /> },
  { id: 'spof', label: 'SPOF', render: () => <SpofPanel /> },
  { id: 'performance', label: 'Performance', render: () => <PerformancePanel /> },
  { id: 'probe', label: 'Probe', render: () => <ProbePanel /> },
  { id: 'events', label: 'Events', render: () => <EventsPanel /> },
  { id: 'explain', label: 'Explain', render: () => <ExplainPanel /> },
] as const

function Shell({ onHome, autoStartStory }: { onHome: () => void; autoStartStory: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('dashboard')
  const [storyOpen, setStoryOpen] = useState(autoStartStory)
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <button
            type="button"
            onClick={onHome}
            className="text-left text-lg font-bold text-slate-100 hover:text-purple-400"
          >
            CloudShield Twin
          </button>
          <p className="text-xs text-slate-500">Observe → Understand → Simulate → Remediate → Prove</p>
        </div>
        <div className="flex items-center gap-4">
          <AgentStatusBadge />
          <RiskBar />
          <button
            type="button"
            onClick={() => setStoryOpen(true)}
            className="rounded border border-purple-700 px-3 py-1 text-xs font-medium text-purple-300 hover:bg-purple-900/30"
          >
            ▶ Play incident
          </button>
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

      <main key={tab} className="animate-fade-slide-up">
        {active.render()}
      </main>

      {storyOpen && <IncidentStory onClose={() => setStoryOpen(false)} />}
      <ToastStack />
    </div>
  )
}

export default function App() {
  const [entered, setEntered] = useState(false)
  const [startStory, setStartStory] = useState(false)

  if (!entered) {
    return (
      <LandingPage
        onEnter={(playStory) => {
          setStartStory(Boolean(playStory))
          setEntered(true)
        }}
      />
    )
  }

  return (
    <LiveProvider>
      <Shell onHome={() => setEntered(false)} autoStartStory={startStory} />
    </LiveProvider>
  )
}
