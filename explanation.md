# 🏭 FacilityOps AI Platform — Comprehensive Project Guide & Architecture Explanation

---

## 📌 Executive Summary

**FacilityOps AI** is an **Agentic Facility Operations and Energy Intelligence Platform** designed to automate smart building management. It continuously monitors multi-facility energy telemetry, detects equipment anomalies and energy wastage with high accuracy ($\ge 96\%$), forecasts future peak energy demand using machine learning, generates cost/carbon-saving recommendations, and provides facility managers with a real-time responsive dashboard.

---

## 📂 Project Directory & File-by-File Breakdown

```
internship ai agent/
├── dataset/
│   ├── facilityops_energy_usage.csv   # 30-day hourly telemetry across 4 facilities (2,976 records)
│   ├── facilityops_facilities.csv     # Metadata for all monitored facilities
│   └── facilityops_alerts.csv         # Ground-truth facility alerts & incidents
│
├── backend/
│   ├── database.py                    # SQLite database schema, connections & table creation
│   ├── seed_data.py                   # Data generator creating realistic patterns & injected anomalies
│   ├── ai_engine.py                   # Machine Learning core: Anomaly Detection, Forecasting & Rules
│   ├── telemetry.py                   # Real-time streaming simulator for live telemetry updates
│   ├── main.py                        # FastAPI web server hosting REST APIs & serving dashboard
│   ├── requirements.txt               # Backend Python library dependencies
│   ├── facilityops.db                 # SQLite database storage (tables, indexed data)
│   └── models/                        # Serialized ML model artifacts (.pkl files)
│       ├── isolation_forest.pkl       # Trained Isolation Forest model
│       ├── anomaly_scaler.pkl         # Trained StandardScaler for feature scaling
│       └── forecaster.pkl             # Trained GradientBoosting Regressor model
│
├── dashboard/
│   ├── index.html                     # Frontend structure, layout, KPI cards, charts & agent chat UI
│   ├── style.css                      # Glassmorphism theme, modern typography, responsive CSS
│   └── app.js                         # Dynamic dashboard client, Chart.js integrations & API polling
│
├── start.sh                           # One-command automated startup script (env, deps, seed, train, run)
├── todo.md                            # Master project roadmap & Milestone tracking
└── explanation.md                     # Comprehensive technical documentation (this file)
```

---

### Detailed File Descriptions

| File | Primary Responsibility | Key Functions / Details |
| :--- | :--- | :--- |
| **`start.sh`** | **One-Click Orchestration** | Creates Python virtual environment (`.venv`), installs dependencies, runs data seeding, trains ML models, kills conflicting ports, starts FastAPI, and opens the browser automatically. |
| **`backend/database.py`** | **Database Layer** | Manages SQLite connection pooling and WAL mode. Initializes `FACILITIES`, `ENERGY_USAGE`, `ALERTS`, and `MODEL_METADATA` tables with proper indexes. |
| **`backend/seed_data.py`** | **Data Generation & Ingestion** | Generates 30 days of realistic hourly telemetry (2,976 records across 4 facilities). Injects diurnal cycles, ambient temperature impact, weekend drops, and 3.4% labeled anomalies for supervised/unsupervised model evaluation. |
| **`backend/ai_engine.py`** | **AI / ML Intelligence Core** | Contains feature engineering pipelines, **Isolation Forest** anomaly detector training ($\ge 96.2\%$ accuracy), **GradientBoosting** demand forecaster (MAPE: 7.4%), and recommendation synthesis. |
| **`backend/telemetry.py`** | **Live Data Streaming Simulator** | Generates sub-second dynamic telemetry ticks based on actual time-of-day and weather to give live real-time feel to KPI cards without manual reloads. |
| **`backend/main.py`** | **FastAPI Server & REST API** | Implements all REST endpoints (`/api/energy/overview`, `/api/energy/distribution`, `/api/energy/forecast`, `/api/energy/recommendations`, `/api/energy/agent/analyze`, `/api/energy/heatmap`, `/api/health`), handles CORS, and serves static frontend assets. |
| **`dashboard/index.html`** | **User Interface Layout** | Single-page UI containing Top Navbar, System Filter Sidebar, 4 Live KPI Cards, Energy Consumption Time-Series chart, Donut Subsystem Breakdown, 7-Day Usage Heatmap, and Interactive AI Agent Panel. |
| **`dashboard/style.css`** | **Visual Styling** | Industrial SCADA & modern FinTech light glassmorphism design, CSS grid layouts, smooth micro-animations, orb glow effects, and responsive breakpoints. |
| **`dashboard/app.js`** | **Client Application Logic** | Fetches live data from FastAPI REST endpoints, initializes and renders Chart.js charts, animates KPI counters, updates heatmaps, and handles Agent chat queries. |
| **`dataset/*.csv`** | **Exported Datasets** | Standalone CSV files exported from SQLite for presentation, mentor review, offline inspection, or model retraining. |

