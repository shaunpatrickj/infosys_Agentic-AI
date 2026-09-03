"""
maintenance_agent.py — FacilityOps Maintenance Agent
Milestone 2: Predictive Maintenance Engine

Provides modular equipment health scoring, abnormal behavior detection,
maintenance prediction, alert deduplication, work order management, and natural language Q&A.
"""

import json
from datetime import datetime
from typing import List, Dict, Optional

from database import get_connection

# ── Sensor Thresholds per Asset Type ─────────────────────────────────────────
ASSET_THRESHOLDS = {
    "AHU":         {"temp_max": 32.0, "vib_max": 2.5, "curr_max": 35.0,  "volt_nominal": 415.0},
    "Chiller":     {"temp_max": 50.0, "vib_max": 3.8, "curr_max": 150.0, "volt_nominal": 415.0},
    "Pump":        {"temp_max": 45.0, "vib_max": 2.8, "curr_max": 55.0,  "volt_nominal": 415.0},
    "Transformer": {"temp_max": 65.0, "vib_max": 1.0, "curr_max": 220.0, "volt_nominal": 415.0},
    "Elevator":    {"temp_max": 40.0, "vib_max": 1.5, "curr_max": 48.0,  "volt_nominal": 415.0},
    "Genset":      {"temp_max": 85.0, "vib_max": 5.0, "curr_max": 300.0, "volt_nominal": 415.0},
}


