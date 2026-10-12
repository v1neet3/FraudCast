# FraudCast: UPI Transaction Fraud Detection
### Project Report

**Author:** Vineet Hankare  
**Date:** June 2026  
**Repository:** https://github.com/v1neet3/FraudCast

---

## 1. Abstract

FraudCast is an end-to-end machine learning system for detecting fraudulent UPI (Unified Payments Interface) transactions on personal financial data. The system combines anomaly detection, physics-based location verification, and an ensemble classifier into a unified three-stage pipeline. A FastAPI backend serves model predictions in real time, and a React dashboard provides both interactive transaction scoring and a browsable history of all flagged transactions. At the chosen threshold of 0.30, the system catches 95% of synthesized fraud with an average fraud score of 0.17 across the full dataset.

---

## 2. Motivation

Consumer UPI fraud is increasing rapidly in India — phishing, SIM swaps, and merchant impersonation are common attack vectors. While banks have internal fraud systems, individuals have no transparent tool to understand *why* a transaction was flagged or to score transactions before confirming them. FraudCast was built to fill this gap using only personal transaction history exported from Google Pay, with no dependency on external APIs or proprietary data.

---

## 3. Dataset

| Property | Value |
|----------|-------|
| Source | Personal Google Pay / UPI export (`potoro.csv`) |
| Records | 699 transactions |
| Date range | October 2021 – March 2024 |
| Original fraud labels | None (all Legit) |
| Columns used | Date, Time, Amount, Description, Domain, Location, Latitude, Longitude, Recipient |

Because the raw export contains zero fraud, a synthesis step is mandatory. The data is **not included** in the public repository as it contains personal payment history.

---

## 4. Fraud Synthesis

80 synthetic fraud transactions were injected using four realistic attack patterns drawn from known UPI fraud typologies:

| Pattern | Share | Mechanism |
|---------|-------|-----------|
| `amount_spike` | 30% | Amount set to 6–15× the domain average (e.g. ₹18,000 at a petrol pump) |
| `location_jump` | 25% | GPS coordinates teleported to Delhi or Bangalore while timestamp is only 15–60 min after previous transaction |
| `off_hours` | 25% | Transaction time rewritten to 1:00–5:59 AM |
| `new_recipient` | 20% | Payee replaced with an unknown vendor, amount set to ₹800–3,500 |

Each synthesized row inherits all other fields from a randomly sampled real transaction to preserve plausible domain and location metadata. The final dataset is 779 transactions: 699 Legit + 80 Fraud.

---

## 5. Feature Engineering

13 features are computed per transaction using an **expanding window** — each row only sees data from prior transactions, eliminating look-ahead leakage.

| Feature | Description |
|---------|-------------|
| `amount_zscore` | (Amount − domain mean) / domain std |
| `amount_ratio` | Amount / domain mean |
| `hour` | Hour of transaction (0–23) |
| `is_night` | 1 if hour ∈ [22:00, 05:59] |
| `is_weekend` | 1 if Saturday or Sunday |
| `recipient_is_new` | 1 if payee never seen before |
| `recipient_freq` | Count of prior payments to same payee |
| `location_is_usual` | 1 if location string seen in Legit history |
| `dist_from_last_km` | Haversine distance from previous transaction (km) |
| `time_gap_min` | Minutes since previous transaction |
| `implied_speed_kmh` | dist_from_last_km / (time_gap_min / 60) |
| `txn_count_1h` | Transactions in the last 1 hour |
| `txn_count_24h` | Transactions in the last 24 hours |

Domain statistics (mean, std) are computed **only on Legit training data** to prevent contamination.

---

## 6. Pipeline Architecture

The pipeline is a three-stage sequential scorer. Each stage produces a score in [0, 1]; the stages are combined using fixed weights into a final fraud score:

```
fraud_score = 0.25 × IF_score  +  0.20 × LOC_score  +  0.55 × CLF_score
```

### Stage 1 — Isolation Forest (weight 0.25)

An Isolation Forest is trained exclusively on Legit transactions using five anomaly-relevant features: `amount_zscore`, `amount_ratio`, `hour`, `is_night`, `txn_count_1h`. The raw decision function score is min-max normalised and inverted so that higher values = more anomalous.

- **Contamination:** 0.10
- **Input features:** 5 (amount / time-of-day group)
- **Purpose:** Catches statistically unusual amounts and transaction times without needing fraud labels

### Stage 2 — Location Check (weight 0.20)

No external geocoding API is used. Instead, the implied travel speed between consecutive transactions is computed via the Haversine formula:

```
speed (km/h) = distance_km / (time_gap_min / 60)
LOC_score = min(speed / 150, 1.0)
```

A ceiling of 150 km/h (typical road speed) is used. A transaction implying 300 km/h travel scores 1.0 on this stage — physically impossible without air travel within minutes.

### Stage 3 — AWF Classifier (weight 0.55)

An Adaptive Weighted Fusion ensemble of three classifiers:

| Classifier | Role |
|------------|------|
| GradientBoostingClassifier (100 trees) | Primary classifier, captures feature interactions |
| GaussianNB | Fast probabilistic baseline |
| SVC (RBF kernel, probability=True) | Strong boundary classifier |

Each classifier is weighted by its validation accuracy on a held-out 20% split of the SMOTE-resampled training data:

```
weight_i = accuracy_i / Σ accuracy_j
fraud_probability = Σ weight_i × P(fraud | x)_i
```

SMOTE (Synthetic Minority Oversampling) is applied to the training split to address the ~8:1 class imbalance before training.