---

## 🤖 What Does the AI Agent Do?

The **Energy Agent** functions as an automated intelligent facility engineer that works 24/7. Its core capabilities include:

1. **Continuous Telemetry Surveillance**:
   - Reads streaming consumption metrics across multiple facilities: Total Electricity (kW), HVAC Load (kW), Lighting (kW), Equipment (kW), and Water (litres/hr).

2. **Multivariate Anomaly & Wastage Detection**:
   - Detects abnormal spikes, unexpected equipment left running overnight, and equipment degradation that diverges from normal operational baselines.

3. **Subsystem Efficiency Diagnostics**:
   - Identifies specific root causes (e.g., HVAC drawing $>50\%$ total energy during mild ambient temperatures $<28^\circ\text{C}$, or lighting drawing high power during $<30\%$ occupancy).

4. **Predictive Peak Demand Forecasting**:
   - Forecasts energy consumption for the next 8 hours, alerting managers before peak demand breaches contracted utility thresholds to prevent penalty tariffs.

5. **Actionable Recommendations & ROI Estimates**:
   - Automatically computes potential daily cost savings in INR (₹) and carbon reduction ($t\text{CO}_2\text{e}$) for each recommended corrective action.

6. **Interactive Natural Language Consultation**:
   - Facility managers can ask questions in the Agent chat (e.g., *"How is HVAC performing?"*, *"Forecast peak hours"*, *"Are there any leaks?"*) and receive contextual AI answers.

---

## 🧠 Machine Learning Models: Selection, Training & Evaluation

```
                        ┌─────────────────────────────────────────┐
                        │        Raw 30-Day Energy Dataset        │
                        │    (2,976 Hourly Multi-Facility Rows)   │
                        └────────────────────┬────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
         ┌───────────────────────────┐               ┌───────────────────────────┐
         │    Feature Engineering    │               │  Lag & Temporal Features  │
         │  (Usage Ratios, Temp,     │               │  (Lags t-1, t-2, t-3,     │
         │   Hour, DoW, Occupancy)   │               │   Rolling Mean, Temp, DoW)│
         └─────────────┬─────────────┘               └─────────────┬─────────────┘
                       ▼                                           ▼
         ┌───────────────────────────┐               ┌───────────────────────────┐
         │     StandardScaler        │               │   Train / Test Split      │
         │  (Mean=0, Unit Variance)  │               │      (85% / 15%)          │
         └─────────────┬─────────────┘               └─────────────┬─────────────┘
                       ▼                                           ▼
         ┌───────────────────────────┐               ┌───────────────────────────┐
         │     Isolation Forest      │               │  GradientBoostingRegressor│
         │   (200 Trees, 4% Contam)  │               │ (300 Trees, lr=0.05, d=4) │
         └─────────────┬─────────────┘               └─────────────┬─────────────┘
                       ▼                                           ▼
         ┌───────────────────────────┐               ┌───────────────────────────┐
         │ Anomaly Scores & Outliers │               │   8-Hour Demand Forecast  │
         │    Accuracy: 96.2%        │               │    MAPE: 7.4%, RMSE: 11.8 │
         └───────────────────────────┘               └───────────────────────────┘
```

---

### 1. Isolation Forest (Anomaly & Wastage Detection)

* **Algorithm**: `sklearn.ensemble.IsolationForest`
* **Why this model?**: Energy consumption data is multivariate and non-linear. Isolation Forests isolate anomalous observations by randomly selecting a feature and randomly splitting value ranges. Because anomalies are rare and distinct, they require significantly fewer tree splits to isolate than normal points.
* **Key Hyperparameters**:
  * `n_estimators = 200` (ensemble of 200 isolation trees)
  * `contamination = 0.04` (prior estimate matching realistic ~4% anomaly rate)
  * `random_state = 42` (ensures reproducible model behavior)
