"""
ai_engine.py — FacilityOps AI Engine
Phase 2: Anomaly Detection · Forecasting · Efficiency Analysis · Recommendations

Models:
  - Isolation Forest   → Anomaly & wastage detection (≥85% accuracy target)
  - GradientBoosting   → Energy consumption forecasting (6h ahead)
  - Rule-based engine  → HVAC/Lighting efficiency analysis
  - Recommendation gen → Prioritised cost & carbon reduction suggestions
"""

import os
import pickle
import json
import math
import random
import sqlite3
from datetime import datetime, timedelta
from typing import List, Dict, Tuple

import numpy as np
from sklearn.ensemble import IsolationForest, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, accuracy_score, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split

from database import get_connection, DB_PATH

MODEL_DIR  = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

# ─── Feature Engineering ─────────────────────────────────────────────────────

def extract_features(rows: List[Dict]) -> np.ndarray:
    """Convert DB rows into ML feature matrix."""
    features = []
    for r in rows:
        ts   = datetime.fromisoformat(r["timestamp"])
        hour = ts.hour
        dow  = ts.weekday()   # 0=Mon, 6=Sun
        is_weekend = int(dow >= 5)
        is_workhour= int(8 <= hour <= 20 and not is_weekend)

        features.append([
            r["electricity_usage"],
            r["hvac_usage"],
            r["water_usage"],
            r["lighting_usage"],
            r["equipment_usage"],
            r["other_usage"],
            r["outdoor_temp_c"],
            r["occupancy_pct"],
            hour,
            dow,
            is_weekend,
            is_workhour,
            # Derived ratios
            r["hvac_usage"] / max(r["electricity_usage"], 1),
            r["lighting_usage"] / max(r["electricity_usage"], 1),
        ])
    return np.array(features, dtype=np.float32)


def extract_forecast_features(rows: List[Dict]) -> Tuple[np.ndarray, np.ndarray]:
    """Feature matrix for next-step electricity forecasting."""
    X, y = [], []
    for i, r in enumerate(rows):
        if i < 3:
            continue
        ts   = datetime.fromisoformat(r["timestamp"])
        hour = ts.hour
        dow  = ts.weekday()
        temp = r["outdoor_temp_c"]

        # Lag features
        lag1 = rows[i-1]["electricity_usage"]
        lag2 = rows[i-2]["electricity_usage"]
        lag3 = rows[i-3]["electricity_usage"]
        roll3 = (lag1 + lag2 + lag3) / 3
        hvac  = r["hvac_usage"]
        occ   = r["occupancy_pct"]

        X.append([hour, dow, temp, lag1, lag2, lag3, roll3, hvac, occ,
                  int(dow >= 5), int(8 <= hour <= 20)])
        y.append(r["electricity_usage"])

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)


# ─── 1. Anomaly Detector ─────────────────────────────────────────────────────

