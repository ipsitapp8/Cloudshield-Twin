import { CloudIcon, DatabaseIcon, GlobeIcon, NetworkIcon, ServerIcon, SparklesIcon, WarningTriangleIcon, ArrowRightIcon, BarChartIcon, LineChartIcon, CheckCircleIcon, EyeIcon, PlayIcon, WrenchIcon, CheckShieldIcon } from './icons'

const NODES = [
  { id: 'Internet', Icon: GlobeIcon, tone: 'border-blue-700/60 bg-blue-950/40 text-blue-300' },
  { id: 'Nginx', Icon: NetworkIcon, tone: 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300' },
  { id: 'API Server', Icon: ServerIcon, tone: 'border-blue-700/60 bg-blue-950/40 text-blue-300' },
  { id: 'Redis', Icon: DatabaseIcon, tone: 'border-red-700/60 bg-red-950/40 text-red-300' },
  { id: 'Database', Icon: DatabaseIcon, tone: 'border-purple-700/60 bg-purple-950/40 text-purple-300' },
]

const SIDE_PILLS = [
  { label: 'Observe', Icon: EyeIcon },
  { label: 'Understand', Icon: NetworkIcon },
  { label: 'Simulate', Icon: PlayIcon },
  { label: 'Remediate', Icon: WrenchIcon },
  { label: 'Prove', Icon: CheckShieldIcon },
]

/** Purely decorative hero graphic -- plain divs/SVG icons, no chart/graph library,
 * no canvas. Reuses the same icon set and topology-tile idiom as AttackPathVisual so
 * this looks like the same product, not a separate marketing mockup. */
export function HeroTwinVisual() {
  return (
    <div className="relative mx-auto mt-10 max-w-lg px-4 pb-16 pt-8 sm:mt-4 sm:max-w-none sm:px-0">
      <div className="absolute -top-2 left-1/2 z-10 w-64 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0">
        <div className="flex items-center gap-2 rounded-xl border border-purple-700/60 bg-slate-900/95 px-3 py-2 shadow-lg shadow-black/40">
          <SparklesIcon className="h-4 w-4 shrink-0 text-purple-400" />
          <div>
            <p className="text-xs font-semibold text-slate-100">AI Security Twin Agent</p>
            <p className="text-[10px] text-slate-500">Find attack paths · Simulate impact · Recommend fixes</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 pt-12 shadow-xl shadow-black/40 sm:p-8 sm:pt-14">
        <div className="mb-5 flex justify-center">
          <CloudIcon className="h-9 w-9 text-blue-400" />
        </div>
        <div className="flex items-start justify-center gap-1 overflow-x-auto sm:gap-2">
          {NODES.map((n, i) => (
            <div key={n.id} className="flex items-start">
              <div className="flex w-16 flex-col items-center gap-1.5 text-center sm:w-20">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl border sm:h-14 sm:w-14 ${n.tone}`}>
                  <n.Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <p className="text-[10px] font-medium text-slate-300 sm:text-xs">{n.id}</p>
              </div>
              {i < NODES.length - 1 && (
                <ArrowRightIcon className="mt-5 h-3.5 w-3.5 shrink-0 text-slate-700 sm:mt-6" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="hidden lg:absolute lg:-right-8 lg:top-14 lg:flex lg:flex-col lg:gap-2">
        {SIDE_PILLS.map(({ label, Icon }) => (
          <div
            key={label}
            className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/95 px-3 py-1.5 shadow-lg shadow-black/30"
          >
            <Icon className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-200">{label}</span>
          </div>
        ))}
      </div>

      <div className="absolute -bottom-2 left-2 w-60 rounded-xl border border-red-800/60 bg-slate-900/95 p-3 shadow-lg shadow-black/40 sm:left-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-red-300">
          <WarningTriangleIcon className="h-3.5 w-3.5" />
          Attack Path Found
        </p>
        <p className="mt-1 text-[11px] text-slate-400">Blast Radius: 3 services</p>
        <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-400">
          <CheckCircleIcon className="h-3 w-3" />
          Recommended Fix
        </p>
      </div>

      <div className="absolute -bottom-6 right-2 hidden h-14 w-14 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/95 shadow-lg shadow-black/30 sm:flex sm:right-10">
        <BarChartIcon className="h-6 w-6 text-purple-400" />
      </div>
      <div className="absolute -bottom-6 right-20 hidden h-14 w-20 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/95 shadow-lg shadow-black/30 sm:flex">
        <LineChartIcon className="h-6 w-10 text-amber-400" />
      </div>
    </div>
  )
}
