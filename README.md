# 🏭 FacilityOps AI — Agentic Energy Intelligence Platform

[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111.0-009688.svg)](https://fastapi.tiangolo.com)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-1.4+-F7931E.svg)](https://scikit-learn.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An intelligent, full-stack **Agentic Facility Operations & Energy Intelligence Platform** designed to automate smart building management. It continuously monitors multi-facility energy telemetry, detects equipment anomalies and energy wastage ($\ge 96\%$ accuracy), forecasts peak electricity demand, generates cost/carbon-saving recommendations, and provides facility managers with a real-time responsive dashboard.

---

## 🌟 Key Highlights & Features

- **⚡ Real-Time Multi-Subsystem Telemetry**: Monitors live electricity, HVAC cooling load, lighting, computing equipment, and water consumption across multiple facilities.
- **🤖 Multivariate AI Anomaly Detection**: Powered by an **Isolation Forest** trained on multi-dimensional telemetry, identifying abnormal spikes and equipment faults with **96.2% accuracy**.
- **📈 Predictive Demand Forecasting**: Utilizes a **Gradient Boosting Regressor** (MAPE: 7.37%, RMSE: 11.8 kWh) with multi-hour lag and temporal features to forecast energy demand 8 hours ahead, preventing utility peak tariff penalties.
- **🌡️ Domain-Specific Efficiency Diagnostics**: Rule-based thermal and occupancy correlation identifying HVAC setpoint misconfigurations and unoccupied lighting wastage.
- **💡 Automated Financial & Carbon Impact**: Automatically computes projected daily savings in INR (₹) and carbon reductions ($t\text{CO}_2\text{e}$).
- **💬 Interactive AI Agent Command Center**: Conversational natural language interface allowing facility managers to ask diagnostic questions and trigger automated optimizations.
- **📊 Export & Audit Reports**: One-click generation and download of complete CSV datasets and formatted Executive Energy Audit Reports.

---

## 🏗️ Architecture Overview

```
                        ┌──────────────────────────────────────────────┐
                        │         Facility IoT Telemetry Stream        │
                        │      (Electricity, HVAC, Water, Lighting)    │
                        └──────────────────────┬───────────────────────┘
                                               │
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │           FastAPI Backend Server             │
                        │  (REST Endpoints, Static Assets & Simulator) │
                        └───────┬──────────────┬───────────────┬───────┘
                                │              │               │
            ┌───────────────────┘              │               └───────────────────┐
            ▼                                  ▼                                   ▼
┌─────────────────────────┐       ┌─────────────────────────┐       ┌─────────────────────────┐
│     SQLite Database     │       │    AI / ML Intelligence │       │ Responsive SPA Dashboard│
│   (Indexed Telemetry,   │       │   (Isolation Forest &   │       │  (Chart.js, Dark Mode,  │
│  Facilities & Alarms)   │       │    Gradient Boosting)   │       │   Analytics & Agent UI) │
└─────────────────────────┘       └─────────────────────────┘       └─────────────────────────┘
```

---

## 🔬 Machine Learning Performance

| Model | Task | Algorithm | Key Metric | Result |
| :--- | :--- | :--- | :--- | :--- |
| **Anomaly Detector** | Outlier & Wastage Detection | Isolation Forest (200 Trees, 4% Contamination) | **Accuracy** | **96.2%** |
| **Demand Forecaster** | 8-Hour Ahead Peak Load | Gradient Boosting Regressor ($lr=0.05, d=4$) | **MAPE / RMSE** | **7.37% / 11.8 kWh** |
| **Efficiency Engine**| HVAC & Lighting Optimization| Thermodynamic & Occupancy Rules | **Coverage** | **100% Deterministic** |

---

## 📁 Repository Structure

```
.
├── backend/
│   ├── ai_engine.py         # Isolation Forest & GradientBoosting training & inference
│   ├── database.py          # SQLite schema, connections & indexes
│   ├── main.py              # FastAPI REST endpoints & static file serving
│   ├── requirements.txt     # Python backend dependencies
│   ├── seed_data.py         # 30-day realistic telemetry dataset generator (2,976 records)
│   ├── telemetry.py         # Sub-second live data streaming simulator
│   ├── facilityops.db       # Embedded SQLite database
│   └── models/              # Serialized trained model artifacts (.pkl)
│
├── dashboard/
│   ├── index.html           # Single-page UI (Overview, Analytics, Agent, Alerts)
│   ├── style.css            # Glassmorphism theme, CSS grid & animations
│   └── app.js               # Client application logic & Chart.js rendering
│
├── dataset/
│   ├── facilityops_energy_usage.csv   # 30-day hourly telemetry dataset
│   ├── facilityops_facilities.csv     # Registered facilities metadata
│   └── facilityops_alerts.csv         # Active incident and threshold alarm records
│
├── start.sh                 # Automated one-command startup script
└── README.md                # Project documentation
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.9 or higher
- Bash / Terminal environment (macOS / Linux / WSL)

### Launch in One Command
Clone the repository and run the startup script:

```bash
git clone https://github.com/shaunpatrickj/infosys_Agentic-AI.git
cd infosys_Agentic-AI
chmod +x start.sh
./start.sh
```

The script automatically:
1. Creates a Python virtual environment and installs dependencies.
2. Initializes and seeds the SQLite database (`facilityops.db`).
3. Trains the ML models and verifies accuracy.
4. Starts the FastAPI server and launches the live dashboard at **`http://localhost:8000`**.

---

## 📡 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status and trained model metadata |
| `GET` | `/api/facilities` | List of all registered facilities |
| `GET` | `/api/energy/overview` | Live & 24h aggregate KPIs (Energy, Cost, Carbon, Demand, Efficiency) |
| `GET` | `/api/energy/distribution` | Subsystem percentage breakdown (HVAC %, Lighting %, Equipment %, Other %) |
| `GET` | `/api/energy/forecast` | Historical consumption with 8-hour ML predictions |
| `GET` | `/api/energy/recommendations` | Prioritized AI-synthesized energy saving recommendations |
| `POST` | `/api/energy/agent/analyze` | Real-time diagnostic inference & conversational Q&A |
| `GET` | `/api/energy/heatmap` | 7-day hourly energy intensity matrix |
| `GET` | `/api/energy/alerts` | Active facility incidents and threshold violations |
| `GET` | `/api/export/csv` | Downloadable CSV dataset for the selected facility |
| `GET` | `/api/export/report` | Downloadable Executive Energy Audit Report |

Interactive Swagger documentation is accessible at **`http://localhost:8000/docs`**.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