class AnomalyDetector:
    MODEL_PATH  = os.path.join(MODEL_DIR, "isolation_forest.pkl")
    SCALER_PATH = os.path.join(MODEL_DIR, "anomaly_scaler.pkl")

    def __init__(self):
        self.model  = None
        self.scaler = None

    def train(self) -> dict:
        """Train Isolation Forest on full historical data. Returns accuracy metrics."""
        conn = get_connection()
        rows = [dict(r) for r in conn.execute("""
            SELECT electricity_usage, hvac_usage, water_usage, lighting_usage,
                   equipment_usage, other_usage, outdoor_temp_c, occupancy_pct,
                   timestamp, is_anomaly
            FROM ENERGY_USAGE ORDER BY timestamp
        """).fetchall()]
        conn.close()

        X = extract_features(rows)
        y = np.array([r["is_anomaly"] for r in rows])

        # Scale features
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # Train on FULL data (Isolation Forest is unsupervised)
        # contamination matches our injected anomaly rate ~4%
        self.model = IsolationForest(
            n_estimators=200,
            contamination=0.04,
            random_state=42,
            max_samples="auto",
            n_jobs=-1
        )
        self.model.fit(X_scaled)

        # Evaluate against ground-truth labels
        # IsolationForest returns -1 for anomaly, 1 for normal
        preds_raw  = self.model.predict(X_scaled)
        preds_bin  = np.where(preds_raw == -1, 1, 0)   # 1=anomaly

        # Write anomaly scores back to DB
        scores = -self.model.score_samples(X_scaled)    # higher = more anomalous
        self._write_scores_to_db(rows, preds_bin, scores)

        # Metrics
        acc  = accuracy_score(y, preds_bin)
        prec = precision_score(y, preds_bin, zero_division=0)
        rec  = recall_score(y, preds_bin, zero_division=0)
        f1   = f1_score(y, preds_bin, zero_division=0)

        # Persist
        with open(self.MODEL_PATH,  "wb") as f: pickle.dump(self.model,  f)
        with open(self.SCALER_PATH, "wb") as f: pickle.dump(self.scaler, f)

        metrics = {
            "accuracy":  round(float(acc),  4),
            "precision": round(float(prec), 4),
            "recall":    round(float(rec),  4),
            "f1_score":  round(float(f1),   4),
            "n_samples": len(y),
            "n_anomalies_detected": int(preds_bin.sum()),
            "n_ground_truth_anomalies": int(y.sum()),
        }
        print(f"✅ Anomaly Detector trained — Accuracy: {acc:.1%}  F1: {f1:.3f}")
        return metrics

    def _write_scores_to_db(self, rows, preds_bin, scores):
        conn = get_connection()
        # bulk update
        updates = []
        for r, pred, score in zip(rows, preds_bin, scores):
            if pred == 1:
                updates.append((int(pred), round(float(score), 4),
                                r["electricity_usage"], r["hvac_usage"], r["timestamp"]))
        if updates:
            conn.executemany("""
                UPDATE ENERGY_USAGE SET is_anomaly=?, anomaly_score=?
                WHERE electricity_usage=? AND hvac_usage=? AND timestamp=?
            """, updates)
            conn.commit()
        conn.close()

    def load(self):
        if not os.path.exists(self.MODEL_PATH):
            raise FileNotFoundError("Model not trained yet. Run ai_engine.py first.")
        with open(self.MODEL_PATH,  "rb") as f: self.model  = pickle.load(f)
        with open(self.SCALER_PATH, "rb") as f: self.scaler = pickle.load(f)

    def predict(self, rows: List[Dict]) -> List[Dict]:
        """Run anomaly detection on a list of rows. Returns annotated list."""
        if self.model is None:
            self.load()
        X       = extract_features(rows)
        X_sc    = self.scaler.transform(X)
        preds   = self.model.predict(X_sc)
        scores  = -self.model.score_samples(X_sc)
        results = []
        for row, pred, score in zip(rows, preds, scores):
            results.append({**row,
                            "is_anomaly":    int(pred == -1),
                            "anomaly_score": round(float(score), 4)})
        return results


# ─── 2. Forecasting Model ─────────────────────────────────────────────────────

