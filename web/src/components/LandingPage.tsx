const LOOP = [
  {
    step: 'Observe',
    detail: 'A read-only agent on the VM reports listeners, connections, and firewall rules every few seconds.',
  },
  {
    step: 'Understand',
    detail: 'The backend builds a live graph of every service, its dependencies, and what is actually exposed.',
  },
  {
    step: 'Simulate',
    detail: 'Fail a service or run an attack path against the graph and see the blast radius before it happens.',
  },
  {
    step: 'Remediate',
    detail: 'Get a narrowly-scoped, pre-validated fix — it can never touch SSH or the agent channel.',
  },
  {
    step: 'Prove',
    detail: 'Apply behind explicit confirmation, verify with an independent TCP probe, and roll back anytime.',
  },
]

const FEATURES = [
  { label: 'Dashboard', detail: 'Live topology graph of every node, edge, and exposure state.' },
  { label: 'Findings & Fix', detail: '3-layer exposure evidence (bind / firewall / security group) per service.' },
  { label: 'Failure', detail: 'Simulate a service going down and see exactly what cascades.' },
  { label: 'Attack', detail: 'Potential attack paths, tagged with MITRE technique IDs, never a confirmed breach.' },
  { label: 'SPOF', detail: 'Every node ranked by how many endpoints it would take down.' },
  { label: 'Probe', detail: 'An independent TCP connect check — proof the world outside the twin agrees.' },
  { label: 'Events', detail: 'A live feed of drift: new exposures, new listeners, new flows.' },
  { label: 'Explain', detail: 'Plain-English summaries from structured data — deterministic by default, AI optional.' },
]

export function LandingPage({ onEnter }: { onEnter: (playStory?: boolean) => void }) {
  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-10 text-slate-200">
      <section className="space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-purple-400">
          Observe → Understand → Simulate → Remediate → Prove
        </p>
        <h1 className="text-4xl font-bold text-slate-50">CloudShield Twin</h1>
        <p className="mx-auto max-w-2xl text-base text-slate-300">
          A live digital twin of your cloud VM — it knows what is really running, what depends on what,
          what breaks if a service goes down, and what an attacker could reach. Then it proposes the
          safest possible fix, and proves the fix actually worked.
        </p>
        <div className="flex flex-col items-center gap-2 pt-2">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onEnter(true)}
              className="rounded bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
            >
              ▶ Watch a 90-second incident
            </button>
            <button
              type="button"
              onClick={() => onEnter(false)}
              className="rounded border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Launch the Twin →
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Runs fully offline in replay mode — no AWS account, no credentials, no real VM needed to try it.
          </p>
        </div>
      </section>

      <section className="mt-12 space-y-3 rounded border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">The problem</h2>
        <p className="text-sm text-slate-300">
          Cloud infrastructure is opaque by default. You don't really know what's listening on which port,
          what actually depends on what, what breaks if one service goes down, or what an attacker could
          reach through a single misconfiguration — until an incident forces you to find out the hard way.
          CloudShield Twin builds that picture continuously, and lets you rehearse the bad day before it
          happens.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">How it works</h2>
        <ol className="space-y-2">
          {LOOP.map((item, i) => (
            <li key={item.step} className="flex gap-3 rounded border border-slate-800 bg-slate-900/40 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-800 text-xs font-bold text-white">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-100">{item.step}</p>
                <p className="text-xs text-slate-400">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">What's inside</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.label} className="rounded border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-sm font-semibold text-slate-100">{f.label}</p>
              <p className="text-xs text-slate-400">{f.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-2 rounded border border-emerald-800 bg-emerald-950/20 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Safe by construction</h2>
        <p className="text-sm text-slate-300">
          Every fix is previewed before it can be applied, requires explicit confirmation, can only touch a
          single allowlisted security group and port, can never touch SSH or the agent channel, is written
          to an append-only audit log, and can be rolled back. There is no arbitrary shell, iptables, or
          Terraform execution anywhere in this codebase — reviewed and regression-tested for it.
        </p>
      </section>

      <section className="mt-8 mb-12 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Run it yourself</h2>
        <pre className="overflow-x-auto rounded border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300">
{`pip install -e ".[dev]"
uvicorn backend.main:app --reload      # backend, fake mode, no AWS credentials

cd web && npm install
npm run dev                            # frontend`}
        </pre>
        <p className="text-xs text-slate-500">Full setup, testing, and safety details are in README.md.</p>
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => onEnter(false)}
            className="rounded bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-600"
          >
            Launch the Twin →
          </button>
        </div>
      </section>
    </div>
  )
}
