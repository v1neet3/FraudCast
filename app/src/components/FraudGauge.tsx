const R = 80
const CX = 100
const CY = 108
const ARCLEN = Math.PI * R // semicircle arc length ≈ 251.3

function scoreColor(score: number) {
  if (score >= 0.5) return '#ef4444'
  if (score >= 0.3) return '#f59e0b'
  return '#22c55e'
}

interface Props {
  score: number
  verdict: 'FRAUD' | 'LEGIT'
}

export function FraudGauge({ score, verdict }: Props) {
  const filled = Math.min(score, 1) * ARCLEN
  const color = scoreColor(score)
  // M left A radius ... right  sweep=1 goes upward (clockwise in SVG = upper arc)
  const path = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 200 122" className="w-56">
        {/* Track */}
        <path d={path} fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round" />
        {/* Filled arc */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${ARCLEN + 20}`}
        />
        {/* Score */}
        <text
          x={CX} y={CY - 18}
          textAnchor="middle"
          fill="white"
          fontSize="32"
          fontWeight="700"
          fontFamily="ui-monospace, monospace"
        >
          {score.toFixed(2)}
        </text>
        <text x={CX} y={CY - 2} textAnchor="middle" fill="#475569" fontSize="10" letterSpacing="2">
          FRAUD SCORE
        </text>
      </svg>

      <span
        className={`px-5 py-1.5 rounded-full text-sm font-bold tracking-widest border ${
          verdict === 'FRAUD'
            ? 'bg-red-500/10 text-red-400 border-red-500/30'
            : 'bg-green-500/10 text-green-400 border-green-500/30'
        }`}
      >
        {verdict === 'FRAUD' ? '⚠ FRAUD DETECTED' : '✓ LEGITIMATE'}
      </span>
    </div>
  )
}
