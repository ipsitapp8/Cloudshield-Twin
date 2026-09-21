import { useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api/client'
import { useAsyncAction } from './hooks/useAsync'
import { LiveProvider } from './hooks/LiveContext'
import { useAgentMode } from './hooks/useAgentMode'
import { ConnectionBadge } from './components/ConnectionBadge'
import { ConnectVM } from './components/ConnectVM'
import { ReplayControls } from './components/ReplayControls'
import { TwinDashboard } from './components/TwinDashboard'
import { FindingsPanel } from './components/FindingsPanel'
import { FailurePanel } from './components/FailurePanel'
import { AttackPanel } from './components/AttackPanel'
import { SpofPanel } from './components/SpofPanel'
import { PerformancePanel } from './components/PerformancePanel'
import { ProbePanel } from './components/ProbePanel'
import { ProcessesPanel } from './components/ProcessesPanel'
import { EventsPanel } from './components/EventsPanel'
import { ExplainPanel } from './components/ExplainPanel'
import { AiAgentPage } from './components/AiAgentPage'
import { LandingPage } from './components/LandingPage'
import { RiskBar } from './components/RiskBar'
import { AgentStatusBadge } from './components/AgentStatusBadge'
import { ToastStack } from './components/ToastStack'
import { IncidentStory } from './components/IncidentStory'
import {
  EyeIcon,
  PlayIcon,
  ReportIcon,
  ServerIcon,
  ShieldIcon,
  SparklesIcon,
  UserCircleIcon,
  WrenchIcon,
} from './components/icons'

interface TabDef {
  id: string
  label: string
  render: () => ReactNode
}

interface SectionDef {
  id: string
  label: string
  icon: (p: { className?: string }) => ReactNode
  badge?: string
  tabs: TabDef[]
}

const SECTIONS: SectionDef[] = [
  { id: 'overview', label: 'Overview', icon: EyeIcon, tabs: [{ id: 'dashboard', label: 'Overview', render: () => <TwinDashboard /> }] },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    icon: ServerIcon,
    tabs: [
      { id: 'performance', label: 'Performance', render: () => <PerformancePanel /> },
      { id: 'spof', label: 'SPOF', render: () => <SpofPanel /> },
      { id: 'probe', label: 'Probe', render: () => <ProbePanel /> },
      { id: 'processes', label: 'Processes', render: () => <ProcessesPanel /> },
    ],
  },
  {
    id: 'simulation',
    label: 'Simulation',
    icon: PlayIcon,
    tabs: [
      { id: 'failure', label: 'Failure', render: () => <FailurePanel /> },
      { id: 'attack', label: 'Attack', render: () => <AttackPanel /> },
    ],
  },
  { id: 'remediation', label: 'Remediation', icon: WrenchIcon, tabs: [{ id: 'findings', label: 'Findings & Fix', render: () => <FindingsPanel /> }] },
  { id: 'ai-agent', label: 'AI Agent', icon: SparklesIcon, badge: 'Beta', tabs: [{ id: 'ai-agent', label: 'AI Agent', render: () => <AiAgentPage /> }] },
  {
    id: 'reports',
    label: 'Reports',
    icon: ReportIcon,
    tabs: [
      { id: 'events', label: 'Events', render: () => <EventsPanel /> },
      { id: 'explain', label: 'Explain', render: () => <ExplainPanel /> },
    ],
  },
]

function findSection(tabId: string): SectionDef {
  return SECTIONS.find((s) => s.tabs.some((t) => t.id === tabId)) ?? SECTIONS[0]
}

