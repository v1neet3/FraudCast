export interface ScoreRequest {
  amount: number
  timestamp: string
  domain: string
  recipient: string
  latitude: number
  longitude: number
  prev_latitude?: number
  prev_longitude?: number
  prev_timestamp?: string
}

export interface ScoreResponse {
  fraud_score: number
  if_score: number
  loc_score: number
  clf_score: number
  verdict: 'FRAUD' | 'LEGIT'
  threshold: number
}

export interface Transaction {
  id: number
  timestamp: string
  amount: number
  recipient: string
  domain: string
  location: string
  fraud_score: number
  if_score: number
  loc_score: number
  clf_score: number
  verdict: 'FRAUD' | 'LEGIT'
  true_label: string
}

export interface Stats {
  total: number
  fraud_count: number
  legit_count: number
  avg_fraud_score: number
  domains: string[]
}

export interface HealthResponse {
  ready: boolean
  message: string
}
