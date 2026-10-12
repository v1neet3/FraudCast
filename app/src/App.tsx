import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './lib/api'
import { ScorerTab } from './components/ScorerTab'
import { DashboardTab } from './components/DashboardTab'

type Tab = 'score' | 'dashboard'

export default function App() {
  const [tab, setTab] = useState<Tab>('score')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: health, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: false,
  })

  // Poll /api/health every 2 s until ready
  useEffect(() => {
    if (health?.ready) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(() => { void refetch() }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [health?.ready, refetch])

  const isReady = health?.ready ?? false

  const tabCls = (t: Tab) =>
    `px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? 'bg-slate-700 text-white'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
    }`

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-sm font-bold">F</div>
          <div>
            <h1 className="text-base font-semibold">FraudCast</h1>
            <p className="text-xs text-slate-500">UPI Fraud Detection</p>
          </div>
        </div>

        {/* API status */}
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${isReady ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`} />
          <span className="text-slate-400 max-w-48 truncate">{health?.message ?? 'Connecting...'}</span>
        </div>
      </header>

      {/* Loading overlay */}
      {!isReady && (
        <div className="mx-6 mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm">
          Model is training at startup (~30 s). The app will unlock automatically.
        </div>
      )}

      {/* Main */}
      <main className={`max-w-6xl mx-auto px-6 py-8 transition-opacity ${isReady ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/50 p-1 rounded-xl w-fit mb-8">
          <button className={tabCls('score')} onClick={() => setTab('score')}>Score Transaction</button>
          <button className={tabCls('dashboard')} onClick={() => setTab('dashboard')}>Dashboard</button>
        </div>

        {tab === 'score' ? <ScorerTab /> : <DashboardTab />}
      </main>
    </div>
  )
}
