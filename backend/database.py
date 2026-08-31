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

    conn.commit()
    conn.close()
    print("✅ Database initialised →", DB_PATH)


if __name__ == "__main__":
    init_db()
