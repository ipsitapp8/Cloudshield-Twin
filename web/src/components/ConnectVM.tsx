import { useCallback, useEffect, useState } from 'react'
import { API_BASE_URL, BackendUnavailableError, api } from '../api/client'
import type { RegisterAgentResult } from '../api/types'
import { ShieldIcon } from './icons'

const POLL_INTERVAL_MS = 2000
const COPIED_RESET_MS = 1500

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      // clipboard access denied/unavailable -- the command is still visible and selectable
    }
  }

  return (
    <div className="relative mt-1">
      <pre className="overflow-x-auto rounded bg-slate-950 p-2 pr-14 text-xs text-emerald-300">
        <code>{command}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-1.5 top-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-slate-300 transition-colors hover:bg-slate-800"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}

/** The real "no VM connected" gate (STOP-spec §M): the dashboard must not render
 * until a real agent has ingested telemetry, or the user explicitly opts into
 * demo/replay mode. Owns the register -> show command -> poll -> transition flow. */
export function ConnectVM({ onConnected }: { onConnected: () => void }) {
  const [checkingInitial, setCheckingInitial] = useState(true)
  const [initialCheckError, setInitialCheckError] = useState<Error | null>(null)
  const [reg, setReg] = useState<RegisterAgentResult | null>(null)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A live/demo session may already exist (agent connected earlier, or another
  // tab activated demo mode) -- skip the gate instead of making the user re-click it.
  const checkInitial = useCallback(() => {
    setCheckingInitial(true)
    setInitialCheckError(null)
    let cancelled = false
    api
      .getConnection()
      .then((status) => {
        if (!cancelled && status.mode !== 'unconnected') onConnected()
      })
      .catch((err) => {
        if (!cancelled) setInitialCheckError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled) setCheckingInitial(false)
      })
    return () => {
      cancelled = true
    }
  }, [onConnected])

  useEffect(() => checkInitial(), [checkInitial])

  // Once a token has been issued, poll until the agent actually connects.
  useEffect(() => {
    if (!reg) return
    const id = window.setInterval(() => {
      api
        .getConnection()
        .then((status) => {
          if (status.mode === 'live') {
            window.clearInterval(id)
            onConnected()
          }
        })
        .catch(() => {
          // transient network hiccup while polling -- keep waiting silently
        })
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [reg, onConnected])

  async function handleRegister() {
    setRegistering(true)
    setError(null)
    try {
      setReg(await api.registerAgent())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRegistering(false)
    }
  }

  async function handleDemo() {
    setError(null)
    try {
      await api.replayReset()
      onConnected()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (checkingInitial) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0d12]">
        <span
          role="status"
          aria-label="Checking connection"
          className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-purple-500"
        />
      </div>
    )
  }

  if (initialCheckError) {
    const backendDown = initialCheckError instanceof BackendUnavailableError
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0d12] px-4">
        <div role="alert" className="w-full max-w-md rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-red-300">
            <span aria-hidden="true">⚠</span>
            {backendDown ? 'Backend unavailable' : 'Request failed'}
          </p>
          <p className="mt-1 text-red-200/70">{initialCheckError.message}</p>
          <button
            type="button"
            onClick={checkInitial}
            className="mt-3 rounded border border-red-800 px-3 py-1 text-xs font-medium text-red-200 transition-colors hover:bg-red-900/40"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const command = reg ? `python -m agent.agent --server ${API_BASE_URL} --token ${reg.token}` : null

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0b0d12] px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600">
        <ShieldIcon className="h-7 w-7 text-white" />
      </span>
      <h1 className="mt-5 text-xl font-bold text-slate-100">CloudShield Twin</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        No VM connected. Connect a real Linux VM to start monitoring — there's no fixture data behind this screen.
      </p>

      {!reg && (
        <button
          type="button"
          onClick={handleRegister}
          disabled={registering}
          className="mt-6 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          {registering ? 'Generating token…' : 'Connect a VM'}
        </button>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {reg && (
        <div className="mt-6 w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Set up the agent on your Linux VM</p>
          <ol className="mt-3 list-inside list-decimal space-y-3 text-sm text-slate-300">
            <li>SSH into the Linux VM you want to monitor (needs Python 3.11+ and outbound internet access).</li>
            <li>
              Get the code onto it:
              <CopyableCommand command="git clone https://github.com/ipsitapp8/Cloudshield-Twin.git && cd Cloudshield-Twin" />
            </li>
            <li>
              Install dependencies:
              <CopyableCommand command="python3 -m venv venv && source venv/bin/activate && pip install -e ." />
            </li>
            <li>
              Run the agent (your unique token is already in this command):
              {command && <CopyableCommand command={command} />}
            </li>
          </ol>
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-400" role="status">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-700 border-t-purple-500" />
            Waiting for agent… this page updates automatically once it connects.
          </p>
          <p className="mt-1 text-xs text-slate-600">Agent ID: {reg.agent_id}</p>
        </div>
      )}

      <button type="button" onClick={handleDemo} className="mt-8 text-xs text-slate-500 underline hover:text-slate-300">
        Use Demo / Replay Mode instead
      </button>
    </div>
  )
}