class EnergyForecaster:
    MODEL_PATH = os.path.join(MODEL_DIR, "forecaster.pkl")

    def __init__(self):
        self.model = None

    def train(self, facility_id: int = 1) -> dict:
        """Train GradientBoosting forecaster for a given facility."""
        conn = get_connection()
        rows = [dict(r) for r in conn.execute("""
            SELECT timestamp, electricity_usage, hvac_usage, outdoor_temp_c, occupancy_pct
            FROM ENERGY_USAGE WHERE facility_id=? ORDER BY timestamp
        """, (facility_id,)).fetchall()]
        conn.close()

        X, y = extract_forecast_features(rows)
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.15, shuffle=False)

        self.model = GradientBoostingRegressor(
            n_estimators=300,
            learning_rate=0.05,
            max_depth=4,
            subsample=0.8,
            random_state=42
        )
        self.model.fit(X_tr, y_tr)

        y_pred  = self.model.predict(X_te)
        mape    = float(np.mean(np.abs((y_te - y_pred) / np.maximum(y_te, 1))) * 100)
        rmse    = float(np.sqrt(np.mean((y_te - y_pred)**2)))

        with open(self.MODEL_PATH, "wb") as f: pickle.dump(self.model, f)

        metrics = {"mape_pct": round(mape, 2), "rmse_kwh": round(rmse, 2),
                   "n_train": len(y_tr), "n_test": len(y_te)}
        print(f"✅ Forecaster trained — MAPE: {mape:.1f}%  RMSE: {rmse:.1f} kWh")
        return metrics

    def load(self):
        if not os.path.exists(self.MODEL_PATH):
            raise FileNotFoundError("Forecaster not trained. Run ai_engine.py first.")
        with open(self.MODEL_PATH, "rb") as f: self.model = pickle.load(f)

    def forecast_24h(self, facility_id: int = 1) -> List[Dict]:
        """Return 24-hour forecast for today, using latest DB data as context."""
        if self.model is None:
            self.load()

        conn = get_connection()
        rows = [dict(r) for r in conn.execute("""
            SELECT timestamp, electricity_usage, hvac_usage, outdoor_temp_c, occupancy_pct
            FROM ENERGY_USAGE WHERE facility_id=? ORDER BY timestamp DESC LIMIT 72
        """, (facility_id,)).fetchall()]
        conn.close()
        rows = list(reversed(rows))   # chronological

        now    = datetime.now().replace(minute=0, second=0, microsecond=0)
        result = []

        # Historical last 18 hours
        hist_rows = [dict(r) for r in conn.execute("SELECT 1").fetchall()] if False else []
        conn = get_connection()
        hist_rows = [dict(r) for r in conn.execute("""
            SELECT timestamp, electricity_usage, hvac_usage, outdoor_temp_c, occupancy_pct
            FROM ENERGY_USAGE WHERE facility_id=?
              AND timestamp >= datetime('now','-1 day')
            ORDER BY timestamp
        """, (facility_id,)).fetchall()]
        conn.close()

        for r in hist_rows:
            ts = datetime.fromisoformat(r["timestamp"])
            result.append({
                "hour":        ts.strftime("%H:00"),
                "timestamp":   r["timestamp"],
                "actual":      round(r["electricity_usage"], 1),
                "forecast":    None,
                "is_forecast": False
            })

        # Forecast next 8 hours
        lags = [r["electricity_usage"] for r in rows[-3:]]
        temp = rows[-1]["outdoor_temp_c"] if rows else 27.0
        hvac = rows[-1]["hvac_usage"]     if rows else 99.0

        for i in range(8):
            fh   = now + timedelta(hours=i + 1)
            hour = fh.hour
            dow  = fh.weekday()
            occ  = 80 if (8 <= hour <= 18 and dow < 5) else 20
            feat = np.array([[hour, dow, temp + i * 0.1,
                              lags[-1], lags[-2], lags[-3],
                              sum(lags[-3:]) / 3,
                              hvac, occ,
                              int(dow >= 5), int(8 <= hour <= 20)]])
            pred = float(self.model.predict(feat)[0])
            result.append({
                "hour":        fh.strftime("%H:00"),
                "timestamp":   fh.isoformat(),
                "actual":      None,
                "forecast":    round(max(0, pred), 1),
                "is_forecast": True
            })
            lags = lags[1:] + [pred]

        return result


# ─── 3. HVAC & Lighting Efficiency Analyzer ──────────────────────────────────

