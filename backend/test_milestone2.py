"""
test_milestone2.py — Comprehensive Test Suite for Milestone 2: Predictive Maintenance System
Tests:
1. Database Schema and seeded data for Assets and Maintenance
2. MaintenanceAgent unit tests (health score, explainability, anomalies, predictions, Q&A)
3. Alert generation and deduplication
4. Work order lifecycle
5. API endpoints via FastAPI app invocation
6. Non-regression of Milestone 1 Energy Intelligence endpoints
"""

import sys
import os
import asyncio
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from database import get_connection
from maintenance_agent import get_maintenance_agent, ASSET_THRESHOLDS
from main import (
    app,
    maintenance_overview,
    list_assets,
    asset_detail,
    asset_health,
    maintenance_agent_analyze,
    maintenance_predictions,
    maintenance_alerts,
    acknowledge_maintenance_alert,
    resolve_maintenance_alert,
    list_work_orders,
    create_work_order,
    update_work_order,
    MaintenanceAnalyzeRequest,
    WorkOrderCreateRequest,
    WorkOrderUpdateRequest,
    energy_overview,
    energy_distribution,
    energy_forecast,
    energy_alerts
)

passed_tests = 0
failed_tests = 0

def check(name, condition, msg=""):
    global passed_tests, failed_tests
    if condition:
        print(f"  ✅ PASS: {name}")
        passed_tests += 1
    else:
        print(f"  ❌ FAIL: {name} - {msg}")
        failed_tests += 1

def run_db_tests():
    print("\n--- 1. Database Schema & Data Integrity Tests ---")
    conn = get_connection()
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    
    for t in ["ASSETS", "ASSET_MONITORING_DATA", "EQUIPMENT_HEALTH", "MAINTENANCE_PREDICTIONS", "MAINTENANCE_ALERTS", "MAINTENANCE_WORK_ORDERS"]:
        check(f"Table {t} exists", t in tables)
        
    asset_count = conn.execute("SELECT COUNT(*) n FROM ASSETS").fetchone()["n"]
    check("Asset records exist (>= 10)", asset_count >= 10, f"Found {asset_count}")
    
    telemetry_count = conn.execute("SELECT COUNT(*) n FROM ASSET_MONITORING_DATA").fetchone()["n"]
    check("Asset monitoring telemetry points exist (>= 1000)", telemetry_count >= 1000, f"Found {telemetry_count}")
    
    alert_count = conn.execute("SELECT COUNT(*) n FROM MAINTENANCE_ALERTS").fetchone()["n"]
    check("Initial maintenance alerts seeded (>= 2)", alert_count >= 2, f"Found {alert_count}")
    
    wo_count = conn.execute("SELECT COUNT(*) n FROM MAINTENANCE_WORK_ORDERS").fetchone()["n"]
    check("Initial maintenance work orders seeded (>= 1)", wo_count >= 1, f"Found {wo_count}")
    
    conn.close()

def run_agent_unit_tests():
    print("\n--- 2. MaintenanceAgent Core Logic Tests ---")
    agent = get_maintenance_agent()
    
    # 2.1 Health Evaluation on Normal Asset
    h_ahu = agent.evaluate_asset_health("HVAC-AHU-001")
    check("HVAC-AHU-001 evaluated", h_ahu["asset_id"] == "HVAC-AHU-001")
    check("HVAC-AHU-001 health score in range [70, 100]", 70 <= h_ahu["health_score"] <= 100, f"Got {h_ahu['health_score']}")
    check("HVAC-AHU-001 has contributing factors", len(h_ahu["contributing_factors"]) > 0)
    check("HVAC-AHU-001 has recommended action", len(h_ahu["recommended_action"]) > 0)
    
    # 2.2 Health Evaluation on Critical Asset (PUMP-002)
    h_pump = agent.evaluate_asset_health("PUMP-002")
    check("PUMP-002 evaluated as CRITICAL status", h_pump["health_status"] == "CRITICAL", f"Got {h_pump['health_status']}")
    check("PUMP-002 health score <= 50", h_pump["health_score"] <= 50, f"Got {h_pump['health_score']}")
    check("PUMP-002 flagged anomaly_detected == True", h_pump["anomaly_detected"] is True)
    check("PUMP-002 flagged maintenance_required == True", h_pump["maintenance_required"] is True)
    
    # 2.3 Abnormal Behavior Detection
    anom = agent.detect_abnormal_behavior("PUMP-002")
    check("PUMP-002 abnormal behavior detected", anom["latest_is_abnormal"] is True)
    check("PUMP-002 abnormal reasons explainable", any("Vibration" in r or "Thermal" in r for r in anom["reasons"]))
    
    # 2.4 Maintenance Prediction
    pred = agent.predict_maintenance("PUMP-002")
    check("PUMP-002 prediction priority is URGENT", pred["priority"] == "URGENT", f"Got {pred['priority']}")
    check("PUMP-002 prediction confidence > 0.8", pred["confidence"] > 0.8, f"Got {pred['confidence']}")
    
    # 2.5 Alert Deduplication
    init_alert = agent.trigger_maintenance_alert(
        "CHILLER-001", 1, 45.0, "CRITICAL",
        ["High thermal load", "Vibration spike"],
        "Emergency inspection required",
        {"temperature_c": 55.0, "vibration_mm_s": 4.2}
    )
    # Re-triggering duplicate should be suppressed
    dup_alert = agent.trigger_maintenance_alert(
        "CHILLER-001", 1, 45.0, "CRITICAL",
        ["High thermal load", "Vibration spike"],
        "Emergency inspection required",
        {"temperature_c": 55.0, "vibration_mm_s": 4.2}
    )
    check("Duplicate alert suppressed by deduplication", dup_alert is None)
    
    # 2.6 Work Order Creation
    wo = agent.create_work_order("HVAC-AHU-001", "Routine filter change and alignment", "LOW", "Replace pre-filters")
    check("Work order created with ID", wo["work_order_id"].startswith("WO-"))
    check("Work order status is OPEN", wo["status"] == "OPEN")

    # 2.7 Natural Language Maintenance Q&A
    qa_breakdown = agent.answer_maintenance_query("Which equipment is in critical condition?", 1)
    check("Q&A breakdown query answers with details", len(qa_breakdown["answer"]) > 10)
    
    qa_vibration = agent.answer_maintenance_query("Are there vibration anomalies?", 1)
    check("Q&A vibration query contains vibration context", "vibration" in qa_vibration["answer"].lower())
    
    qa_summary = agent.answer_maintenance_query("Give me a facility overview summary", 1)
    check("Q&A summary returns asset counts", qa_summary["total_assets"] >= 5)