class MaintenanceAgent:
    """
    Autonomous Maintenance Agent for condition monitoring, health scoring,
    anomaly detection, failure risk prediction, alert management, and work order creation.
    This class is intentionally modular so the scoring/detection methods can be upgraded
    to advanced ML models in future milestones without changing the API surface.
    """

    # ── Public API ──────────────────────────────────────────────────────────

    def evaluate_asset_health(self, asset_id: str) -> Dict:
        """Evaluate health score (0-100) and risk profile for a specific asset."""
        conn = get_connection()
        asset = conn.execute("SELECT * FROM ASSETS WHERE asset_id=?", (asset_id,)).fetchone()
        if not asset:
            conn.close()
            raise ValueError(f"Asset {asset_id} not found")
        asset = dict(asset)
        telemetry = [dict(t) for t in conn.execute(
            "SELECT * FROM ASSET_MONITORING_DATA WHERE asset_id=? ORDER BY timestamp DESC LIMIT 24",
            (asset_id,)).fetchall()]
        conn.close()

        if not telemetry:
            return self._format_health_output(
                asset_id=asset_id, asset_name=asset["asset_name"],
                asset_type=asset["asset_type"], facility_id=asset["facility_id"],
                health_score=88.0, health_status="GOOD", risk_level="LOW",
                contributing_factors=["Nominal baseline — no recent telemetry recorded"],
                latest_telemetry={}, recommended_action="Continue standard monitoring schedule")

        latest = telemetry[0]
        limits = ASSET_THRESHOLDS.get(asset["asset_type"], ASSET_THRESHOLDS["AHU"])
        score, factors = self._score_asset(latest, limits, asset["status"])

        health_status, risk_level, recommended_action = self._classify_score(score, asset["asset_type"])

        if not factors:
            factors = ["All monitored parameters operating within normal tolerance limits"]

        self._save_health_to_db(asset_id, score, health_status, risk_level, factors)

        if health_status in ["WARNING", "CRITICAL"]:
            self.trigger_maintenance_alert(
                asset_id, asset["facility_id"], score, health_status,
                factors, recommended_action, latest)

        return self._format_health_output(
            asset_id=asset_id, asset_name=asset["asset_name"],
            asset_type=asset["asset_type"], facility_id=asset["facility_id"],
            health_score=round(score, 1), health_status=health_status,
            risk_level=risk_level, contributing_factors=factors,
            latest_telemetry=latest, recommended_action=recommended_action)

    def predict_maintenance(self, asset_id: str) -> Dict:
        """Predict maintenance requirements and priority without fabricating failure dates."""
        health = self.evaluate_asset_health(asset_id)
        score, status = health["health_score"], health["health_status"]

        if status == "CRITICAL":
            priority, confidence = "URGENT", 0.92
            prediction = "High probability of functional breakdown under peak load."
            recommendation = "Urgent maintenance required within 24–48 hours to prevent forced outage."
        elif status == "WARNING":
            priority, confidence = "RECOMMENDED", 0.85
            prediction = "Accelerated component degradation detected; close monitoring advised."
            recommendation = "Schedule preventive maintenance within the next maintenance cycle."
        elif score < 85:
            priority, confidence = "MONITOR", 0.78
            prediction = "Minor parameter drift detected; asset stable under normal load."
            recommendation = "Continue close monitoring during next scheduled facility round."
        else:
            priority, confidence = "NORMAL", 0.95
            prediction = "Equipment operating at peak health index."
            recommendation = "No immediate maintenance required. Maintain standard PM schedule."

        result = {
            "asset_id": asset_id, "asset_name": health["asset_name"],
            "asset_type": health["asset_type"], "facility_id": health["facility_id"],
            "health_score": score, "health_status": status,
            "risk_level": health["risk_level"], "priority": priority,
            "prediction": prediction, "recommended_action": recommendation,
            "contributing_factors": health["contributing_factors"],
            "confidence": confidence, "timestamp": datetime.now().isoformat()
        }
        self._save_prediction_to_db(asset_id, health["risk_level"], priority, prediction, recommendation, confidence)
        return result

    def detect_abnormal_behavior(self, asset_id: str) -> Dict:
        """Detect abnormal equipment behavior across historical sensor telemetry."""
        conn = get_connection()
        asset = conn.execute("SELECT asset_type FROM ASSETS WHERE asset_id=?", (asset_id,)).fetchone()
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM ASSET_MONITORING_DATA WHERE asset_id=? ORDER BY timestamp DESC LIMIT 48",
            (asset_id,)).fetchall()]
        conn.close()

        if not rows:
            return {"asset_id": asset_id, "anomalies_detected": 0, "status": "NOMINAL", "details": []}

        a_type = dict(asset)["asset_type"] if asset else "AHU"
        limits = ASSET_THRESHOLDS.get(a_type, ASSET_THRESHOLDS["AHU"])
        latest = rows[0]
        abnormal_rows = [r for r in rows if r["is_abnormal"] == 1]

        anom_reasons = []
        if latest["vibration_mm_s"] > limits["vib_max"]:
            anom_reasons.append(f"Vibration spike ({latest['vibration_mm_s']:.2f} mm/s > {limits['vib_max']} limit)")
        if latest["temperature_c"] > limits["temp_max"]:
            anom_reasons.append(f"Thermal anomaly ({latest['temperature_c']:.1f}°C > {limits['temp_max']}°C limit)")
        if latest["current_amps"] > limits["curr_max"]:
            anom_reasons.append(f"Current surge ({latest['current_amps']:.1f}A > {limits['curr_max']}A rated)")

        return {
            "asset_id": asset_id,
            "records_scanned": len(rows),
            "anomalies_detected": len(abnormal_rows),
            "latest_is_abnormal": bool(latest["is_abnormal"] or anom_reasons),
            "reasons": anom_reasons if anom_reasons else ["Telemetry within normal statistical bounds"],
            "latest_telemetry": {
                "temperature_c": latest["temperature_c"],
                "vibration_mm_s": latest["vibration_mm_s"],
                "current_amps": latest["current_amps"],
                "voltage_v": latest["voltage_v"]
            }
        }

    def trigger_maintenance_alert(self, asset_id: str, facility_id: int, health_score: float,
                                  health_status: str, factors: List[str], recommended_action: str,
                                  latest_telemetry: Dict) -> Optional[Dict]:
        """Generate maintenance alert with deduplication (avoids repeated NEW alerts for same issue)."""
        conn = get_connection()
        alert_type = "health_critical" if health_status == "CRITICAL" else "health_warning"
        severity   = "critical" if health_status == "CRITICAL" else "warning"

        # Deduplication: suppress if an unresolved alert of same type already exists
        existing = conn.execute("""
            SELECT alert_id FROM MAINTENANCE_ALERTS
            WHERE asset_id=? AND alert_type=? AND status IN ('NEW', 'ACKNOWLEDGED')
        """, (asset_id, alert_type)).fetchone()
        if existing:
            conn.close()
            return None

        desc      = f"Equipment health degraded to {health_score:.0f}/100 ({health_status}). " + "; ".join(factors[:2])
        condition = f"Health Score {health_score:.0f}/100 — Status: {health_status}"

        cur = conn.cursor()
        cur.execute("""
            INSERT INTO MAINTENANCE_ALERTS
            (asset_id, facility_id, severity, alert_type, description, detected_condition, recommended_action, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'NEW')
        """, (asset_id, facility_id, severity, alert_type, desc, condition, recommended_action))
        alert_id = cur.lastrowid
        conn.commit()
        conn.close()

        return {
            "alert_id": alert_id, "asset_id": asset_id, "facility_id": facility_id,
            "severity": severity, "alert_type": alert_type,
            "description": desc, "detected_condition": condition,
            "recommended_action": recommended_action,
            "status": "NEW", "created_at": datetime.now().isoformat()
        }

    def create_work_order(self, asset_id: str, issue: str, priority: str, recommended_action: str) -> Dict:
        """Create a new maintenance work order."""
        conn = get_connection()
        asset = conn.execute("SELECT facility_id FROM ASSETS WHERE asset_id=?", (asset_id,)).fetchone()
        facility_id = dict(asset)["facility_id"] if asset else 1
        wo_count = conn.execute("SELECT COUNT(*) n FROM MAINTENANCE_WORK_ORDERS").fetchone()["n"]
        wo_id = f"WO-{datetime.now().year}-{wo_count + 101:03d}"
        conn.execute("""
            INSERT INTO MAINTENANCE_WORK_ORDERS
            (work_order_id, asset_id, facility_id, issue, priority, recommended_action, status)
            VALUES (?, ?, ?, ?, ?, ?, 'OPEN')
        """, (wo_id, asset_id, facility_id, issue, priority, recommended_action))
        conn.commit()
        conn.close()
        return {
            "work_order_id": wo_id, "asset_id": asset_id, "facility_id": facility_id,
            "issue": issue, "priority": priority,
            "recommended_action": recommended_action,
            "status": "OPEN", "created_at": datetime.now().isoformat()
        }

    def analyze_all_assets(self, facility_id: Optional[int] = None) -> List[Dict]:
        """Run health evaluation across all (or facility-scoped) assets."""
        conn = get_connection()
        if facility_id:
            assets = conn.execute("SELECT asset_id FROM ASSETS WHERE facility_id=?", (facility_id,)).fetchall()
        else:
            assets = conn.execute("SELECT asset_id FROM ASSETS").fetchall()
        conn.close()
        return [self.evaluate_asset_health(a["asset_id"]) for a in assets]

    def answer_maintenance_query(self, question: str, facility_id: int = 1) -> Dict:
        """Contextual Q&A for natural language maintenance queries."""
        q = question.lower()
        all_evals = self.analyze_all_assets(facility_id)
        critical = [e for e in all_evals if e["health_status"] == "CRITICAL"]
        warning  = [e for e in all_evals if e["health_status"] == "WARNING"]
        healthy  = [e for e in all_evals if e["health_status"] in ["EXCELLENT", "GOOD"]]

        conn = get_connection()
        open_wos    = [dict(r) for r in conn.execute(
            "SELECT * FROM MAINTENANCE_WORK_ORDERS WHERE facility_id=? AND status != 'COMPLETED'", (facility_id,)).fetchall()]
        open_alerts = [dict(r) for r in conn.execute(
            "SELECT * FROM MAINTENANCE_ALERTS WHERE facility_id=? AND status != 'RESOLVED'", (facility_id,)).fetchall()]
        conn.close()

        avg_health = sum(e["health_score"] for e in all_evals) / max(len(all_evals), 1)

        if any(k in q for k in ["critical", "urgent", "breakdown", "failure"]):
            if critical:
                c = critical[0]
                answer = (f"Found {len(critical)} CRITICAL asset(s) requiring urgent attention. "
                          f"**{c['asset_name']} ({c['asset_id']})** health score: **{c['health_score']}/100**. "
                          f"Factors: {', '.join(c['contributing_factors'][:2])}. "
                          f"Recommended: {c['recommended_action']}")
            else:
                answer = "No critical asset breakdowns detected. All monitored equipment is operating above critical thresholds."

        elif "vibration" in q:
            vib_flagged = [e for e in all_evals if any("vibration" in f.lower() for f in e["contributing_factors"])]
            if vib_flagged:
                v = vib_flagged[0]
                tele = v["latest_telemetry"]
                answer = (f"Vibration anomaly detected in **{v['asset_name']} ({v['asset_id']})**. "
                          f"Latest: {tele.get('vibration_mm_s', 'N/A')} mm/s. "
                          f"Recommend: shaft alignment check and bearing housing inspection.")
            else:
                answer = "All vibration sensor readings are within nominal limits across all monitored motors and pumps."

        elif any(k in q for k in ["work order", "ticket", "open"]):
            if open_wos:
                wo = open_wos[0]
                answer = (f"{len(open_wos)} open maintenance work orders for this facility. "
                          f"Top priority: **{wo['work_order_id']}** — {wo['issue']} (Status: {wo['status']}). "
                          f"Active maintenance alerts: {len(open_alerts)}.")
            else:
                answer = f"No open work orders. All tasks completed. Active alerts: {len(open_alerts)}."

        elif any(k in q for k in ["summary", "overview", "status", "all assets", "health"]):
            answer = (f"Scanned **{len(all_evals)} assets** for Facility {facility_id}. "
                      f"Healthy: **{len(healthy)}** | Warning: **{len(warning)}** | Critical: **{len(critical)}**. "
                      f"Facility Equipment Health Index: **{avg_health:.1f}/100**. "
                      f"Open alerts: **{len(open_alerts)}** | Open work orders: **{len(open_wos)}**.")

        elif "temperature" in q or "thermal" in q or "overheat" in q:
            temp_flagged = [e for e in all_evals if any("temperature" in f.lower() or "thermal" in f.lower() for f in e["contributing_factors"])]
            if temp_flagged:
                t = temp_flagged[0]
                answer = (f"Thermal anomaly in **{t['asset_name']}**: operating temperature elevated. "
                          f"Health score: {t['health_score']}/100. Recommend cooling system inspection.")
            else:
                answer = "All thermal sensor readings are within normal operating ranges. No overheating detected."

        else:
            answer = (f"Maintenance Agent scanned {len(all_evals)} facility assets. "
                      f"Overall Equipment Health Index: **{avg_health:.1f}/100**. "
                      f"{len(warning) + len(critical)} asset(s) need attention. "
                      f"{len(open_alerts)} maintenance alert(s) active.")

        return {
            "facility_id": facility_id, "question": question, "answer": answer,
            "total_assets": len(all_evals), "critical_count": len(critical),
            "warning_count": len(warning), "healthy_count": len(healthy),
            "open_work_orders": len(open_wos), "open_alerts": len(open_alerts),
            "avg_health_score": round(avg_health, 1),
            "timestamp": datetime.now().isoformat()
        }

    # ── Internal Scoring Engine ─────────────────────────────────────────────

    def _score_asset(self, latest: Dict, limits: Dict, db_status: str):
        """Multi-factor health scoring. Returns (score, contributing_factors)."""
        score, factors = 100.0, []

        temp = latest["temperature_c"]
        if temp > limits["temp_max"]:
            deduct = min(35.0, 15.0 + (temp - limits["temp_max"]) * 2.0)
            score -= deduct
            factors.append(f"Elevated operating temperature ({temp:.1f}°C vs max {limits['temp_max']}°C)")
        elif temp > limits["temp_max"] - 4.0:
            score -= 8.0
            factors.append(f"Temperature approaching threshold ({temp:.1f}°C)")

        vib = latest["vibration_mm_s"]
        if vib > limits["vib_max"]:
            deduct = min(40.0, 18.0 + (vib - limits["vib_max"]) * 8.0)
            score -= deduct
            factors.append(f"Abnormal vibration ({vib:.2f} mm/s vs max {limits['vib_max']} mm/s)")
        elif vib > limits["vib_max"] * 0.8:
            score -= 10.0
            factors.append(f"Vibration approaching warning threshold ({vib:.2f} mm/s)")

        curr = latest["current_amps"]
        if curr > limits["curr_max"]:
            deduct = min(25.0, 10.0 + (curr - limits["curr_max"]) * 0.5)
            score -= deduct
            factors.append(f"Overcurrent draw ({curr:.1f}A vs rated {limits['curr_max']}A)")

        v_diff = abs(latest["voltage_v"] - limits["volt_nominal"])
        if v_diff > 15.0:
            score -= 12.0
            factors.append(f"Voltage instability ({latest['voltage_v']:.1f}V vs nominal {limits['volt_nominal']}V)")

        oph = latest["operating_hours"]
        if oph > 20000:
            score -= 15.0
            factors.append(f"High cumulative operating hours ({oph:,.0f} hrs — approaching overhaul interval)")
        elif oph > 15000:
            score -= 8.0
            factors.append(f"Moderate cumulative wear ({oph:,.0f} hrs)")

        if db_status == "CRITICAL":
            score = min(score, 45.0)
            if not any("critical" in f.lower() for f in factors):
                factors.append("Equipment manually flagged as CRITICAL status")
        elif db_status == "WARNING":
            score = min(score, 72.0)
            if not any("warning" in f.lower() for f in factors):
                factors.append("Equipment status set to WARNING")

        return max(5.0, min(100.0, score)), factors

    def _classify_score(self, score: float, asset_type: str):
        if score >= 90:
            return "EXCELLENT", "LOW", "Routine inspection on schedule — no action required"
        elif score >= 75:
            return "GOOD", "LOW", "Monitor standard operating parameters at next PM cycle"
        elif score >= 50:
            return "WARNING", "MEDIUM", f"Inspect {asset_type} mechanical assembly, vibration dampers and thermal setpoints"
        else:
            return "CRITICAL", ("CRITICAL" if score < 30 else "HIGH"), \
                   f"Urgent maintenance required — inspect motor windings, bearings, and clear load restrictions"

    def _save_health_to_db(self, asset_id, score, status, risk, factors):
        conn = get_connection()
        conn.execute("""
            INSERT INTO EQUIPMENT_HEALTH (asset_id, health_score, health_status, risk_level, contributing_factors)
            VALUES (?, ?, ?, ?, ?)
        """, (asset_id, score, status, risk, json.dumps(factors)))
        conn.execute("UPDATE ASSETS SET status=? WHERE asset_id=?", (status, asset_id))
        conn.commit(); conn.close()

    def _save_prediction_to_db(self, asset_id, risk, priority, text, rec, conf):
        conn = get_connection()
        conn.execute("""
            INSERT INTO MAINTENANCE_PREDICTIONS (asset_id, risk_level, priority, prediction_text, recommended_action, confidence)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (asset_id, risk, priority, text, rec, conf))
        conn.commit(); conn.close()

    def _format_health_output(self, asset_id, asset_name, asset_type, facility_id,
                              health_score, health_status, risk_level,
                              contributing_factors, latest_telemetry, recommended_action):
        return {
            "asset_id": asset_id, "asset_name": asset_name,
            "asset_type": asset_type, "facility_id": facility_id,
            "health_score": health_score, "health_status": health_status,
            "risk_level": risk_level,
            "anomaly_detected": health_status in ["WARNING", "CRITICAL"],
            "maintenance_required": health_status in ["WARNING", "CRITICAL"],
            "contributing_factors": contributing_factors,
            "recommended_action": recommended_action,
            "latest_telemetry": latest_telemetry,
            "confidence": 0.88, "timestamp": datetime.now().isoformat()
        }


# ── Singleton ──────────────────────────────────────────────────────────────────
_maintenance_agent = None

def get_maintenance_agent() -> MaintenanceAgent:
    global _maintenance_agent
    if _maintenance_agent is None:
        _maintenance_agent = MaintenanceAgent()
    return _maintenance_agent