function Sidebar({ activeSectionId, onSelect, onHome }: { activeSectionId: string; onSelect: (tabId: string) => void; onHome: () => void }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60 px-3 py-4">
      <button type="button" onClick={onHome} className="mb-6 flex items-center gap-2 px-1 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-600">
          <ShieldIcon className="h-4.5 w-4.5 text-white" />
        </span>
        <span className="text-sm font-bold tracking-tight text-slate-100">CloudShield Twin</span>
      </button>

      <nav className="flex flex-col gap-1" aria-label="sections">
        {SECTIONS.map((section) => {
          const Icon = section.icon
          const isActive = section.id === activeSectionId
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.tabs[0].id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-purple-700/90 text-white' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{section.label}</span>
              {section.badge && (
                <span className="rounded-full bg-purple-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-purple-300">
                  {section.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

function ScanNowButton() {
  const scan = useAsyncAction(api.scanNow)
  const label =
    scan.state.status === 'loading'
      ? 'Scanning…'
      : scan.state.status === 'success'
        ? `Scanned ${Math.max(0, Math.round(Date.now() / 1000 - scan.state.data.scanned_at))}s ago`
        : 'Scan Now'

  return (
    <button
      type="button"
      onClick={() => scan.run().catch(() => {})}
      disabled={scan.state.status === 'loading'}
      className="rounded border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
    >
      {label}
    </button>
  )
}

/** The incident walkthrough narrates fixture data via replayReset()/replayStep(), which
 * the backend rejects (409) once a real agent is connected (README: LIVE mode never
 * mixes with replay). Disable the trigger instead of letting users hit that as a
 * confusing "something went wrong" error. */
function IncidentButton({ onOpen }: { onOpen: () => void }) {
  const isLive = useAgentMode() === 'live'

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={isLive}
      title={isLive ? 'Disabled while a real VM is connected — this walkthrough uses demo/replay data' : undefined}
      className="rounded border border-purple-700 px-2.5 py-1 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-900/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      ▶ Incident
    </button>
  )
}

function Shell({ onHome, autoStartStory }: { onHome: () => void; autoStartStory: boolean }) {
  const [tab, setTab] = useState('dashboard')
  const [storyOpen, setStoryOpen] = useState(autoStartStory)
  const activeSection = findSection(tab)
  const activeTab = activeSection.tabs.find((t) => t.id === tab) ?? activeSection.tabs[0]

  return (
    <div className="flex min-h-screen bg-[#0b0d12]">
      <Sidebar activeSectionId={activeSection.id} onSelect={setTab} onHome={onHome} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-3">
          <p className="flex items-center gap-1.5 text-sm text-slate-400">
            <span className="font-semibold text-slate-100">CloudShield Twin</span>
            <span className="text-slate-600">|</span>
            <span>Digital Twin</span>
            <span className="text-slate-600">+</span>
            <span className="text-slate-200">{activeSection.label}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <RiskBar />
            <ScanNowButton />
            <ReplayControls />
            <IncidentButton onOpen={() => setStoryOpen(true)} />
            <span className="h-5 w-px bg-slate-700" aria-hidden="true" />
            <AgentStatusBadge />
            <ConnectionBadge />
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-400">
              <UserCircleIcon className="h-5 w-5" />
            </span>
          </div>
        </header>

        <main className="flex-1 px-6 py-5">
          {activeSection.tabs.length > 1 && (
            <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-800 pb-2" aria-label="sub-sections">
              {activeSection.tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={t.id === tab ? 'page' : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    t.id === tab
                      ? 'bg-purple-700 text-white shadow-sm shadow-purple-900/50'
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          )}

          <div key={tab} className="animate-fade-slide-up">
            {activeTab.render()}
          </div>
        </main>
      </div>

      {storyOpen && <IncidentStory onClose={() => setStoryOpen(false)} />}
      <ToastStack />
    </div>
  )
}

export default function App() {
  const [entered, setEntered] = useState(false)
  const [startStory, setStartStory] = useState(false)
  // "Watch Demo" skips the gate -- IncidentStory's first beat already calls
  // replayReset() itself, so it satisfies the explicit-demo-activation requirement
  // on its own. Any other entry point must pass through ConnectVM first.
  const [connected, setConnected] = useState(false)

  if (!entered) {
    return (
      <LandingPage
        onEnter={(playStory) => {
          setStartStory(Boolean(playStory))
          setConnected(Boolean(playStory))
          setEntered(true)
        }}
      />
    )
  }

  if (!connected) {
    return <ConnectVM onConnected={() => setConnected(true)} />
  }

  return (
    <LiveProvider>
      <Shell
        onHome={() => {
          setEntered(false)
          setConnected(false)
        }}
        autoStartStory={startStory}
      />
    </LiveProvider>
  )
}
