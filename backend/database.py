"""
database.py — FacilityOps SQLite Schema Setup
Creates all tables for Phase 1 of the Agentic FacilityOps AI Platform.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "facilityops.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db():
    """Create all tables if they don't exist."""
    conn = get_connection()
    cur = conn.cursor()

    # ── FACILITIES ─────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS FACILITIES (
            facility_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            facility_name TEXT    NOT NULL,
            facility_type TEXT    NOT NULL,   -- 'campus', 'datacenter', 'office'
            location      TEXT    NOT NULL,
            area_sqft     REAL    DEFAULT 0,
            created_at    TEXT    DEFAULT (datetime('now'))
        )
    """)

    # ── ENERGY_USAGE ───────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ENERGY_USAGE (
            energy_id         INTEGER PRIMARY KEY AUTOINCREMENT,
            facility_id       INTEGER NOT NULL REFERENCES FACILITIES(facility_id),
            timestamp         TEXT    NOT NULL,
            electricity_usage REAL    NOT NULL,   -- kWh
            water_usage       REAL    NOT NULL,   -- litres
            hvac_usage        REAL    NOT NULL,   -- kWh
            lighting_usage    REAL    NOT NULL,   -- kWh
            equipment_usage   REAL    NOT NULL,   -- kWh
            other_usage       REAL    NOT NULL,   -- kWh
            outdoor_temp_c    REAL    DEFAULT 25, -- ambient temperature proxy
            occupancy_pct     REAL    DEFAULT 0,  -- 0-100%
            is_anomaly        INTEGER DEFAULT 0,  -- 0 or 1 (set by AI engine)
            anomaly_score     REAL    DEFAULT 0   -- isolation forest score
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_eu_facility_ts
        ON ENERGY_USAGE (facility_id, timestamp)
    """)

    # ── ALERTS ─────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ALERTS (
            alert_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            facility_id INTEGER NOT NULL REFERENCES FACILITIES(facility_id),
            alert_type  TEXT    NOT NULL,   -- 'anomaly', 'peak_demand', 'hvac_inefficiency', 'water_leak'
            severity    TEXT    NOT NULL,   -- 'info', 'warning', 'critical'
            message     TEXT    NOT NULL,
            metric      TEXT,               -- which metric triggered it
            value       REAL,               -- actual value
            threshold   REAL,              -- threshold that was breached
            resolved    INTEGER DEFAULT 0,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)

    # ── MODEL_METADATA ──────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS MODEL_METADATA (
            model_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            model_name    TEXT NOT NULL,
            trained_at    TEXT DEFAULT (datetime('now')),
            accuracy      REAL,
            parameters    TEXT   -- JSON blob
        )
    """)

    # ── ASSETS ─────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ASSETS (
            asset_id              TEXT PRIMARY KEY,
            facility_id           INTEGER NOT NULL REFERENCES FACILITIES(facility_id),
            asset_name            TEXT NOT NULL,
            asset_type            TEXT NOT NULL,   -- 'AHU', 'Chiller', 'Pump', 'Transformer', 'Elevator', 'Genset'
            location_zone         TEXT DEFAULT 'Main Facility',
            status                TEXT DEFAULT 'OPERATIONAL', -- 'OPERATIONAL', 'WARNING', 'CRITICAL', 'MAINTENANCE'
            installation_date     TEXT DEFAULT (date('now', '-2 years')),
            last_maintenance_date TEXT DEFAULT (date('now', '-30 days')),
            operating_hours       REAL DEFAULT 0,
            created_at            TEXT DEFAULT (datetime('now'))
        )
    """)

    # ── ASSET_MONITORING_DATA ──────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ASSET_MONITORING_DATA (
            telemetry_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id        TEXT NOT NULL REFERENCES ASSETS(asset_id),
            timestamp       TEXT NOT NULL,
            temperature_c   REAL NOT NULL,
            vibration_mm_s  REAL NOT NULL,
            current_amps    REAL NOT NULL,
            voltage_v       REAL NOT NULL,
            operating_hours REAL NOT NULL,
            runtime_hours   REAL NOT NULL,
            is_abnormal     INTEGER DEFAULT 0,
            failure_risk    REAL DEFAULT 0.0
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_amd_asset_ts
        ON ASSET_MONITORING_DATA (asset_id, timestamp)
    """)

    # ── EQUIPMENT_HEALTH ───────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS EQUIPMENT_HEALTH (
            health_id            INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id             TEXT NOT NULL REFERENCES ASSETS(asset_id),
            health_score         REAL NOT NULL,    -- 0 - 100
            health_status        TEXT NOT NULL,    -- 'EXCELLENT', 'GOOD', 'WARNING', 'CRITICAL'
            risk_level           TEXT NOT NULL,    -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
            contributing_factors TEXT,             -- JSON string array
            evaluated_at         TEXT DEFAULT (datetime('now'))
        )
    """)

    # ── MAINTENANCE_PREDICTIONS ────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS MAINTENANCE_PREDICTIONS (
            prediction_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id           TEXT NOT NULL REFERENCES ASSETS(asset_id),
            risk_level         TEXT NOT NULL,     -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
            priority           TEXT NOT NULL,     -- 'NORMAL', 'MONITOR', 'RECOMMENDED', 'URGENT'
            prediction_text    TEXT NOT NULL,
            recommended_action TEXT NOT NULL,
            confidence         REAL DEFAULT 0.85,
            predicted_at       TEXT DEFAULT (datetime('now'))
        )
    """)

    # ── MAINTENANCE_ALERTS ─────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS MAINTENANCE_ALERTS (
            alert_id           INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id           TEXT NOT NULL REFERENCES ASSETS(asset_id),
            facility_id        INTEGER NOT NULL REFERENCES FACILITIES(facility_id),
            severity           TEXT NOT NULL,     -- 'info', 'warning', 'critical'
            alert_type         TEXT NOT NULL,     -- 'vibration', 'thermal', 'electrical', 'runtime', 'health_critical'
            description        TEXT NOT NULL,
            detected_condition TEXT NOT NULL,
            recommended_action TEXT NOT NULL,
            status             TEXT DEFAULT 'NEW', -- 'NEW', 'ACKNOWLEDGED', 'RESOLVED'
            created_at         TEXT DEFAULT (datetime('now'))
        )
    """)

    # ── MAINTENANCE_WORK_ORDERS ───────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS MAINTENANCE_WORK_ORDERS (
            work_order_id      TEXT PRIMARY KEY,
            asset_id           TEXT NOT NULL REFERENCES ASSETS(asset_id),
            facility_id        INTEGER NOT NULL REFERENCES FACILITIES(facility_id),
            issue              TEXT NOT NULL,
            priority           TEXT NOT NULL,     -- 'LOW', 'MEDIUM', 'HIGH', 'URGENT'
            recommended_action TEXT NOT NULL,
            status             TEXT DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'COMPLETED'
            created_at         TEXT DEFAULT (datetime('now')),
            updated_at         TEXT DEFAULT (datetime('now'))
        )
    """)

    conn.commit()
    conn.close()
    print("✅ Database initialised →", DB_PATH)


if __name__ == "__main__":
    init_db()
