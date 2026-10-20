# Demand Based Public Transport Planning System

[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg)](https://fastapi.tiangolo.com/)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-1.9.1-F7931E.svg)](https://scikit-learn.org/)
[![Google OR-Tools](https://img.shields.io/badge/Google%20OR--Tools-9.15-4285F4.svg)](https://developers.google.com/optimization)

Demand Based Public Transport Planning System is an end-to-end Machine Learning and Mathematical Optimization platform designed for public bus transit network management. Built on operational datasets modeled after 14 transit corridors across Tamil Nadu state, the system addresses core transport inefficiencies: **vehicle bunching**, **capacity shortages / unserved passenger demand**, and **suboptimal fleet allocation across routes**.

---

## 1. Problem Statement

Scheduled public bus services operate on static timetables that frequently fail to adapt to dynamic demand fluctuations, peak-hour bottlenecks, and headway variance. This manifests in four acute operational issues:
1. **Bus Bunching**: Traffic delays cause consecutive buses on the same route to cluster together, resulting in extended waiting gaps for downstream passengers followed by underutilized paired vehicles.
2. **Passenger Left-Behind Risks**: Fixed schedules fail to match intraday demand spikes, resulting in seat capacity deficits where demand exceeds total vehicle capacity.
3. **Imbalanced Fleet Allocation**: Certain transit corridors experience severe capacity crunches while neighboring corridors operate with surplus unutilized capacity.
4. **Lack of Pre-deployment Simulation**: Transit dispatchers lack mathematical tools to stress-test timetable changes, weather disruptions, or festival surges prior to committing physical buses.

---

## 2. System Architecture

```
Demand_based_Transport/
├── server.py                          # High-performance FastAPI REST API & static file server
├── static/                            # Interactive Command Center Frontend
│   ├── index.html                     # HTML5 dashboard layout (Navionyx & Fleet Tings design)
│   ├── css/
│   │   └── style.css                  # Dark-themed glassmorphism, glowing vectors, responsive layout
│   └── js/
│       ├── app.js                     # State management, view switching, API communication
│       ├── map.js                     # Leaflet map with dark Esri tiles, animated buses & route glow
│       └── charts.js                  # Chart.js neon area gradients, headway bars, & feature rankings
├── config/
│   └── settings.py                    # Global paths, features, weights, scenario rules
├── data/
│   ├── tn_routes_context.csv          # 14 corridor profiles (distance, capacity, base factors)
│   ├── seasonal_scenarios.csv         # 9 seasonal stress-test calendars & multipliers
│   ├── disruption_scenarios.csv       # 3 disruption events (monsoon, roadworks, major event)
│   ├── tn_trip_delay_scenarios.csv    # 37,230 trip records with scheduled/actual headways
│   ├── tn_hourly_passenger_demand.csv # 91,980 hourly demand records across 365 days
│   ├── tn_route_hour_model_data.csv   # Integrated route-hour model features & targets
│   ├── tn_allocation_scenarios.csv    # Reference fleet-conserving allocation scenarios
│   ├── DATA_DICTIONARY.json           # Schema documentation & inferred data types
│   ├── VALIDATION_REPORT.json         # Automated dataset verification report
│   └── SOURCES_AND_LIMITATIONS.txt    # Data governance & synthetic limitations notice
├── models/
│   ├── bunching_rf_classifier.joblib  # Trained Random Forest Classifier pipeline
│   ├── bunching_metadata.json         # Hyperparameters, metrics, confusion matrix, features
│   ├── demand_rf_regressor.joblib     # Trained Random Forest Regressor pipeline
│   └── demand_metadata.json           # Hyperparameters, MAE/RMSE/R2 vs baseline, features
├── reports/
│   ├── dataset_inspection_report.json # Automated data audit findings
│   └── model_evaluation_metrics.json  # Combined evaluation report
├── src/
│   ├── data/
│   │   ├── load_data.py               # Robust data loaders with caching
│   │   └── validate_data.py           # Anomaly detectors & schema validators
│   ├── features/
│   │   └── feature_engineering.py     # Chronological zero-leakage preprocessors & cyclical time encoding
│   ├── models/
│   │   ├── bunching_model.py          # Random Forest bunching classifier training & persistence
│   │   ├── demand_model.py            # Random Forest demand regressor training & persistence
│   │   └── train_models.py            # Unified training orchestrator
│   └── optimization/
│       ├── constraints.py             # Data classes, feasibility bounds & integer rules
│       ├── allocation_optimizer.py    # Google OR-Tools MILP solver & exact fleet conservation
│       └── scenario_simulator.py      # What-if scenario modifier & disruption simulator
└── requirements.txt                   # Production dependencies
```

---

## 3. Core Modules & Methodologies

### Module 1: Bus Bunching Early-Warning System
- **Algorithm**: `RandomForestClassifier` (100 estimators, max depth 12).
- **Inputs**: Scheduled headway, actual headway, headway deviation, scheduled buses, passenger demand, cyclical hour encoding ($\sin$/$\cos$), weekend indicator.
- **Performance**: ROC-AUC: **0.9550**, Recall: **84.71%**, Accuracy: **88.69%**.
- **Operational Output**: Categorizes risk into Low / Medium / High and issues proactive dispatch hold/dispatch gap advisories.

### Module 2: Passenger Demand & Shortage Forecaster
- **Algorithm**: `RandomForestRegressor` (150 estimators, max depth 15).
- **Inputs**: Route ID, corridor type, operating hour, distance, day-of-week, seasonal and disruption flags.
- **Performance**: MAE: **4.37 pax/hr**, $R^2$: **0.8002** (42.2% error reduction vs baseline).
- **Shortage Metric**: Identifies capacity deficits where $\text{Deficit} = \max(0, \text{Demand} - \text{Capacity})$.

### Module 3: Dynamic Fleet Reallocation (Google OR-Tools MILP)
- **Algorithm**: Mixed-Integer Linear Programming (MILP) solved via CBC with analytical fallback.
- **Objective**: Minimize weighted unserved passenger shortages while minimizing unnecessary vehicle reassignments:
  $$\min \sum_{r} w_{\text{short}} \cdot \max(0, D_r - c_r \cdot x_r) + w_{\text{dev}} \cdot |x_r - x_r^{(0)}|$$
- **Constraints**:
  1. Integer Vehicle Constraints: $x_r \in \mathbb{Z}^+ \quad \forall r$
  2. Minimum Service Guarantee: $x_r \ge x_r^{\min} \quad \forall r$
  3. Strict Fleet Conservation: $\sum_{r} x_r = F_{\text{available}}$ (No new vehicles spawned).
- **Concrete Shift Directives**: Pairs surplus routes with deficit routes to generate explicit vehicle movement instructions:
  `Bus #TN-FLEET-XXXX (50 Pax Capacity) reallocated from TN07 (Salem) to TN03 (OMR IT Corridor)`.

---

## 4. Installation and Setup

### Step 1: Virtual Environment
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### Step 2: Install Dependencies
```powershell
pip install -r requirements.txt
```

---

## 5. Execution Commands

### Launch the Command Center Web Dashboard
```powershell
python server.py
```
*(Or run with uvicorn directly: `uvicorn server:app --host 0.0.0.0 --port 8000 --reload`)*

Open your browser at **`http://localhost:8000`**.

### Retrain ML Models
```powershell
python -m src.models.train_models
```

### Validate Datasets
```powershell
python -m src.data.validate_data
```

---

## 6. Synthetic Data Disclaimer & Limitations

1. **Synthetic Operational Context**: All demand figures, trip delays, headways, and reallocation metrics are synthetic values generated for simulation benchmarks. Corridor names provide illustrative regional context for Tamil Nadu state only.
2. **Local & Free Stack**: Demand Based Public Transport Planning System runs 100% locally with free, open-source libraries. No external cloud accounts or paid APIs are required.