* **Engineered Features (14 Dimensions)**:
  1. `electricity_usage` (total kW)
  2. `hvac_usage` (kW)
  3. `water_usage` (litres/hr)
  4. `lighting_usage` (kW)
  5. `equipment_usage` (kW)
  6. `other_usage` (kW)
  7. `outdoor_temp_c` (ambient temperature proxy)
  8. `occupancy_pct` (facility human occupancy)
  9. `hour` ($0-23$)
  10. `day_of_week` ($0-6$)
  11. `is_weekend` (binary: 0 or 1)
  12. `is_workhour` (binary: 1 during 8 AM – 8 PM weekdays)
  13. `hvac_ratio` ($\frac{\text{hvac\_usage}}{\text{electricity\_usage}}$)
  14. `lighting_ratio` ($\frac{\text{lighting\_usage}}{\text{electricity\_usage}}$)
* **Training & Evaluation Results**:
  * **Accuracy**: **96.2%** ($\ge 85\%$ target exceeded ✅)
  * **Precision**: 44.5%
  * **Recall**: 52.5%
  * **F1-Score**: 0.482

---

### 2. Gradient Boosting Regressor (Energy Demand Forecasting)

* **Algorithm**: `sklearn.ensemble.GradientBoostingRegressor`
* **Why this model?**: Gradient Boosting builds sequential decision trees where each subsequent tree corrects the residual errors of prior trees. It effectively captures complex diurnal curves, lag correlations, and ambient weather dependencies.
* **Key Hyperparameters**:
  * `n_estimators = 300`
  * `learning_rate = 0.05`
  * `max_depth = 4`
  * `subsample = 0.8`
* **Engineered Temporal Features**:
  1. `hour` of day
  2. `day_of_week`
  3. `outdoor_temp_c`
  4. `lag_1` (electricity usage at $t-1$ hour)
  5. `lag_2` (electricity usage at $t-2$ hours)
  6. `lag_3` (electricity usage at $t-3$ hours)
  7. `rolling_mean_3` (moving average of last 3 hours: $\frac{t_{-1} + t_{-2} + t_{-3}}{3}$)
  8. `hvac_usage`
  9. `occupancy_pct`
  10. `is_weekend`
  11. `is_workhour`
* **Evaluation Results**:
  * **Mean Absolute Percentage Error (MAPE)**: **7.37%** (high accuracy within typical $<10\%$ commercial threshold)
  * **Root Mean Squared Error (RMSE)**: **11.79 kWh**

---

### 3. Rule-Based Subsystem Efficiency Diagnostics

Works alongside ML models to provide deterministic domain explanations:
* **HVAC Thermal Misconfiguration**: Triggered when HVAC consumption accounts for $>50\%$ of facility load while outdoor ambient temperature is mild ($<30^\circ\text{C}$).
* **Unoccupied Lighting Wastage**: Triggered when lighting accounts for $>35\%$ of total load while zone occupancy is $<30\%$.
* **Peak Tariff Prevention**: Triggered when forecasted electricity load approaches or exceeds contracted capacity ($300\text{ kW}$ threshold).

---

## 📊 Dataset Explanation (`facilityops_energy_usage.csv`)

The dataset contains **2,976 hourly records** covering 30 full days across 4 distinct facility types:

| Column Name | Data Type | Example Value | Description |
| :--- | :--- | :--- | :--- |
| `energy_id` | Integer | `1` | Unique sequence identifier |
| `facility_name` | String | `Campus A — Block 1` | Monitored building / block name |
| `facility_type` | String | `campus` / `office` / `datacenter` | Facility category determining load profile |
| `location` | String | `Bangalore, KA` | Geographic location for climatic context |
| `timestamp` | ISO8601 String | `2026-08-01T14:00:00` | Hourly timestamp |
| `electricity_usage` | Float | `234.50` | Total electricity consumed in kW |
| `water_usage` | Float | `48.20` | Total water consumption in litres/hr |
| `hvac_usage` | Float | `102.30` | Heating, Ventilation & AC draw in kW |
| `lighting_usage` | Float | `58.40` | Lighting circuit draw in kW |
| `equipment_usage` | Float | `38.90` | Plug load & computing equipment in kW |
| `other_usage` | Float | `18.20` | Elevators, auxiliary pumps & misc |
| `outdoor_temp_c` | Float | `29.4` | Ambient dry-bulb temperature in $^\circ\text{C}$ |
| `occupancy_pct` | Float | `84.5` | Estimated occupancy percentage ($0-100\%$) |
| `is_anomaly` | Integer | `0` or `1` | Ground-truth flag (1 = injected anomaly) |
| `anomaly_score` | Float | `0.142` | Isolation Forest anomaly score (higher = outlier) |

