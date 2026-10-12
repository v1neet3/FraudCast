import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Transaction } from '../types'

const PAGE_SIZE = 50

type SortKey = 'timestamp' | 'amount' | 'fraud_score'
type SortDir = 'asc' | 'desc'

function ScorePill({ score }: { score: number }) {
  const bg = score >= 0.5 ? 'bg-red-500/20 text-red-400' : score >= 0.3 ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-mono font-semibold px-2 py-0.5 rounded ${bg}`}>
      <span
        className="inline-block w-10 h-1 rounded-full bg-current opacity-40"
        style={{ background: `linear-gradient(to right, currentColor ${score * 100}%, transparent ${score * 100}%)` }}
      />
      {score.toFixed(3)}
    </span>
  )
}

export function DashboardTab() {
  const { data: txns, isLoading, error } = useQuery({ queryKey: ['transactions'], queryFn: api.transactions })
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: api.stats })

  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState('All')
  const [verdictFilter, setVerdictFilter] = useState<'All' | 'FRAUD' | 'LEGIT'>('All')
  const [sortKey, setSortKey] = useState<SortKey>('timestamp')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)

  const domains = useMemo(() => {
    if (!txns) return []
    return ['All', ...Array.from(new Set(txns.map(t => t.domain))).sort()]
  }, [txns])

  const filtered = useMemo(() => {
    if (!txns) return []
    return txns
      .filter(t =>
        (domainFilter === 'All' || t.domain === domainFilter) &&
        (verdictFilter === 'All' || t.verdict === verdictFilter) &&
        (search === '' || t.recipient.toLowerCase().includes(search.toLowerCase()))
      )
      .sort((a, b) => {
        const av = sortKey === 'timestamp' ? new Date(a.timestamp).getTime() : a[sortKey]
        const bv = sortKey === 'timestamp' ? new Date(b.timestamp).getTime() : b[sortKey]
        return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
      })
  }, [txns, search, domainFilter, verdictFilter, sortKey, sortDir])

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(0)
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-slate-600">↕</span>
    return <span className="text-indigo-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const inputCls = 'bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500'

  if (isLoading) return <p className="text-slate-500 text-sm">Loading transactions...</p>
  if (error) return <p className="text-red-400 text-sm">Failed to load transactions. Is the API running?</p>

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total.toLocaleString() },
            { label: 'Fraud Detected', value: stats.fraud_count, cls: 'text-red-400' },
            { label: 'Legitimate', value: stats.legit_count, cls: 'text-green-400' },
            { label: 'Avg Score', value: stats.avg_fraud_score.toFixed(3), cls: 'font-mono' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold ${cls ?? 'text-white'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text" placeholder="Search recipient..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
          className={`${inputCls} flex-1 min-w-48`}
        />
        <select value={domainFilter} onChange={e => { setDomainFilter(e.target.value); setPage(0) }} className={inputCls}>
          {domains.map(d => <option key={d}>{d}</option>)}
        </select>
        <select value={verdictFilter} onChange={e => { setVerdictFilter(e.target.value as typeof verdictFilter); setPage(0) }} className={inputCls}>
          <option>All</option>
          <option>FRAUD</option>
          <option>LEGIT</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 border-b border-slate-700">
            <tr>
              <th className="text-left px-4 py-3 text-slate-400 font-medium cursor-pointer select-none" onClick={() => toggleSort('timestamp')}>
                Date & Time <SortIcon k="timestamp" />
              </th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Recipient</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Domain</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium cursor-pointer select-none" onClick={() => toggleSort('amount')}>
                Amount <SortIcon k="amount" />
              </th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium cursor-pointer select-none" onClick={() => toggleSort('fraud_score')}>
                Score <SortIcon k="fraud_score" />
              </th>
              <th className="text-center px-4 py-3 text-slate-400 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((t: Transaction) => (
              <tr
                key={t.id}
                className={`border-b border-slate-800 transition-colors hover:bg-slate-800/40 ${
                  t.verdict === 'FRAUD' ? 'bg-red-950/10' : ''
                }`}
              >
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                  {new Date(t.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-3 text-slate-200 max-w-40 truncate">{t.recipient}</td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{t.domain}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-200">₹{t.amount.toFixed(0)}</td>
                <td className="px-4 py-3 text-right"><ScorePill score={t.fraud_score} /></td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    t.verdict === 'FRAUD'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-green-500/20 text-green-400'
                  }`}>
                    {t.verdict}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{filtered.length} transactions</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1 rounded bg-slate-800 border border-slate-700 disabled:opacity-30 hover:border-slate-500 transition-colors"
          >
            ←
          </button>
          <span className="px-3 py-1">{page + 1} / {pageCount}</span>
          <button
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
            className="px-3 py-1 rounded bg-slate-800 border border-slate-700 disabled:opacity-30 hover:border-slate-500 transition-colors"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}
