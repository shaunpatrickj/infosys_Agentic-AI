"""
seed_data.py — FacilityOps Synthetic Dataset Generator
Generates 30 days of realistic hourly energy telemetry for 4 facilities
and seeds the SQLite database. Injected anomalies provide ground truth
for training the Isolation Forest anomaly detector.
"""

import sqlite3
import random
import math
from datetime import datetime, timedelta
from database import get_connection, init_db

# ── Reproducible seed ────────────────────────────────────────────────────────
random.seed(42)

# ── Facility definitions ─────────────────────────────────────────────────────
FACILITIES = [
    {"name": "Campus A — Block 1", "type": "campus",     "location": "Bangalore, KA", "area_sqft": 45000},
    {"name": "Campus A — Block 2", "type": "campus",     "location": "Bangalore, KA", "area_sqft": 38000},
    {"name": "Campus B — Main Hall","type": "office",    "location": "Hyderabad, TS", "area_sqft": 22000},
    {"name": "Data Center — Floor 3","type":"datacenter","location": "Chennai, TN",   "area_sqft": 8000},
]

# ── Base energy profiles (kWh per hour at full load) ─────────────────────────
PROFILES = {
    "campus":     {"electricity": 220, "hvac": 99,  "lighting": 62, "equipment": 40, "water": 45,  "other": 20},
    "office":     {"electricity": 140, "hvac": 63,  "lighting": 39, "equipment": 25, "water": 28,  "other": 13},
    "datacenter": {"electricity": 380, "hvac": 171, "lighting": 11, "equipment": 152,"water": 20,  "other": 46},
}

DAYS = 30
ANOMALY_RATE = 0.04   # ~4% of records will be anomalies


def work_multiplier(hour: int, is_weekend: bool, facility_type: str) -> float:
    """Return a load multiplier based on time of day and day type."""
    if facility_type == "datacenter":
        # Datacenters run near-constant with mild overnight dip
        return 0.85 + 0.15 * math.sin(math.pi * (hour - 2) / 12) if hour >= 6 else 0.80
    if is_weekend:
        return 0.30 if (8 <= hour <= 17) else 0.15
    # Weekday office/campus pattern
    if 7 <= hour <= 9:   return 0.70 + 0.05 * (hour - 7)   # ramp up
    if 10 <= hour <= 17: return 0.95
    if 18 <= hour <= 20: return 0.65
    return 0.20                                              # off-hours


def temperature_c(day_of_year: int, hour: int) -> float:
    """Simulate outdoor temperature (Bangalore-like climate)."""
    seasonal = 27 + 5 * math.sin(2 * math.pi * (day_of_year - 90) / 365)
    diurnal  = 3 * math.sin(math.pi * (hour - 5) / 12)
    return round(seasonal + diurnal + random.gauss(0, 0.8), 1)


def generate_usage(profile: dict, mult: float, temp: float, inject_anomaly: bool) -> dict:
    """Generate a single hourly reading."""
    def jitter(v, frac=0.08):
        return max(0, v * mult * (1 + random.gauss(0, frac)))

    # Temperature drives extra HVAC load
    hvac_temp_factor = 1 + max(0, (temp - 28) * 0.04)

    usage = {
        "electricity": jitter(profile["electricity"]),
        "hvac":        jitter(profile["hvac"]) * hvac_temp_factor,
        "lighting":    jitter(profile["lighting"]),
        "equipment":   jitter(profile["equipment"]),
        "water":       jitter(profile["water"]),
        "other":       jitter(profile["other"]),
    }

    if inject_anomaly:
        # Pick a random subsystem and spike it
        spike_key = random.choice(["electricity", "hvac", "water"])
        usage[spike_key] *= random.uniform(1.8, 3.2)   # 180%–320% spike
        usage["electricity"] = max(usage["electricity"],
                                   usage["hvac"] + usage["lighting"] + usage["equipment"] + usage["other"])

    return usage


