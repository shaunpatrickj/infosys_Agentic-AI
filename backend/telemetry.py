"""
telemetry.py — FacilityOps Live Telemetry Simulator
Generates real-time streaming telemetry values layered on top of DB history.
"""

import math
import random
from datetime import datetime

random.seed()   # fresh seed for live mode


def live_tick(base_electricity: float = 220.0, base_hvac: float = 99.0) -> dict:
    
    now   = datetime.now()
    hour  = now.hour
    dow   = now.weekday()
    is_wk = dow >= 5

    # Load multiplier mirrors seed_data.py
    if is_wk:
        mult = 0.30 if 8 <= hour <= 17 else 0.15
    elif 7 <= hour <= 9:
        mult = 0.70 + 0.05 * (hour - 7)
    elif 10 <= hour <= 17:
        mult = 0.95
    elif 18 <= hour <= 20:
        mult = 0.65
    else:
        mult = 0.20

    def jitter(v, frac=0.05):
        return max(0, v * mult * (1 + random.gauss(0, frac)))

    elec  = jitter(base_electricity)
    hvac  = jitter(base_hvac)
    water = jitter(45)
    light = jitter(62)
    equip = jitter(40)
    other = jitter(20)

    total_kwh = elec + hvac * 0.2 + light + equip + other   # approx daily running total

    cost_per_kwh  = 9.0    # ₹ per kWh (approximate Indian commercial rate)
    carbon_factor = 0.82   # kg CO₂e per kWh (India grid average)

    return {
        "timestamp":         now.isoformat(),
        "electricity_kw":    round(elec, 1),
        "hvac_kw":           round(hvac, 1),
        "water_lph":         round(water, 1),
        "lighting_kw":       round(light, 1),
        "equipment_kw":      round(equip, 1),
        "total_energy_kwh":  round(total_kwh * 24, 0),          # projected daily
        "cost_savings_inr":  round(total_kwh * 24 * 0.08 * cost_per_kwh, 0),  # 8% savings
        "carbon_tco2e":      round(total_kwh * 24 * carbon_factor / 1000, 2),
        "peak_demand_kw":    round(max(elec, hvac + light + equip), 0),
        "efficiency_score":  round(min(100, max(60, 87 + random.gauss(0, 2))), 1),
        "distribution": {
            "hvac":      round(hvac / max(elec, 1) * 100, 1),
            "lighting":  round(light / max(elec, 1) * 100, 1),
            "equipment": round(equip / max(elec, 1) * 100, 1),
            "other":     round(other / max(elec, 1) * 100, 1),
        }
    }
