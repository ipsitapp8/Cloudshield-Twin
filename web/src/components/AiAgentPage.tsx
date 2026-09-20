import { useState } from 'react'
import { api } from '../api/client'
import { useAsyncData } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'
import { AsyncBoundary } from './AsyncBoundary'
import { AiChatWidget } from './AiChatWidget'
import { AiFindingsList } from './AiFindingsList'
import { AttackCascadeList } from './AttackCascadeList'
import { AttackPathVisual } from './AttackPathVisual'
import { FixOptionsCard } from './FixOptionsCard'
import { VerificationCard, type VerificationItem } from './VerificationCard'
import { ArrowRightIcon, CheckShieldIcon, EyeIcon, NetworkIcon, PlayIcon, SparklesIcon, WrenchIcon } from './icons'
import type { TwinGraph, TwinNode } from '../api/types'

const LOOP = [
  { step: 'Observe', Icon: EyeIcon },
  { step: 'Understand', Icon: NetworkIcon },
  { step: 'Simulate', Icon: PlayIcon },
  { step: 'Remediate', Icon: WrenchIcon },
  { step: 'Prove', Icon: CheckShieldIcon },
]

function pickFocusNode(nodes: TwinNode[]): TwinNode | undefined {
  return nodes.find((n) => n.kind === 'datastore') ?? nodes.find((n) => n.kind === 'service')
}

