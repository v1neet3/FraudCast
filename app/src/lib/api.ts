import type { HealthResponse, ScoreRequest, ScoreResponse, Stats, Transaction } from '../types'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export const api = {
  health: () => get<HealthResponse>('/api/health'),
  stats: () => get<Stats>('/api/stats'),
  transactions: () => get<Transaction[]>('/api/transactions'),
  score: (req: ScoreRequest) => post<ScoreResponse>('/api/score', req),
}