async def run_api_tests():
    print("\n--- 3. API Endpoints Async Invocation Tests ---")
    
    # Overview
    ov = await maintenance_overview(1)
    check("API /api/maintenance/overview returns facility_id 1", ov["facility_id"] == 1)
    check("API /api/maintenance/overview has total_assets", ov["total_assets"] >= 5)
    check("API /api/maintenance/overview has avg_health_score", 0 <= ov["avg_health_score"] <= 100)
    
    # Assets list
    assets_res = await list_assets(1)
    check("API /api/assets returns asset array", len(assets_res["assets"]) >= 5)
    
    # Asset detail
    detail = await asset_detail("PUMP-002")
    check("API /api/assets/{id} returns asset dictionary", detail["asset"]["asset_id"] == "PUMP-002")
    check("API /api/assets/{id} includes telemetry history", len(detail["telemetry"]) > 0)
    check("API /api/assets/{id} includes health history", len(detail["health_history"]) > 0)
    
    # Asset health endpoint
    health_ep = await asset_health("HVAC-AHU-001")
    check("API /api/assets/{id}/health evaluates correctly", health_ep["asset_id"] == "HVAC-AHU-001")
    
    # Agent Q&A analyze endpoint
    agent_qa = await maintenance_agent_analyze(MaintenanceAnalyzeRequest(facility_id=1, question="List open work orders"))
    check("API /api/maintenance/agent/analyze (Q&A mode)", agent_qa["mode"] == "qa")
    
    # Agent asset analyze endpoint
    agent_single = await maintenance_agent_analyze(MaintenanceAnalyzeRequest(facility_id=1, asset_id="CHILLER-001"))
    check("API /api/maintenance/agent/analyze (Single Asset mode)", agent_single["mode"] == "asset_analysis")
    
    # Predictions endpoint
    preds = await maintenance_predictions(1)
    check("API /api/maintenance/predictions returns array", len(preds["predictions"]) >= 5)
    
    # Alerts endpoint
    alerts_data = await maintenance_alerts(1)
    check("API /api/maintenance/alerts returns alerts", len(alerts_data["alerts"]) > 0)
    
    # Acknowledge alert
    first_alert_id = alerts_data["alerts"][0]["alert_id"]
    ack_res = await acknowledge_maintenance_alert(first_alert_id)
    check("API /api/maintenance/alerts/{id}/acknowledge works", ack_res["status"] == "ACKNOWLEDGED")
    
    # Work Orders endpoint
    wos = await list_work_orders(1)
    check("API /api/maintenance/work-orders returns list", len(wos["work_orders"]) > 0)
    
    # Create Work Order
    new_wo = await create_work_order(WorkOrderCreateRequest(
        asset_id="XFRM-001",
        issue="Transformer oil temperature check",
        priority="HIGH",
        recommended_action="Inspect cooling fins and sample dielectric oil"
    ))
    check("API POST /api/maintenance/work-orders creates order", new_wo["work_order_id"].startswith("WO-"))
    
    # Update Work Order
    up_wo = await update_work_order(new_wo["work_order_id"], WorkOrderUpdateRequest(status="IN_PROGRESS"))
    check("API PATCH /api/maintenance/work-orders/{id} updates status", up_wo["status"] == "IN_PROGRESS")

async def run_milestone1_regression_tests():
    print("\n--- 4. Milestone 1 Non-Regression Verification Tests ---")
    
    # M1 Energy Overview
    e_ov = await energy_overview(1)
    check("M1 energy_overview works without error", "total_energy_kwh" in e_ov)
    check("M1 energy_overview has efficiency_score", "efficiency_score" in e_ov)
    
    # M1 Energy Distribution
    e_dist = await energy_distribution(1)
    check("M1 energy_distribution returns subsystems", "subsystems" in e_dist and len(e_dist["subsystems"]) > 0)
    
    # M1 Energy Forecast
    e_fc = await energy_forecast(1)
    check("M1 energy_forecast returns historical and forecast", "historical" in e_fc and "forecast_series" in e_fc)
    
    # M1 Energy Alerts
    e_al = await energy_alerts(1)
    check("M1 energy_alerts returns energy alerts", "alerts" in e_al)

async def main():
    print("================================================================")
    print("  FACILITYOPS AI PLATFORM — MILESTONE 2 VERIFICATION SUITE       ")
    print("================================================================")
    
    run_db_tests()
    run_agent_unit_tests()
    await run_api_tests()
    await run_milestone1_regression_tests()
    
    print("\n================================================================")
    print(f"  TOTAL TESTS: {passed_tests + failed_tests} | PASSED: {passed_tests} | FAILED: {failed_tests}")
    print("================================================================")
    
    if failed_tests > 0:
        sys.exit(1)
    else:
        print("  🎉 ALL MILESTONE 2 TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(main())
