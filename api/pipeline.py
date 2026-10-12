"""
FraudCast pipeline — extracted from FraudCastPipeline.ipynb.
Loads potoro.csv, synthesizes fraud, builds features, trains the 3-stage model.
"""
from __future__ import annotations
from pathlib import Path
from math import radians, cos, sin, asin, sqrt
import warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, GradientBoostingClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.svm import SVC
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from imblearn.over_sampling import SMOTE

warnings.filterwarnings('ignore')

DATA_PATH = Path(__file__).parent.parent / 'Code_v1neet' / 'potoro.csv'
ANOMALY_FEATURES = ['amount_zscore', 'amount_ratio', 'hour', 'is_night', 'txn_count_1h']
SPEED_CEILING = 150.0
W_IF, W_LOC, W_CLF = 0.25, 0.20, 0.55
THRESHOLD = 0.30
SPLIT_DATE = pd.Timestamp('2023-07-01')


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return R * 2 * asin(sqrt(a))


def _synthesize_fraud(df: pd.DataFrame, n: int = 80, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    domain_mean = df.groupby('Domain')['Amount'].mean()
    city_coords = np.array([[28.6448, 77.2167], [12.9716, 77.5946]])
    rows = []
    patterns = ['amount_spike', 'location_jump', 'off_hours', 'new_recipient']
    probs = [0.30, 0.25, 0.25, 0.20]

    for _ in range(n):
        pat = rng.choice(patterns, p=probs)
        base = df.sample(1, random_state=int(rng.integers(10000))).iloc[0].copy()

        if pat == 'amount_spike':
            m = float(domain_mean.get(base['Domain'], base['Amount']))
            base['Amount'] = m * rng.uniform(6, 15)
        elif pat == 'location_jump':
            city = city_coords[rng.integers(2)]
            base['Latitude'] = float(city[0]) + rng.uniform(-0.3, 0.3)
            base['Longitude'] = float(city[1]) + rng.uniform(-0.3, 0.3)
            base['Location'] = 'Unknown'
            anchor = df.iloc[int(rng.integers(1, len(df)))]
            base['Timestamp'] = anchor['Timestamp'] + pd.Timedelta(minutes=int(rng.integers(15, 61)))
        elif pat == 'off_hours':
            ts = base['Timestamp']
            base['Timestamp'] = ts.replace(hour=int(rng.integers(1, 6)), minute=int(rng.integers(0, 60)))
        elif pat == 'new_recipient':
            base['Recepient'] = f'Unknown_Vendor_{rng.integers(9000, 9999)}'
            base['Amount'] = float(rng.uniform(800, 3500))

        base['Classification'] = 'Fraud'
        rows.append(base)

    return pd.DataFrame(rows)


def _build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values('Timestamp').reset_index(drop=True)
    legit = df[df['Classification'] == 'Legit']
    domain_stats = legit.groupby('Domain')['Amount'].agg(['mean', 'std']).fillna(1)
    usual_locs = set(legit['Location'].unique())
    rows = []

    for i in range(len(df)):
        row = df.iloc[i]
        prev = df.iloc[:i]
        ts = row['Timestamp']

        if row['Domain'] in domain_stats.index:
            d_mean = domain_stats.loc[row['Domain'], 'mean']
            d_std = max(domain_stats.loc[row['Domain'], 'std'], 1.0)
        else:
            d_mean, d_std = row['Amount'], 1.0

        hour = ts.hour
        if len(prev) > 0:
            last = prev.iloc[-1]
            dist_km = _haversine(row['Latitude'], row['Longitude'], last['Latitude'], last['Longitude'])
            gap_min = (ts - last['Timestamp']).total_seconds() / 60.0
            speed_kmh = dist_km / (gap_min / 60.0) if gap_min > 0 else 0.0
            txn_1h = len(prev[prev['Timestamp'] >= ts - pd.Timedelta(hours=1)])
            txn_24h = len(prev[prev['Timestamp'] >= ts - pd.Timedelta(hours=24)])
            prev_rec = prev['Recepient'].tolist()
        else:
            dist_km = gap_min = speed_kmh = 0.0
            txn_1h = txn_24h = 0
            prev_rec = []

        rows.append({
            'amount_zscore': (row['Amount'] - d_mean) / d_std,
            'amount_ratio': row['Amount'] / d_mean if d_mean > 0 else 1.0,
            'hour': hour,
            'is_night': int(hour >= 22 or hour <= 5),
            'is_weekend': int(ts.dayofweek >= 5),
            'recipient_is_new': int(row['Recepient'] not in prev_rec),
            'recipient_freq': prev_rec.count(row['Recepient']),
            'location_is_usual': int(row['Location'] in usual_locs),
            'dist_from_last_km': dist_km,
            'time_gap_min': gap_min,
            'implied_speed_kmh': min(speed_kmh, 500.0),
            'txn_count_1h': txn_1h,
            'txn_count_24h': txn_24h,
        })

    return pd.DataFrame(rows)


class FraudPipeline:
    def __init__(self):
        self.is_ready = False
        self.status_msg = 'Starting up...'
        self.df: pd.DataFrame | None = None
        self.full_df: pd.DataFrame | None = None
        self.feat_df: pd.DataFrame | None = None
        self._anomaly_scaler: MinMaxScaler | None = None
        self._if_model: IsolationForest | None = None
        self._if_s_min: float = 0.0
        self._if_s_range: float = 1.0
        self._clf_scaler: MinMaxScaler | None = None
        self._clfs: list | None = None
        self._clf_weights: list[float] | None = None
        self._domain_stats: pd.DataFrame | None = None
        self._usual_locs: set | None = None
        self._all_scores: list[dict] | None = None

    def startup(self):
        try:
            self.status_msg = 'Loading data...'
            self.df = pd.read_csv(DATA_PATH)
            self.df['Timestamp'] = pd.to_datetime(self.df['Timestamp'], dayfirst=True)
            self.df = self.df.sort_values('Timestamp').reset_index(drop=True)

            self.status_msg = 'Synthesizing fraud examples...'
            fraud_df = _synthesize_fraud(self.df)
            self.full_df = pd.concat([self.df, fraud_df], ignore_index=True)
            self.full_df = self.full_df.sort_values('Timestamp').reset_index(drop=True)

            self.status_msg = 'Building features (~20 s)...'
            self.feat_df = _build_features(self.full_df)
            labels = (self.full_df['Classification'] == 'Fraud').astype(int).values

            legit = self.df
            self._domain_stats = legit.groupby('Domain')['Amount'].agg(['mean', 'std']).fillna(1)
            self._usual_locs = set(legit['Location'].unique())

            train_mask = (self.full_df['Timestamp'] < SPLIT_DATE).values
            X_train = self.feat_df[train_mask]
            y_train = labels[train_mask]

            self.status_msg = 'Training Isolation Forest...'
            self._anomaly_scaler = MinMaxScaler()
            X_legit = self._anomaly_scaler.fit_transform(
                X_train[y_train == 0][ANOMALY_FEATURES].values)
            self._if_model = IsolationForest(contamination=0.1, random_state=42)
            self._if_model.fit(X_legit)
            raw = self._if_model.decision_function(X_legit)
            self._if_s_min = float(raw.min())
            self._if_s_range = float(raw.max() - raw.min()) + 1e-9

            self.status_msg = 'Training AWF Classifier...'
            smote = SMOTE(random_state=42)
            X_sm, y_sm = smote.fit_resample(X_train.values, y_train)
            X_sm_tr, X_sm_val, y_sm_tr, y_sm_val = train_test_split(
                X_sm, y_sm, test_size=0.2, stratify=y_sm, random_state=42)

            self._clf_scaler = MinMaxScaler()
            Xs = self._clf_scaler.fit_transform(X_sm_tr)
            Xvs = self._clf_scaler.transform(X_sm_val)
            self._clfs = [
                GradientBoostingClassifier(n_estimators=100, random_state=42),
                GaussianNB(),
                SVC(probability=True, random_state=42),
            ]
            accs = []
            for clf in self._clfs:
                clf.fit(Xs, y_sm_tr)
                accs.append(accuracy_score(y_sm_val, clf.predict(Xvs)))
            total = sum(accs) or 1.0
            self._clf_weights = [a / total for a in accs]

            self.status_msg = 'Precomputing dashboard scores...'
            self._all_scores = self._compute_all_scores(labels)

            self.is_ready = True
            self.status_msg = 'Ready'

        except Exception as e:
            self.status_msg = f'Startup failed: {e}'
            raise

    # ── Internal scoring helpers ───────────────────────────────────────────────

    def _if_score(self, X: pd.DataFrame) -> np.ndarray:
        Xs = self._anomaly_scaler.transform(X[ANOMALY_FEATURES].values)
        raw = self._if_model.decision_function(Xs)
        return np.clip(1 - (raw - self._if_s_min) / self._if_s_range, 0, 1)

    def _location_score(self, X: pd.DataFrame) -> np.ndarray:
        return np.clip(X['implied_speed_kmh'].values / SPEED_CEILING, 0, 1)

    def _clf_score(self, X: np.ndarray) -> np.ndarray:
        Xs = self._clf_scaler.transform(X)
        probs = [clf.predict_proba(Xs) for clf in self._clfs]
        combined = sum(w * p for w, p in zip(self._clf_weights, probs))
        return combined[:, 1]

    def _compute_all_scores(self, labels: np.ndarray) -> list[dict]:
        if_s = self._if_score(self.feat_df)
        loc_s = self._location_score(self.feat_df)
        clf_s = self._clf_score(self.feat_df.values)
        fs = W_IF * if_s + W_LOC * loc_s + W_CLF * clf_s

        results = []
        for i, row in self.full_df.iterrows():
            score = float(fs[i])
            results.append({
                'id': int(i),
                'timestamp': row['Timestamp'].isoformat(),
                'amount': float(row['Amount']),
                'recipient': str(row['Recepient']),
                'domain': str(row['Domain']),
                'location': str(row['Location']),
                'fraud_score': round(score, 4),
                'if_score': round(float(if_s[i]), 4),
                'loc_score': round(float(loc_s[i]), 4),
                'clf_score': round(float(clf_s[i]), 4),
                'verdict': 'FRAUD' if score >= THRESHOLD else 'LEGIT',
                'true_label': str(row['Classification']),
            })
        return results

    # ── Public API ─────────────────────────────────────────────────────────────

    def score_transaction(
        self,
        amount: float,
        timestamp_str: str,
        domain: str,
        recipient: str,
        lat: float,
        lon: float,
        prev_lat: float | None = None,
        prev_lon: float | None = None,
        prev_ts_str: str | None = None,
    ) -> dict:
        ts = pd.to_datetime(timestamp_str)

        if domain in self._domain_stats.index:
            d_mean = float(self._domain_stats.loc[domain, 'mean'])
            d_std = max(float(self._domain_stats.loc[domain, 'std']), 1.0)
        else:
            d_mean, d_std = amount, 1.0

        if prev_lat is not None and prev_lon is not None and prev_ts_str is not None:
            prev_ts = pd.to_datetime(prev_ts_str)
            dist_km = _haversine(lat, lon, prev_lat, prev_lon)
            gap_min = (ts - prev_ts).total_seconds() / 60.0
            speed = dist_km / (gap_min / 60.0) if gap_min > 0 else 0.0
        else:
            dist_km = gap_min = speed = 0.0

        all_recipients = self.df['Recepient'].tolist()

        txn = pd.DataFrame([{
            'amount_zscore': (amount - d_mean) / d_std,
            'amount_ratio': amount / d_mean if d_mean > 0 else 1.0,
            'hour': ts.hour,
            'is_night': int(ts.hour >= 22 or ts.hour <= 5),
            'is_weekend': int(ts.dayofweek >= 5),
            'recipient_is_new': int(recipient not in all_recipients),
            'recipient_freq': all_recipients.count(recipient),
            'location_is_usual': 1 if prev_lat is None else int(dist_km < 50),
            'dist_from_last_km': dist_km,
            'time_gap_min': gap_min,
            'implied_speed_kmh': min(speed, 500.0),
            'txn_count_1h': 0,
            'txn_count_24h': 0,
        }])

        if_s = float(self._if_score(txn)[0])
        loc_s = float(self._location_score(txn)[0])
        clf_s = float(self._clf_score(txn.values)[0])
        fs = W_IF * if_s + W_LOC * loc_s + W_CLF * clf_s

        return {
            'fraud_score': round(fs, 4),
            'if_score': round(if_s, 4),
            'loc_score': round(loc_s, 4),
            'clf_score': round(clf_s, 4),
            'verdict': 'FRAUD' if fs >= THRESHOLD else 'LEGIT',
            'threshold': THRESHOLD,
        }

    def get_stats(self) -> dict:
        if not self._all_scores:
            return {}
        fraud = sum(1 for s in self._all_scores if s['verdict'] == 'FRAUD')
        avg = sum(s['fraud_score'] for s in self._all_scores) / len(self._all_scores)
        return {
            'total': len(self._all_scores),
            'fraud_count': fraud,
            'legit_count': len(self._all_scores) - fraud,
            'avg_fraud_score': round(avg, 4),
            'domains': sorted(self.df['Domain'].unique().tolist()),
        }


pipeline = FraudPipeline()
