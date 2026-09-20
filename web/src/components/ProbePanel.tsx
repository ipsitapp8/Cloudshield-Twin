import { useState } from 'react'
import { api } from '../api/client'
import { useAsyncAction } from '../hooks/useAsync'
import { Badge } from './Badge'

/** Requirement 11: probe result display, via GET /probe (independent TCP-connect proof,
 * 2s timeout, distinguishes reachable/unreachable/unknown -- never claims "fixed" from
 * an ambiguous failure). Host is optional: leaving it blank lets the backend use the
 * twin's current public_ip. */
export function ProbePanel() {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('6379')
  const probe = useAsyncAction(api.probe)

  const portNumber = Number(port)
  const validPort = Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        External Probe
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="host (blank = current public IP)"
          aria-label="probe host"
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
        />
        <input
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="port"
          aria-label="probe port"
          className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
        />
        <button
          type="button"
          disabled={!validPort || probe.state.status === 'loading'}
          onClick={() => probe.run(portNumber, host || undefined).catch(() => {})}
          className="rounded bg-purple-700 px-3 py-1 text-xs font-medium text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Probe
        </button>
      </div>

      {probe.state.status === 'loading' && (
        <p role="status" className="text-sm text-slate-400">
          Probing (up to 2s)…
        </p>
      )}
      {probe.state.status === 'error' && (
        <p role="alert" className="text-sm text-red-400">
          {probe.state.error.message}
        </p>
      )}
      {probe.state.status === 'success' && (
        <div className="rounded border border-slate-800 p-3 text-sm">
          <p>
            <span className="font-mono">
              {probe.state.data.host}:{probe.state.data.port}
            </span>{' '}
            <Badge tone={probe.state.data.status}>{probe.state.data.status}</Badge>
          </p>
          {probe.state.data.reason && (
            <p className="mt-1 text-xs text-slate-400">reason: {probe.state.data.reason}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">{probe.state.data.elapsed_ms}ms</p>
          {probe.state.data.status === 'unknown' && (
            <p className="mt-1 text-xs italic text-amber-300">
              Ambiguous result — not proof the service is fixed or still exposed.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