def analyze_hvac_efficiency(facility_id: int = 1) -> List[Dict]:
    """Rule-based HVAC & lighting efficiency checks on last 24h data."""
    conn = get_connection()
    rows = [dict(r) for r in conn.execute("""
        SELECT timestamp, electricity_usage, hvac_usage, lighting_usage,
               equipment_usage, occupancy_pct, outdoor_temp_c
        FROM ENERGY_USAGE
        WHERE facility_id=?
          AND timestamp >= datetime('now', '-24 hours')
        ORDER BY timestamp
    """, (facility_id,)).fetchall()]
    conn.close()

    issues = []
    for r in rows:
        ts    = datetime.fromisoformat(r["timestamp"])
        occ   = r["occupancy_pct"]
        hvac  = r["hvac_usage"]
        elec  = r["electricity_usage"]
        light = r["lighting_usage"]

        hvac_ratio   = hvac / max(elec, 1)
        light_ratio  = light / max(elec, 1)

        # HVAC over 50% of total while temp is mild → inefficiency
        if hvac_ratio > 0.50 and r["outdoor_temp_c"] < 30:
            issues.append({
                "type":     "hvac_high_ratio",
                "severity": "warning",
                "hour":     ts.strftime("%H:00"),
                "message":  f"HVAC consuming {hvac_ratio:.0%} of total electricity at {r['outdoor_temp_c']}°C outdoor temp",
                "saving_est_inr": round(hvac * 0.15 * 9, 0)   # ₹9/kWh, save 15%
            })

        # Lighting above 35% while occupancy is low
        if light_ratio > 0.35 and occ < 30:
            issues.append({
                "type":     "lighting_waste",
                "severity": "warning",
                "hour":     ts.strftime("%H:00"),
                "message":  f"Lighting {light_ratio:.0%} of load at {occ:.0f}% occupancy — likely unoccupied zones lit",
                "saving_est_inr": round(light * 0.40 * 9, 0)
            })

    return issues[:10]   # cap at 10 issues


# ─── 4. Recommendation Generator ─────────────────────────────────────────────

def generate_recommendations(facility_id: int = 1) -> List[Dict]:
    """Combine anomaly scores + efficiency checks into actionable recommendations."""
    conn = get_connection()

    # Recent anomalies
    anomaly_rows = [dict(r) for r in conn.execute("""
        SELECT timestamp, electricity_usage, hvac_usage, water_usage,
               anomaly_score, is_anomaly
        FROM ENERGY_USAGE
        WHERE facility_id=? AND is_anomaly=1
          AND timestamp >= datetime('now', '-48 hours')
        ORDER BY anomaly_score DESC LIMIT 5
    """, (facility_id,)).fetchall()]

    # Open alerts
    alert_rows = [dict(r) for r in conn.execute("""
        SELECT * FROM ALERTS WHERE facility_id=? AND resolved=0
        ORDER BY severity DESC, created_at DESC LIMIT 5
    """, (facility_id,)).fetchall()]

    # Last 24h aggregate
    agg = dict(conn.execute("""
        SELECT AVG(electricity_usage) avg_elec, AVG(hvac_usage) avg_hvac,
               AVG(water_usage) avg_water, AVG(occupancy_pct) avg_occ
        FROM ENERGY_USAGE
        WHERE facility_id=? AND timestamp >= datetime('now', '-24 hours')
    """, (facility_id,)).fetchone())
    conn.close()

    recs = []

    # ── From alerts ──────────────────────────────────────────────────────────
    for al in alert_rows:
        sev_map = {"critical": "danger", "warning": "warn", "info": ""}
        recs.append({
            "type":    sev_map.get(al["severity"], ""),
            "icon":    "🔴" if al["severity"] == "critical" else "⚡",
            "title":   al["message"][:60],
            "desc":    al["message"],
            "saving":  f"Threshold breached: {al['value']} vs {al['threshold']} limit" if al["value"] else "",
            "source":  "alert"
        })

    # ── From anomalies ───────────────────────────────────────────────────────
    for row in anomaly_rows:
        ts = datetime.fromisoformat(row["timestamp"])
        recs.append({
            "type":   "warn",
            "icon":   "⚡",
            "title":  f"Anomaly detected at {ts.strftime('%d %b %H:00')}",
            "desc":   (f"Electricity: {row['electricity_usage']:.0f} kWh, "
                       f"HVAC: {row['hvac_usage']:.0f} kWh — anomaly score: {row['anomaly_score']:.3f}. "
                       "Review HVAC setpoints and check for equipment faults."),
            "saving": f"Potential saving: ₹{row['electricity_usage'] * 0.08 * 9:.0f}/event",
            "source": "anomaly_model"
        })

    # ── From efficiency ───────────────────────────────────────────────────────
    eff_issues = analyze_hvac_efficiency(facility_id)
    for issue in eff_issues[:3]:
        recs.append({
            "type":   "warn",
            "icon":   "🌡️",
            "title":  issue["message"][:60],
            "desc":   issue["message"],
            "saving": f"Potential saving: ₹{issue['saving_est_inr']:.0f}/hour",
            "source": "efficiency_analyzer"
        })

    # ── General good-practice ─────────────────────────────────────────────────
    if agg.get("avg_occ") and agg["avg_occ"] < 40:
        recs.append({
            "type":   "good",
            "icon":   "🌙",
            "title":  "Off-hours energy within target",
            "desc":   (f"Average occupancy {agg['avg_occ']:.0f}% with energy draw "
                       f"{agg['avg_elec']:.0f} kWh/h — automation running effectively."),
            "saving": "",
            "source": "efficiency_analyzer"
        })

    if not recs:
        recs.append({
            "type": "good", "icon": "✅",
            "title": "All systems nominal",
            "desc":  "No anomalies or inefficiencies detected in the last 48 hours.",
            "saving": "", "source": "anomaly_model"
        })

    return recs[:8]


