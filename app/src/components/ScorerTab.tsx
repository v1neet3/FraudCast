import { type FormEvent, useState } from 'react'
import { api } from '../lib/api'
import type { ScoreResponse } from '../types'
import { FraudGauge } from './FraudGauge'
import { ScoreBreakdown } from './ScoreBreakdown'

const DOMAINS = [
  'Retail', 'Food', 'Gas Station', 'Transport', 'Healthcare',
  'Shopping', 'Mobile recharge', 'Movie Tickets', 'Trust and Donations',
  'Vehicle Service', 'Hotel Bookings',
]

const now = new Date()
now.setSeconds(0, 0)
const defaultTs = now.toISOString().slice(0, 16)

export function ScorerTab() {
  const [amount, setAmount] = useState('')
  const [timestamp, setTimestamp] = useState(defaultTs)
  const [domain, setDomain] = useState('Retail')
  const [recipient, setRecipient] = useState('')
  const [lat, setLat] = useState('19.0355')
  const [lon, setLon] = useState('73.0228')
  const [hasPrev, setHasPrev] = useState(false)
  const [prevLat, setPrevLat] = useState('19.0355')
  const [prevLon, setPrevLon] = useState('73.0228')
  const [prevTs, setPrevTs] = useState('')

  const [result, setResult] = useState<ScoreResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.score({
        amount: parseFloat(amount),
        timestamp,
        domain,
        recipient,
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
        ...(hasPrev && prevTs
          ? { prev_latitude: parseFloat(prevLat), prev_longitude: parseFloat(prevLon), prev_timestamp: prevTs }
          : {}),
      })
      setResult(res)
    } catch {
      setError('Could not reach API. Is the backend running on port 8000?')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500'
  const labelCls = 'block text-xs text-slate-400 mb-1'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Amount (₹)</label>
            <input
              type="number" required min="0" step="0.01"
              placeholder="e.g. 500"
              value={amount} onChange={e => setAmount(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Domain</label>
            <select value={domain} onChange={e => setDomain(e.target.value)} className={inputCls}>
              {DOMAINS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Recipient</label>
          <input
            type="text" required placeholder="e.g. McDonalds"
            value={recipient} onChange={e => setRecipient(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Date & Time</label>
          <input
            type="datetime-local" required
            value={timestamp} onChange={e => setTimestamp(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Latitude</label>
            <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Longitude</label>
            <input type="number" step="any" value={lon} onChange={e => setLon(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Previous transaction toggle */}
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setHasPrev(p => !p)}
            className="w-full flex justify-between items-center px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <span>Previous transaction <span className="text-slate-500">(for location check)</span></span>
            <span className="text-slate-500">{hasPrev ? '▲' : '▼'}</span>
          </button>
          {hasPrev && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-700 pt-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Prev Latitude</label>
                  <input type="number" step="any" value={prevLat} onChange={e => setPrevLat(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Prev Longitude</label>
                  <input type="number" step="any" value={prevLon} onChange={e => setPrevLon(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Prev Timestamp</label>
                <input type="datetime-local" value={prevTs} onChange={e => setPrevTs(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit" disabled={loading}
          className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold transition-colors"
        >
          {loading ? 'Scoring...' : 'Score Transaction'}
        </button>
      </form>

      {/* Result */}
      <div className="flex flex-col gap-6">
        {result ? (
          <>
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 flex justify-center">
              <FraudGauge score={result.fraud_score} verdict={result.verdict} />
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6">
              <ScoreBreakdown ifScore={result.if_score} locScore={result.loc_score} clfScore={result.clf_score} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center border border-dashed border-slate-700 rounded-xl text-slate-600 text-sm min-h-64">
            Fill the form and click Score Transaction
          </div>
        )}
      </div>
    </div>
  )
}