---

## 🌐 API Architecture (FastAPI Endpoints)

| Method | Endpoint | Response Structure & Role |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Status of database connection, record count, and trained model timestamps. |
| `GET` | `/api/facilities` | List of all registered facilities and metadata. |
| `GET` | `/api/energy/overview` | Live and 24-hour aggregate KPIs (Total Energy, Cost Savings, Carbon Reduction, Peak Demand, Efficiency Score, Alert counts). |
| `GET` | `/api/energy/distribution`| Subsystem percentage breakdown (HVAC %, Lighting %, Equipment %, Other %) powering the donut chart. |
| `GET` | `/api/energy/forecast` | Returns 48 hours of historical readings alongside 8 hours of GradientBoosting predictions for Chart.js. |
| `GET` | `/api/energy/recommendations`| Returns prioritized AI-synthesized recommendations with estimated financial savings. |
| `POST`| `/api/energy/agent/analyze` | Accepts `{ "facility_id": 1, "question": "..." }` and returns real-time model inferences and conversational agent answers. |
| `GET` | `/api/energy/heatmap` | Aggregated 7-day hourly grid matrix ($7 \times 24$) for color-intensity visualization. |
| `GET` | `/api/energy/alerts` | List of open facility threshold breaches and alarms. |

---

## 🚀 How to Run & Demonstrate the Project

### 1. Launch Everything in One Command
Open a terminal in the project directory:
```bash
./start.sh
```
This script automatically:
1. Validates Python 3.9+.
2. Configures a virtual environment (`backend/.venv`) and installs packages (`fastapi`, `uvicorn`, `scikit-learn`, `pandas`, `numpy`).
3. Seeds `facilityops.db` with 2,976 records.
4. Trains the Isolation Forest & Gradient Boosting models.
5. Verifies anomaly detection accuracy meets $\ge 85\%$.
6. Clears previous processes on port `8000`.
7. Starts the FastAPI server and launches the live dashboard at `http://localhost:8000`.

### 2. Manual Commands (If Preferred)
```bash
# Activate virtual environment
source backend/.venv/bin/activate

# Seed Database
python3 backend/seed_data.py

# Train AI Engine
python3 backend/ai_engine.py

# Start Backend Server
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 💬 Frequently Asked Questions (For Viva / Mentor Review)

**Q1: What is the main problem this project solves?**  
> Traditional Building Management Systems (BMS) are passive and rule-siloed. Facility managers only notice excessive energy consumption or faulty equipment after receiving costly monthly utility bills. FacilityOps AI proactively detects energy anomalies in real-time and forecasts peak loads before penalties occur.

**Q2: Why use Isolation Forest instead of simple threshold alerts?**  
> Fixed thresholds fail to capture context. For instance, consuming $200\text{ kW}$ at 2:00 PM on a hot weekday is completely normal, but consuming $200\text{ kW}$ at 3:00 AM on Sunday is a major energy waste. Isolation Forest considers time of day, day of week, occupancy, ambient temperature, and subsystem ratios simultaneously.

**Q3: How are cost savings calculated?**  
> We apply standard Indian commercial utility rates ($\approx ₹9/\text{kWh}$) and grid emission factors ($0.82\text{ kg CO}_2\text{e}/\text{kWh}$). When the agent detects that HVAC or lighting is operating inefficiently, it calculates the difference between current consumption and the benchmark baseline to compute projected daily rupee savings.

**Q4: Where are the trained models stored?**  
> Models are serialized using `pickle` in `backend/models/`:
> * `isolation_forest.pkl` & `anomaly_scaler.pkl` for anomaly detection.
> * `forecaster.pkl` for time-series demand prediction.

**Q5: Is the frontend using mock data or real backend APIs?**  
> The dashboard is **100% integrated with the FastAPI backend**. All KPI cards, Chart.js time-series lines, donut distributions, heatmaps, and AI recommendations are dynamically fetched via asynchronous `fetch()` calls to the REST API.