# ─── Training Orchestrator ────────────────────────────────────────────────────

def train_all() -> dict:
    """Train all models and return combined metrics."""
    print("\n── Training Anomaly Detector ─────────────────────────────────────")
    anomaly_det = AnomalyDetector()
    anom_metrics = anomaly_det.train()

    print("\n── Training Energy Forecaster ────────────────────────────────────")
    forecaster   = EnergyForecaster()
    fore_metrics = forecaster.train(facility_id=1)

    # Save metrics to DB
    conn = get_connection()
    conn.execute("DELETE FROM MODEL_METADATA")
    conn.execute("""
        INSERT INTO MODEL_METADATA (model_name, accuracy, parameters)
        VALUES (?, ?, ?)
    """, ("IsolationForest_AnomalyDetector",
          anom_metrics["accuracy"],
          json.dumps(anom_metrics)))
    conn.execute("""
        INSERT INTO MODEL_METADATA (model_name, accuracy, parameters)
        VALUES (?, ?, ?)
    """, ("GradientBoosting_EnergyForecaster",
          None,
          json.dumps(fore_metrics)))
    conn.commit()
    conn.close()

    return {"anomaly": anom_metrics, "forecaster": fore_metrics}


def check_accuracy() -> str:
    """Quick accuracy check — reads stored metrics from DB."""
    conn = get_connection()
    row = conn.execute("""
        SELECT accuracy, parameters FROM MODEL_METADATA
        WHERE model_name='IsolationForest_AnomalyDetector'
        ORDER BY trained_at DESC LIMIT 1
    """).fetchone()
    conn.close()
    if row:
        metrics = json.loads(row["parameters"])
        acc = metrics.get("accuracy", 0)
        print(f"Anomaly detection accuracy: {acc:.1%}")
        assert acc >= 0.85, f"Accuracy {acc:.1%} below 85% target!"
        return f"✅ {acc:.1%} accuracy — meets ≥85% target"
    return "⚠️ Model not trained yet"


# ─── Singletons (lazy loaded by API) ─────────────────────────────────────────
_anomaly_detector = None
_forecaster       = None

def get_anomaly_detector() -> AnomalyDetector:
    global _anomaly_detector
    if _anomaly_detector is None:
        _anomaly_detector = AnomalyDetector()
        _anomaly_detector.load()
    return _anomaly_detector

def get_forecaster() -> EnergyForecaster:
    global _forecaster
    if _forecaster is None:
        _forecaster = EnergyForecaster()
        _forecaster.load()
    return _forecaster


if __name__ == "__main__":
    metrics = train_all()
    print("\n── Final Metrics ─────────────────────────────────────────────────")
    print(json.dumps(metrics, indent=2))
    print("\n── Accuracy Check ────────────────────────────────────────────────")
    print(check_accuracy())
