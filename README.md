# 🏭 FacilityOps AI — Agentic Energy Intelligence & Predictive Maintenance Platform

[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111.0-009688.svg)](https://fastapi.tiangolo.com)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-1.4+-F7931E.svg)](https://scikit-learn.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests Passing](https://img.shields.io/badge/tests-49%2F49%20passed-brightgreen.svg)](backend/test_milestone2.py)

An autonomous, full-stack **Agentic Facility Operations Platform** automating modern smart building management. It operates across two unified milestones:

1. **⚡ Milestone 1: Energy Intelligence System** — Continuous multi-facility telemetry monitoring, multivariate anomaly & energy wastage detection ($\ge 96.2\%$ accuracy), peak electricity demand forecasting, automated cost/carbon ROI estimates, and live streaming metrics.
2. **🔧 Milestone 2: Predictive Maintenance System** — Condition monitoring across 13 industrial assets, transparent 0–100 equipment health scoring with explainability factors, vibration/thermal threshold breach detection, maintenance risk predictions, automated alert deduplication, interactive work order state machines, and a multi-agent command center with sensor telemetry inspection.

---

## 🌟 Key Capabilities & Features

### ⚡ Milestone 1 — Energy Intelligence
- **Real-Time Multi-Subsystem Telemetry**: Monitors electricity, HVAC cooling loads, lighting circuits, computing equipment, and water consumption across multiple facilities.
- **Multivariate AI Anomaly Detection**: Powered by an **Isolation Forest** trained on multi-dimensional telemetry, identifying abnormal spikes and energy waste with **96.2% accuracy**.
- **Predictive Demand Forecasting**: Utilizes a **Gradient Boosting Regressor** (MAPE: 7.37%, RMSE: 11.8 kWh) with temporal lag features to forecast demand 8 hours ahead, preventing utility peak tariff penalties.
- **Automated Financial & Carbon Impact**: Real-time projection of daily cost savings in INR (₹ at ₹9/kWh) and carbon reductions ($t\text{CO}_2\text{e}$ at $0.82\text{ kg CO}_2\text{e}/\text{kWh}$).

### 🔧 Milestone 2 — Predictive Maintenance
- **Multi-Asset Condition Monitoring**: Tracks 13 critical industrial assets across 4 facilities (AHUs, Chillers, Pumps, Transformers, Elevators, Generators) with 2,184 condition monitoring sensor readings (temperature, vibration, current, voltage, operating hours).
- **Explainable Health Scoring (0–100)**: Multi-factor degradation deduction engine providing plain-language contributing factors (e.g., *"Abnormal vibration (4.07 mm/s vs max 2.8 mm/s)"*, *"Overcurrent draw (165A vs rated 150A)"*).
- **Abnormal Behavior & Failure Risk Prediction**: Classifies equipment into `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL` risk tiers with urgency priority (`NORMAL`, `MONITOR`, `RECOMMENDED`, `URGENT`).
- **Intelligent Alert Deduplication**: Automatically suppresses duplicate active alerts for identical unresolved conditions to eliminate alarm fatigue.
- **Work Order Lifecycle Management**: Built-in state machine allowing facility engineers to create, track, and advance work orders (`OPEN` ➔ `IN_PROGRESS` ➔ `COMPLETED`).
- **Interactive Asset Detail Modal**: Clicking any asset opens a modal with live sensor telemetry tiles (Temperature, Vibration, Current, Voltage) and historical records.
- **Multi-Agent Command Center with Sidebar**: Dedicated sidebar in the AI Agent view enabling seamless switching between the **Energy Agent** and **Maintenance Agent**, with conversational diagnostic Q&A for both domains.

---

## 🏗️ System Architecture

```
                               ┌────────────────────────────────┐
                               │   FacilityOps AI Supervisor    │
                               └───────────────┬────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
         ┌───────────────────────────┐                   ┌───────────────────────────┐
         │     ⚡ Energy Agent       │                   │   🔧 Maintenance Agent    │
         │       (Milestone 1)       │                   │       (Milestone 2)       │
         ├───────────────────────────┤                   ├───────────────────────────┤
         │ • Anomaly Detection (IF)  │                   │ • Condition Monitoring    │
         │ • Demand Forecasting (GB) │                   │ • Health Scoring (0–100)  │
         │ • Subsystem Efficiency    │                   │ • Threshold Breaches      │
         │ • Cost/Carbon Savings ROI │                   │ • Alert Deduplication     │
         │ • Conversational Q&A      │                   │ • Work Order State Machine│
         └─────────────┬─────────────┘                   └─────────────┬─────────────┘
                       │                                               │
                       └───────────────────────┬───────────────────────┘
                                               │
                                               ▼
                               ┌────────────────────────────────┐
                               │     FastAPI Backend Server     │
                               │      (19 REST Endpoints)       │
                               └───────────────┬────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
         ┌───────────────────────────┐                   ┌───────────────────────────┐
         │      SQLite Database      │                   │ Responsive SPA Dashboard  │
         │       (10 Tables)         │                   │ (Chart.js, Dark Mode,     │
         │  facilityops.db (WAL)     │                   │  Agent Sidebar, Modals)   │
         └───────────────────────────┘                   └───────────────────────────┘
```

---

## 🔬 Machine Learning Performance

| Model | Task | Algorithm | Key Metric | Result |
| :--- | :--- | :--- | :--- | :--- |
| **Anomaly Detector** | Outlier & Energy Wastage | Isolation Forest (200 Trees, 4% Contamination) | **Accuracy** | **96.2%** |
| **Demand Forecaster** | 8-Hour Ahead Peak Load | Gradient Boosting Regressor ($lr=0.05, d=4$) | **MAPE / RMSE** | **7.37% / 11.8 kWh** |
| **Health Scoring Engine**| Condition & Wear Scoring | Multi-Factor Degradation Formulation | **Explainability** | **100% Deterministic** |
| **Risk Predictor** | Failure Risk Classification | Threshold & Wear Multi-Variate Logic | **Confidence** | **85% – 95%** |

---

## 📁 Repository Structure

```
.
├── backend/
│   ├── ai_engine.py                   # Isolation Forest & GradientBoosting training & inference
│   ├── database.py                    # SQLite schema (10 tables), connection pooling & indexes
│   ├── maintenance_agent.py           # Core Maintenance Agent: health scoring, predictions & Q&A
│   ├── main.py                        # FastAPI REST API (19 endpoints) & static file serving
│   ├── seed_data.py                   # Data generator (2,976 energy + 2,184 sensor telemetry records)
│   ├── telemetry.py                   # Sub-second live telemetry streaming simulator
│   ├── test_milestone2.py             # 49-test comprehensive test & non-regression suite
│   ├── requirements.txt               # Backend Python dependencies
│   ├── facilityops.db                 # Embedded SQLite database (WAL mode)
│   └── models/                        # Serialized trained model artifacts (.pkl)
│
├── dashboard/
│   ├── index.html                     # Multi-view UI (Overview, Analytics, Maintenance, Agent, Alerts)
│   ├── style.css                      # Glassmorphism theme, Agent sidebar, compact charts
│   └── app.js                         # Dynamic dashboard client, Chart.js integrations & API polling
│
├── dataset/
│   ├── facilityops_facilities.csv     # Registered facilities metadata
│   ├── facilityops_energy_usage.csv   # 30-day hourly energy telemetry dataset
│   ├── facilityops_alerts.csv         # Active energy threshold incidents
│   ├── facilityops_assets.csv         # 13 monitored assets across all facilities
│   ├── facilityops_asset_monitoring_data.csv # 2,184 condition monitoring sensor readings
│   ├── facilityops_equipment_health.csv      # Historical health scoring and factor explainability
│   ├── facilityops_maintenance_alerts.csv    # Deduplicated maintenance alert events
│   ├── facilityops_maintenance_predictions.csv # Asset failure risk predictions & priority levels
│   └── facilityops_maintenance_work_orders.csv # Maintenance work order lifecycle records
│
├── agent.md                           # Quickstart cheatsheet & troubleshooting guide
├── start.sh                           # One-command automated startup script
└── README.md                          # Project documentation (this file)
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.9 or higher
- Bash / Terminal environment (macOS / Linux / WSL)

### Launch in One Command
Clone the repository and run the automated startup script:

```bash
git clone https://github.com/shaunpatrickj/infosys_Agentic-AI.git
cd infosys_Agentic-AI
chmod +x start.sh
./start.sh
```

The script automatically:
1. Creates a Python virtual environment (`backend/.venv`) and installs dependencies.
2. Initializes and seeds the SQLite database (`facilityops.db`).
3. Exports all 9 database tables to CSV files in `dataset/`.
4. Trains the ML models (**Isolation Forest** & **Gradient Boosting**) and verifies accuracy.
5. Starts the FastAPI server and launches the live dashboard at **`http://localhost:8000`**.

---

## 🧪 Automated Testing & Verification

Run the comprehensive test suite covering both Milestone 1 and Milestone 2:

```bash
cd backend
source .venv/bin/activate
python test_milestone2.py
```

### Test Results:
```
================================================================
  FACILITYOPS AI PLATFORM — MILESTONE 2 VERIFICATION SUITE       
================================================================
--- 1. Database Schema & Data Integrity Tests (10/10 PASS)
--- 2. MaintenanceAgent Core Logic Tests (14/14 PASS)
--- 3. API Endpoints Async Invocation Tests (16/16 PASS)
--- 4. Milestone 1 Non-Regression Verification Tests (5/5 PASS)
================================================================
  TOTAL TESTS: 49 | PASSED: 49 | FAILED: 0
  🎉 ALL MILESTONE 2 TESTS PASSED PERFECTLY!
================================================================
```

---

## 📡 API Reference

Interactive Swagger documentation is available at **`http://localhost:8000/docs`**.

### Milestone 1 — Energy Intelligence
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status and trained model metadata |
| `GET` | `/api/facilities` | List of all registered facilities |
| `GET` | `/api/energy/overview` | Live & 24h aggregate KPIs (Energy, Cost, Carbon, Demand, Efficiency) |
| `GET` | `/api/energy/distribution` | Subsystem percentage breakdown (HVAC, Lighting, Equipment, Other) |
| `GET` | `/api/energy/forecast` | Historical consumption with 8-hour ML predictions |
| `GET` | `/api/energy/recommendations` | Prioritized AI-synthesized energy saving recommendations |
| `POST` | `/api/energy/agent/analyze` | Real-time diagnostic inference & conversational Q&A |
| `GET` | `/api/energy/heatmap` | 7-day hourly energy intensity matrix |
| `GET` | `/api/energy/alerts` | Active facility energy alerts |

### Milestone 2 — Predictive Maintenance
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/maintenance/overview` | High-level KPIs: total assets, health status counts, alerts, work orders |
| `GET` | `/api/assets` | Monitored equipment register with latest health scores |
| `GET` | `/api/assets/{id}` | Asset detail with 48h telemetry history, health history, alerts & work orders |
| `GET` | `/api/assets/{id}/health` | Triggers condition scoring & explainability evaluation |
| `POST` | `/api/maintenance/agent/analyze` | Invokes Maintenance Agent (single asset, NL Q&A, or full audit) |
| `GET` | `/api/maintenance/predictions` | Asset maintenance predictions and priority levels |
| `GET` | `/api/maintenance/alerts` | Active condition alerts sorted by severity |
| `POST` | `/api/maintenance/alerts/{id}/acknowledge` | Acknowledges an active maintenance alert |
| `POST` | `/api/maintenance/alerts/{id}/resolve` | Resolves an active maintenance alert |
| `GET` | `/api/maintenance/work-orders` | Active work orders list sorted by priority |
| `POST` | `/api/maintenance/work-orders` | Creates a new maintenance work order |
| `PATCH`| `/api/maintenance/work-orders/{id}` | Updates work order status (`OPEN` ➔ `IN_PROGRESS` ➔ `COMPLETED`) |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