def seed():
    init_db()
    conn = get_connection()
    cur  = conn.cursor()

    # ── Clear existing data (for idempotent re-seeding) ──────────────────────
    cur.execute("DELETE FROM ALERTS")
    cur.execute("DELETE FROM ENERGY_USAGE")
    cur.execute("DELETE FROM FACILITIES")
    cur.execute("DELETE FROM sqlite_sequence")   # reset auto-increment
    conn.commit()

    # ── Insert facilities ─────────────────────────────────────────────────────
    facility_ids = []
    for f in FACILITIES:
        cur.execute("""
            INSERT INTO FACILITIES (facility_name, facility_type, location, area_sqft)
            VALUES (?, ?, ?, ?)
        """, (f["name"], f["type"], f["location"], f["area_sqft"]))
        facility_ids.append(cur.lastrowid)
    conn.commit()
    print(f"✅ Inserted {len(facility_ids)} facilities")

    # ── Generate hourly energy data ───────────────────────────────────────────
    start_dt = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=DAYS)
    rows_inserted = 0
    anomaly_count = 0

    batch = []
    for fac_idx, fac_id in enumerate(facility_ids):
        fac_type = FACILITIES[fac_idx]["type"]
        profile  = PROFILES[fac_type]

        for day_offset in range(DAYS + 1):          # include today
            current_date = start_dt + timedelta(days=day_offset)
            is_weekend   = current_date.weekday() >= 5
            day_of_year  = current_date.timetuple().tm_yday

            for hour in range(24):
                ts   = (current_date + timedelta(hours=hour)).strftime("%Y-%m-%dT%H:%M:%S")
                mult = work_multiplier(hour, is_weekend, fac_type)
                temp = temperature_c(day_of_year, hour)

                inject_anomaly = random.random() < ANOMALY_RATE
                usage = generate_usage(profile, mult, temp, inject_anomaly)

                occupancy = min(100, max(0, mult * 100 + random.gauss(0, 5)))

                batch.append((
                    fac_id,
                    ts,
                    round(usage["electricity"], 2),
                    round(usage["water"],       2),
                    round(usage["hvac"],        2),
                    round(usage["lighting"],    2),
                    round(usage["equipment"],   2),
                    round(usage["other"],       2),
                    temp,
                    round(occupancy, 1),
                    int(inject_anomaly),
                    0.0,          # anomaly_score set by AI engine later
                ))

                if inject_anomaly:
                    anomaly_count += 1

    cur.executemany("""
        INSERT INTO ENERGY_USAGE
        (facility_id, timestamp, electricity_usage, water_usage, hvac_usage,
         lighting_usage, equipment_usage, other_usage,
         outdoor_temp_c, occupancy_pct, is_anomaly, anomaly_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, batch)
    rows_inserted = len(batch)
    conn.commit()

    print(f"✅ Inserted {rows_inserted:,} hourly energy records")
    print(f"   ↳ Ground-truth anomalies injected: {anomaly_count:,} "
          f"({100*anomaly_count/rows_inserted:.1f}%)")

    # ── Seed a few pre-generated alerts ──────────────────────────────────────
    alerts = [
        (facility_ids[0], "hvac_inefficiency", "warning",
         "HVAC running at 142% baseline between 14:00–16:00. Likely setpoint misconfiguration.",
         "hvac_usage", 141, 100),
        (facility_ids[0], "peak_demand", "critical",
         "Forecasted demand spike of 38 kW above contracted capacity at 17:30–18:30.",
         "electricity_usage", 338, 300),
        (facility_ids[2], "anomaly", "warning",
         "Water consumption 23% above expected floor-area baseline. Check for leaks.",
         "water_usage", 55, 45),
    ]
    cur.executemany("""
        INSERT INTO ALERTS (facility_id, alert_type, severity, message, metric, value, threshold)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, alerts)
    conn.commit()
    print(f"✅ Inserted {len(alerts)} initial alerts")

    conn.close()
    print("\n🎉 Database seeding complete!")


if __name__ == "__main__":
    seed()