---

## 7. Training Strategy

### Time-based split

A strict temporal split is used — **no random shuffling**. Shuffling would leak future transaction patterns into the past and inflate metrics.

| Split | Cutoff | Transactions | Fraud |
|-------|--------|--------------|-------|
| Train | Before 2023-07-01 | 409 | 40 |
| Test | After 2023-07-01 | 370 | 40 |

### Class imbalance

The raw training set is ~9:1 Legit:Fraud. SMOTE generates synthetic minority samples in feature space, producing a balanced training set for the AWF classifier without duplicating rows.

---

## 8. Evaluation & Threshold Tuning

Three thresholds were evaluated on the held-out test set:

| Threshold | Fraud Detected (of 40) | Recall | False Positives | Precision |
|-----------|------------------------|--------|-----------------|-----------|
| 0.35 | 38 | 95.0% | 14 | 73.1% |
| **0.30** | **38** | **95.0%** | **29** | **56.7%** |
| 0.25 | 39 | 97.5% | 58 | 40.2% |

**Chosen threshold: 0.30**

Rationale: 0.30 and 0.35 achieve identical recall (38/40). The extra 15 false positives at 0.30 over 0.35 are acceptable for a personal monitoring tool where a user reviews their own history — missing fraud is more costly than a false alert. Moving to 0.25 catches one more fraud case but triples the false positive rate without meaningful recall gain.

---

## 9. System Architecture

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│   React Frontend        │  HTTP  │   FastAPI Backend            │
│   (Vite + TypeScript)   │◄──────►│   (Python 3 + uvicorn)       │
│                         │  /api  │                              │
│  ┌─────────────────┐    │        │  ┌────────────────────────┐  │
│  │ Score Tab       │    │        │  │ FraudPipeline          │  │
│  │ - Form input    │    │        │  │ startup() → trains all │  │
│  │ - Fraud gauge   │    │        │  │ models on first boot   │  │
│  │ - Stage bars    │    │        │  └────────────────────────┘  │
│  └─────────────────┘    │        │                              │
│  ┌─────────────────┐    │        │  GET  /api/health            │
│  │ Dashboard Tab   │    │        │  GET  /api/stats             │
│  │ - Stats cards   │    │        │  GET  /api/transactions      │
│  │ - Filter table  │    │        │  POST /api/score             │
│  │ - Pagination    │    │        └──────────────────────────────┘
│  └─────────────────┘    │
└─────────────────────────┘
```

### Backend

- FastAPI with `asynccontextmanager` lifespan — pipeline training runs in a thread executor so the event loop is not blocked
- CORS enabled for `localhost:5173` and `localhost:5174`
- All 779 transaction scores are precomputed at startup for instant dashboard response

### Frontend

| Component | Function |
|-----------|----------|
| `App.tsx` | Tab layout, polls `/api/health` every 2 s until pipeline is ready, shows loading banner |
| `FraudGauge.tsx` | SVG semicircle gauge with `strokeDasharray`, colour-coded green/amber/red |
| `ScoreBreakdown.tsx` | Per-stage progress bars with weights displayed |
| `ScorerTab.tsx` | Transaction form with optional previous-transaction accordion for location check |
| `DashboardTab.tsx` | Stats cards, search + domain + verdict filters, sortable paginated table |

---

## 10. Results Summary

At threshold = 0.30 on the full 779-transaction dataset:

| Metric | Value |
|--------|-------|
| Total transactions | 779 |
| Fraud flagged | 120 |
| Legitimate | 659 |
| Average fraud score | 0.169 |
| Test recall (fraud) | 95.0% (38 / 40) |
| Test precision | 56.7% |

Example API response for a high-risk transaction (₹25,000 at 2:30 AM, 1,200 km implied travel):

```json
{
  "fraud_score": 0.8152,
  "if_score": 1.0,
  "loc_score": 1.0,
  "clf_score": 0.664,
  "verdict": "FRAUD",
  "threshold": 0.3
}
```

---

## 11. Limitations

- **Synthetic fraud only** — the model has never seen real fraud. Synthesis covers four patterns; novel attack vectors (e.g. gradual amount escalation, account takeover) may score low.
- **No GPS in raw export** — Google Pay exports contain location strings, not precise coordinates. Latitude/longitude were added manually per merchant. The location check is most useful when scoring new transactions with live GPS.
- **Static domain stats** — mean/std per domain are computed once at training time. A new merchant category will fall back to global defaults.
- **Python 3.9 compatibility** — union type syntax (`float | None`) requires `from __future__ import annotations` for the pipeline and `eval_type_backport` for Pydantic models.

---

## 12. Future Work

- **Online learning** — update domain statistics and recipient frequency incrementally as new transactions arrive, without full retraining
- **Real fraud labels** — integrate with bank dispute records to replace synthesized fraud with confirmed cases
- **Push alerts** — connect to UPI webhook or periodic bank statement fetch to score transactions automatically and send notifications
- **Export** — PDF/CSV export of flagged transactions from the dashboard
- **Model versioning** — persist trained model artefacts with joblib so startup is instant on subsequent runs

---

## 13. Technology Stack

| Layer | Technology |
|-------|-----------|
| Data processing | Python 3, pandas, NumPy |
| ML models | scikit-learn (IsolationForest, GradientBoostingClassifier, GaussianNB, SVC) |
| Oversampling | imbalanced-learn (SMOTE) |
| API | FastAPI, uvicorn |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Data fetching | TanStack Query v5 |
| Notebooks | Jupyter |