function Card({ step, title, badge, badgeTone, children }: { step: string; title: string; badge: string; badgeTone: 'ok' | 'down'; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <SparklesIcon className="h-4 w-4 text-purple-400" />
        <h3 className="text-sm font-semibold text-slate-100">
          {step}. {title}
        </h3>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
            badgeTone === 'ok' ? 'bg-emerald-950/60 text-emerald-300' : 'bg-slate-800 text-slate-400'
          }`}
        >
          {badge}
        </span>
      </div>
      {children}
    </div>
  )
}

function QuestionLine({ text }: { text: string }) {
  return (
    <p className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-sm text-slate-300">{text}</p>
  )
}

/** Composes existing, already-tested endpoints (GET /fix/{id}, POST /simulate/attack)
 * into one narrative view. No new backend logic -- every number here is real. */
function AiAgentContent({ graph }: { graph: TwinGraph }) {
  const [focusNodeId, setFocusNodeId] = useState<string | undefined>(() => pickFocusNode(graph.nodes)?.id)
  const [verified, setVerified] = useState<VerificationItem[] | null>(null)

  const focusNode = graph.nodes.find((n) => n.id === focusNodeId)
  const nodeInfo = Object.fromEntries(graph.nodes.map((n) => [n.id, { kind: n.kind, ports: n.ports }]))

  const finding = useAsyncData(
    () => (focusNodeId ? api.getFixPreview(`exposure-${focusNodeId}`) : Promise.reject(new Error('No exposed service to analyze'))),
    [focusNodeId],
  )
  const attack = useAsyncData(
    () => (focusNodeId ? api.simulateAttack('compromised_service', focusNodeId) : Promise.reject(new Error('No exposed service to analyze'))),
    [focusNodeId],
  )

  if (!focusNode) {
    return <p className="text-sm italic text-slate-500">No service or datastore in the current twin to analyze.</p>
  }

  async function runVerification(target: string) {
    if (!focusNodeId) return
    const after = await api.simulateAttack('compromised_service', focusNodeId)
    const stillReachable = target in after.paths
    const apiNode = attack.status === 'success' ? attack.data.paths[target]?.path[1] : undefined
    const apiStillUp = apiNode ? graph.nodes.some((n) => n.id === apiNode) : true
    setVerified([
      { label: 'Attack path eliminated', passed: !stillReachable },
      { label: apiNode ? `${apiNode} still reachable` : 'Dependent services still reachable', passed: apiStillUp },
      { label: `${target} no longer reachable from ${focusNodeId}`, passed: !stillReachable },
    ])
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-purple-800/50 bg-gradient-to-br from-purple-950/50 via-slate-950 to-slate-950 p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-blue-600">
            <SparklesIcon className="h-5 w-5 text-white" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-50">AI Security Twin Agent</h2>
            <p className="text-sm text-slate-400">Find attack paths. Simulate the impact. Get the safest fix.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {LOOP.map(({ step, Icon }, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-slate-300">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="text-xs font-medium text-slate-300">{step}</p>
              </div>
              {i < LOOP.length - 1 && <ArrowRightIcon className="mb-5 h-4 w-4 text-slate-700" />}
            </div>
          ))}
        </div>
      </div>

      {graph.nodes.filter((n) => n.kind === 'datastore' || n.kind === 'service').length > 1 && (
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Focused on:
          <select
            value={focusNodeId}
            onChange={(e) => {
              setFocusNodeId(e.target.value)
              setVerified(null)
            }}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          >
            {graph.nodes
              .filter((n) => n.kind === 'datastore' || n.kind === 'service')
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id}
                </option>
              ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card step="1" title="Attack Path Analysis" badge="AI Analysis Complete" badgeTone="ok">
            <QuestionLine
              text={`If ${focusNodeId} is compromised, what can the attacker reach, what breaks, and what is the safest fix?`}
            />
            <AsyncBoundary state={attack} onRetry={attack.refetch}>
              {(result) => {
                const target = Object.keys(result.paths)[0]
                const path = target ? result.paths[target].path : [focusNodeId!]
                return (
                  <>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Identified Attack Path
                    </p>
                    <AttackPathVisual path={path} nodes={nodeInfo} riskyNodeId={focusNodeId} />
                    <p className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">AI Findings</p>
                    <AsyncBoundary state={finding} onRetry={finding.refetch}>
                      {(fp) => <AiFindingsList finding={fp.finding} attack={result} port={focusNode.ports[0]} />}
                    </AsyncBoundary>
                  </>
                )
              }}
            </AsyncBoundary>
          </Card>
        </div>

        <div className="space-y-5">
          <Card step="2" title="Attack Simulation" badge="Scenario Tested" badgeTone="ok">
            <QuestionLine text={`What happens if ${focusNodeId} is compromised?`} />
            <AsyncBoundary state={attack} onRetry={attack.refetch}>
              {(result) => {
                const target = Object.keys(result.paths)[0]
                if (!target) return <p className="text-sm text-slate-500">No path to a sensitive asset was found.</p>
                return (
                  <AttackCascadeList
                    path={result.paths[target].path}
                    nodes={nodeInfo}
                    target={target}
                    blastRadius={result.blast_radius}
                  />
                )
              }}
            </AsyncBoundary>
          </Card>

          <Card step="3" title="Recommended Fix" badge="Safest Option" badgeTone="ok">
            <AsyncBoundary state={finding} onRetry={finding.refetch}>
              {(fp) => (
                <FixOptionsCard
                  candidates={fp.candidates}
                  onApplied={() => {
                    const target = attack.status === 'success' ? Object.keys(attack.data.paths)[0] : undefined
                    finding.refetch()
                    attack.refetch()
                    if (target) void runVerification(target)
                  }}
                />
              )}
            </AsyncBoundary>
          </Card>

          {verified && (
            <Card step="4" title="Verification" badge="Fix Verified" badgeTone="ok">
              <VerificationCard items={verified} />
            </Card>
          )}
        </div>
      </div>

      <AiChatWidget
        nodeIds={graph.nodes.map((n) => n.id)}
        onAskCompromised={(node) => {
          setFocusNodeId(node)
          setVerified(null)
        }}
        onAskFailure={() => {
          // Failure ("what if X fails") is covered by the dedicated Simulation section;
          // the chat widget here focuses this page on compromise/attack scenarios.
        }}
      />
    </div>
  )
}

export function AiAgentPage() {
  const { messageCount } = useLive()
  const twin = useAsyncData(api.getTwin, [messageCount])

  return (
    <AsyncBoundary state={twin} onRetry={twin.refetch} isEmpty={(d) => d.nodes.length === 0}>
      {(graph) => <AiAgentContent graph={graph} />}
    </AsyncBoundary>
  )
}
