interface Props {
  ifScore: number
  locScore: number
  clfScore: number
}

const stages = [
  { key: 'if',  label: 'Isolation Forest', weight: 0.25, desc: 'Unusual amount / time-of-day' },
  { key: 'loc', label: 'Location Check',   weight: 0.20, desc: 'Implied travel speed (Haversine, no API)' },
  { key: 'clf', label: 'AWF Classifier',   weight: 0.55, desc: 'GBM + Naive Bayes + SVC ensemble' },
]

function barColor(s: number) {
  if (s >= 0.5) return '#ef4444'
  if (s >= 0.3) return '#f59e0b'
  return '#22c55e'
}

export function ScoreBreakdown({ ifScore, locScore, clfScore }: Props) {
  const scores: Record<string, number> = { if: ifScore, loc: locScore, clf: clfScore }

  return (
    <div className="space-y-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Stage Breakdown</p>
      {stages.map(({ key, label, weight, desc }) => {
        const s = scores[key]
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-slate-300">{label}</span>
              <div className="flex items-center gap-2 tabular-nums">
                <span className="text-xs text-slate-600">×{weight}</span>
                <span className="text-sm font-mono font-bold text-white">{s.toFixed(3)}</span>
              </div>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${s * 100}%`, backgroundColor: barColor(s) }}
              />
            </div>
            <p className="text-xs text-slate-600">{desc}</p>
          </div>
        )
      })}
    </div>
  )
}
