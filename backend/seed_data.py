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
    cur.execute("DELETE FROM MAINTENANCE_WORK_ORDERS")
    cur.execute("DELETE FROM MAINTENANCE_ALERTS")
    cur.execute("DELETE FROM MAINTENANCE_PREDICTIONS")
    cur.execute("DELETE FROM EQUIPMENT_HEALTH")
    cur.execute("DELETE FROM ASSET_MONITORING_DATA")
    cur.execute("DELETE FROM ASSETS")
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

    # ── Insert Assets ─────────────────────────────────────────────────────────
    assets_def = [
        # Facility 1
        ("HVAC-AHU-001", facility_ids[0], "Primary Air Handling Unit 1", "AHU", "Floor 1-3", "OPERATIONAL", "2023-01-15", "2026-08-01", 14200),
        ("CHILLER-001",  facility_ids[0], "Main Centrifugal Chiller", "Chiller", "Basement Plant", "WARNING", "2022-05-10", "2026-07-15", 18500),
        ("PUMP-001",     facility_ids[0], "Chilled Water Pump 1", "Pump", "Basement Plant", "OPERATIONAL", "2023-03-20", "2026-08-10", 12100),
        ("XFRM-001",     facility_ids[0], "Main Incomer Transformer", "Transformer", "Substation A", "OPERATIONAL", "2021-11-01", "2026-06-01", 24000),
        ("ELEV-001",     facility_ids[0], "Passenger Elevator Bank A", "Elevator", "Main Lobby", "OPERATIONAL", "2022-09-12", "2026-08-05", 9800),

        # Facility 2
        ("HVAC-AHU-002", facility_ids[1], "Secondary AHU Unit 2", "AHU", "Block 2 Wing A", "OPERATIONAL", "2023-02-18", "2026-07-28", 11500),
        ("PUMP-002",     facility_ids[1], "Secondary Water Circulation Pump", "Pump", "Plant Room B", "CRITICAL", "2022-03-14", "2026-05-10", 16800),
        ("GENSET-001",   facility_ids[1], "500kVA Diesel Generator", "Genset", "Power Yard", "OPERATIONAL", "2021-08-05", "2026-08-15", 4200),

        # Facility 3
        ("HVAC-AHU-003", facility_ids[2], "Auditorium AHU Unit 3", "AHU", "Main Hall", "WARNING", "2023-04-01", "2026-06-20", 8900),
        ("PUMP-003",     facility_ids[2], "Condenser Water Pump 3", "Pump", "Mechanical Room", "OPERATIONAL", "2022-10-10", "2026-08-12", 10200),

        # Facility 4
        ("CRAC-001",     facility_ids[3], "Precision Air Conditioner 1", "AHU", "Server Room A", "OPERATIONAL", "2023-06-01", "2026-08-18", 15600),
        ("CRAC-002",     facility_ids[3], "Precision Air Conditioner 2", "AHU", "Server Room B", "WARNING", "2023-06-01", "2026-07-02", 15800),
        ("UPS-001",      facility_ids[3], "250kVA Modular UPS System", "Transformer", "Battery Room", "OPERATIONAL", "2022-01-20", "2026-08-01", 21500),
    ]

    cur.executemany("""
        INSERT INTO ASSETS (asset_id, facility_id, asset_name, asset_type, location_zone, status, installation_date, last_maintenance_date, operating_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, assets_def)
    conn.commit()
    print(f"✅ Inserted {len(assets_def)} assets")

    # ── Generate hourly energy data & asset monitoring data ───────────────────
    start_dt = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=DAYS)
    rows_inserted = 0
    anomaly_count = 0

    batch_energy = []
    batch_telemetry = []

    # Nominal sensor baselines per asset type
    SENSOR_BASELINES = {
        "AHU":         {"temp": 24.0, "vib": 1.2, "current": 25.0, "voltage": 415.0},
        "Chiller":     {"temp": 42.0, "vib": 2.5, "current": 120.0,"voltage": 415.0},
        "Pump":        {"temp": 38.0, "vib": 1.8, "current": 45.0, "voltage": 415.0},
        "Transformer": {"temp": 55.0, "vib": 0.4, "current": 180.0,"voltage": 415.0},
        "Elevator":    {"temp": 30.0, "vib": 0.8, "current": 35.0, "voltage": 415.0},
        "Genset":      {"temp": 75.0, "vib": 3.2, "current": 0.0,  "voltage": 415.0},
    }

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

                batch_energy.append((
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
                    0.0,
                ))

                if inject_anomaly:
                    anomaly_count += 1

    cur.executemany("""
        INSERT INTO ENERGY_USAGE
        (facility_id, timestamp, electricity_usage, water_usage, hvac_usage,
         lighting_usage, equipment_usage, other_usage,
         outdoor_temp_c, occupancy_pct, is_anomaly, anomaly_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, batch_energy)
    rows_inserted = len(batch_energy)
    conn.commit()

    # Generate telemetry for each asset over last 7 days
    telemetry_start = datetime.now() - timedelta(days=7)
    for asset in assets_def:
        a_id, a_fac_id, a_name, a_type, a_zone, a_status, inst_date, last_maint, base_oph = asset
        base = SENSOR_BASELINES.get(a_type, SENSOR_BASELINES["AHU"])

        # Determine degradation level
        degrad = 0.0
        if a_status == "WARNING":  degrad = 0.35
        elif a_status == "CRITICAL": degrad = 0.75

        curr_oph = base_oph
        for hr_i in range(168): # 7 days * 24 hours
            ts_dt = telemetry_start + timedelta(hours=hr_i)
            ts_str = ts_dt.strftime("%Y-%m-%dT%H:%M:%S")

            # Simulate operational noise + degradation trend
            run_hr = 1.0 if (6 <= ts_dt.hour <= 22 or a_type in ["CRAC", "Transformer", "Chiller"]) else (0.2 if random.random() < 0.3 else 0.0)
            curr_oph += run_hr

            # Abnormal spike injection for warning/critical assets
            is_abn = 1 if (degrad > 0 and random.random() < (0.15 if degrad > 0.5 else 0.05)) else 0

            temp_val = base["temp"] + (degrad * 14) + (8.0 if is_abn else 0) + random.gauss(0, 1.0)
            vib_val  = base["vib"]  + (degrad * 3.5) + (2.5 if is_abn else 0) + random.gauss(0, 0.15)
            curr_val = (base["current"] * (1 + degrad * 0.25 + (0.3 if is_abn else 0))) * run_hr + random.gauss(0, 0.5)
            volt_val = base["voltage"] + random.gauss(0, 2.5) - (degrad * 6.0)

            risk_val = min(1.0, max(0.05, (degrad * 0.7) + (0.25 if is_abn else 0.0) + (curr_oph / 30000.0)))

            batch_telemetry.append((
                a_id,
                ts_str,
                round(temp_val, 1),
                round(max(0.1, vib_val), 2),
                round(max(0.0, curr_val), 1),
                round(volt_val, 1),
                round(curr_oph, 1),
                round(run_hr, 1),
                is_abn,
                round(risk_val, 2)
            ))

    cur.executemany("""
        INSERT INTO ASSET_MONITORING_DATA
        (asset_id, timestamp, temperature_c, vibration_mm_s, current_amps, voltage_v, operating_hours, runtime_hours, is_abnormal, failure_risk)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, batch_telemetry)
    conn.commit()

    print(f"✅ Inserted {len(batch_telemetry):,} asset sensor telemetry records")

    # ── Seed Energy Alerts ───────────────────────────────────────────────────
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

    # ── Seed Maintenance Alerts ─────────────────────────────────────────────
    maint_alerts = [
        ("CHILLER-001", facility_ids[0], "warning", "vibration",
         "Elevated vibration (4.8 mm/s) and oil temperature in Compressor Bearing B",
         "Vibration 4.8 mm/s exceeding warning threshold 3.5 mm/s",
         "Inspect bearing lubrication and align shaft coupling", "NEW"),
        ("PUMP-002", facility_ids[1], "critical", "thermal",
         "Critical motor overheating (68.4°C) with elevated current draw on Secondary Pump",
         "Motor winding temp 68.4°C exceeding critical limit 60.0°C",
         "Immediate shutdown required. Inspect impeller for blockages and check motor winding", "NEW"),
        ("HVAC-AHU-003", facility_ids[2], "warning", "electrical", "Abnormal current imbalance (22%) detected across 3-phase blower motor",
         "Current imbalance 22% > 10% threshold",
         "Inspect electrical contractor contacts and verify phase supply voltage", "NEW"),
        ("CRAC-002", facility_ids[3], "warning", "thermal",
         "Refrigerant discharge pressure high (54.2°C condensing temp) in Server Room B",
         "Condensing temp 54.2°C > 48.0°C threshold",
         "Clean outdoor condenser coils and check refrigerant charge level", "NEW"),
    ]

    cur.executemany("""
        INSERT INTO MAINTENANCE_ALERTS
        (asset_id, facility_id, severity, alert_type, description, detected_condition, recommended_action, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, maint_alerts)
    conn.commit()
    print(f"✅ Inserted {len(maint_alerts)} maintenance alerts")

    # ── Seed Maintenance Work Orders ────────────────────────────────────────
    work_orders = [
        ("WO-2026-001", "PUMP-002", facility_ids[1],
         "Critical Motor Overheating & Impeller Jamming", "URGENT",
         "Replace motor bearings, clear impeller debris, and verify thermal overload relay.", "OPEN"),
        ("WO-2026-002", "CHILLER-001", facility_ids[0],
         "Compressor Shaft Vibration & Alignment Inspection", "HIGH",
         "Perform laser alignment of compressor shaft and check oil filter differential pressure.", "IN_PROGRESS"),
    ]

    cur.executemany("""
        INSERT INTO MAINTENANCE_WORK_ORDERS
        (work_order_id, asset_id, facility_id, issue, priority, recommended_action, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, work_orders)
    conn.commit()
    print(f"✅ Inserted {len(work_orders)} maintenance work orders")

    conn.close()
    print("\n🎉 Database seeding complete!")

    # ── Export All Tables to CSV in dataset/ ─────────────────────────────────
    export_datasets_to_csv()


def export_datasets_to_csv():
    """Exports all database tables to standalone CSV files in dataset/ for review and ML training."""
    import pandas as pd
    out_dir = Path(__file__).resolve().parent.parent / "dataset"
    out_dir.mkdir(parents=True, exist_ok=True)
    conn = get_connection()

    tables = [
        ("FACILITIES", "facilityops_facilities.csv"),
        ("ENERGY_USAGE", "facilityops_energy_usage.csv"),
        ("ALERTS", "facilityops_alerts.csv"),
        ("ASSETS", "facilityops_assets.csv"),
        ("ASSET_MONITORING_DATA", "facilityops_asset_monitoring_data.csv"),
        ("MAINTENANCE_ALERTS", "facilityops_maintenance_alerts.csv"),
        ("MAINTENANCE_WORK_ORDERS", "facilityops_maintenance_work_orders.csv"),
        ("EQUIPMENT_HEALTH", "facilityops_equipment_health.csv"),
        ("MAINTENANCE_PREDICTIONS", "facilityops_maintenance_predictions.csv"),
    ]

    print("\n📂 Exporting datasets to dataset/ directory:")
    for tbl, fname in tables:
        try:
            df = pd.read_sql_query(f"SELECT * FROM {tbl}", conn)
            target = out_dir / fname
            df.to_csv(target, index=False)
            print(f"   📄 {fname:<42} ({len(df):>4} rows, {target.stat().st_size:>8,} bytes)")
        except Exception as e:
            print(f"   ⚠️ Could not export {tbl}: {e}")

    conn.close()
    print("✅ All agent datasets successfully exported to dataset/\n")


if __name__ == "__main__":
    seed()


