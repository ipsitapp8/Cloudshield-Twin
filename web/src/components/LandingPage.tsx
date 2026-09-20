import { HeroTwinVisual } from './HeroTwinVisual'
import {
  BoltIcon,
  CheckShieldIcon,
  NetworkIcon,
  PlayIcon,
  ShieldIcon,
  SparklesIcon,
  SunIcon,
  WrenchIcon,
} from './icons'

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

const BOTTOM_FEATURES = [
  { label: 'Digital Twin', detail: 'Accurate, real-time model of your cloud infrastructure.', Icon: NetworkIcon },
  { label: 'AI-Powered Analysis', detail: 'Find attack paths, simulate scenarios, and predict risks.', Icon: SparklesIcon },
  { label: 'Smart Remediation', detail: 'Get the safest fix with minimal disruption.', Icon: WrenchIcon },
  { label: 'Prove, Not Just Recommend', detail: 'Verify the fix with simulation and evidence.', Icon: CheckShieldIcon },
]

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

export function LandingPage({ onEnter }: { onEnter: (playStory?: boolean) => void }) {
  return (
    <div className="min-h-screen bg-[#0b0d12] text-slate-200">
      <nav className="flex items-center justify-between border-b border-slate-800 px-4 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-600">
            <ShieldIcon className="h-4.5 w-4.5 text-white" />
          </span>
          <span className="text-base font-bold tracking-tight text-slate-100">CloudShield Twin</span>
        </div>
        <div className="hidden items-center gap-6 text-sm md:flex">
          <button type="button" onClick={() => scrollToId('hero-top')} className="border-b-2 border-amber-400 pb-1 text-slate-100">
            Home
          </button>
          <button type="button" onClick={() => scrollToId('bottom-features')} className="text-slate-400 hover:text-slate-200">
            Features
          </button>
          <span className="text-slate-600">Use Cases</span>
          <span className="text-slate-600">Docs</span>
          <span className="text-slate-600">Pricing</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <SunIcon className="hidden h-4 w-4 text-slate-500 sm:block" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onEnter(false)}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 sm:px-4 sm:text-sm"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => onEnter(false)}
            className="flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-transform hover:scale-105 sm:px-4 sm:text-sm"
          >
            Get Started <ArrowIcon />
          </button>
        </div>
      </nav>

      <div id="hero-top" className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-4 py-12 sm:px-8 lg:grid-cols-2 lg:gap-4 lg:py-20">
        <section className="space-y-5">
          <p
            className="animate-fade-slide-up inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300"
            style={{ animationDelay: '0ms', animationFillMode: 'both' }}
          >
            <SparklesIcon className="h-3.5 w-3.5 text-purple-400" />
            AI-Powered Security for Your Cloud
          </p>
          <h1
            className="animate-fade-slide-up text-4xl font-extrabold leading-tight tracking-tight text-slate-50 sm:text-5xl"
            style={{ animationDelay: '80ms', animationFillMode: 'both' }}
          >
            See It. Simulate It.
            <br />
            <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">Secure It.</span>
          </h1>
          <p
            className="animate-fade-slide-up max-w-xl text-base text-slate-400"
            style={{ animationDelay: '160ms', animationFillMode: 'both' }}
          >
            CloudShield Twin gives you a living digital twin of your cloud infrastructure — powered by AI — to
            find attack paths, simulate real-world scenarios, and recommend the safest fixes.
          </p>
          <div
            className="animate-fade-slide-up flex flex-col gap-3 pt-1"
            style={{ animationDelay: '240ms', animationFillMode: 'both' }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onEnter(true)}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-transform hover:scale-105"
              >
                <PlayIcon className="h-4 w-4" />
                Watch 90-sec Demo
                <ArrowIcon />
              </button>
              <button
                type="button"
                onClick={() => onEnter(false)}
                className="flex items-center gap-2 rounded-full border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-transform hover:scale-105 hover:bg-slate-800"
              >
                Launch the Twin
                <ArrowIcon />
              </button>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <BoltIcon className="h-3.5 w-3.5 text-amber-400" /> No AWS credentials
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldIcon className="h-3.5 w-3.5 text-emerald-400" /> Works in replay mode
              </span>
              <span className="flex items-center gap-1.5">
                <SparklesIcon className="h-3.5 w-3.5 text-purple-400" /> AI-powered insights
              </span>
            </div>
          </div>
        </section>

        <HeroTwinVisual />
      </div>

      <div id="bottom-features" className="border-t border-slate-800 bg-slate-950/40 px-4 py-10 sm:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-slate-800">
          {BOTTOM_FEATURES.map(({ label, detail, Icon }) => (
            <div key={label} className="flex gap-3 lg:px-5 lg:first:pl-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-800/60 bg-purple-950/30 text-purple-300">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-100">{label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <section className="space-y-3 rounded border border-slate-800 bg-slate-900/40 p-5">
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
              <li
                key={item.step}
                className="flex animate-fade-slide-up gap-3 rounded border border-slate-800 bg-slate-900/40 p-3"
                style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
              >
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
          <p className="text-xs text-slate-500">
            Runs fully offline in replay mode — no AWS account, no credentials, no real VM needed to try it.
          </p>
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => onEnter(false)}
              className="rounded bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-150 hover:scale-105 hover:bg-purple-600"
            >
              Launch the Twin →
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M4 12h15m0 0l-5-5m5 5l-5 5" />
    </svg>
  )
}
