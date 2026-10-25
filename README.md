# Demand-Based Transport Fleet Optimization and Scheduling System

An intelligent, data-driven operational control and dispatch advisory platform designed for modern public transit corporations. The system integrates machine learning models and policy-constrained optimization algorithms to detect bus bunching, forecast next-hour passenger demand, identify seat capacity bottlenecks, and recommend feasible vehicle reallocations in real time.

---

## 1. Problem Statement

Public bus transit networks face dynamic, fluctuating passenger demand influenced by peak commuter hours, weather disruptions, school and office schedules, and holiday travel surges:

1. **Static Timetables vs. Dynamic Demand**: Traditional transit operations rely on fixed, historical schedules that fail to adapt to live variations. As a result, high-density commuter corridors experience acute overcrowding and stranded passengers, while low-demand corridors run underutilized, empty buses—wasting operational budget, fuel, and driver hours.
2. **Bus Bunching & Irregular Headways**: Heavy road traffic, unpredictable signal delays, and extended passenger boarding times cause buses to lose scheduled spacing. Delayed buses attract larger crowds, slowing them down further, while trailing buses catch up—resulting in **Bus Bunching** (two or more buses arriving at the same stop simultaneously). This doubles passenger wait times and degrades service reliability.
3. **Operational Blind Spots in Emergencies**: When unscheduled mechanical breakdowns, VIP motorcades, or unexpected terminal crowd surges occur, dispatchers lack real-time decision-support tools. Manual reassignments often violate regulatory minimum service guarantees or dispatch incompatible bus types (e.g., standard seating buses onto overnight sleeper corridors).
4. **Objective**: Build an end-to-end decision-support platform that monitors real-time route telemetry, provides early warning of bus bunching, accurately forecasts next-hour demand, and recommends constraint-compliant vehicle transfers (from active surplus routes or standby depot reserves) without requiring capital expenditure for new fleet acquisitions.

---

## 2. System Architecture & Modules

The platform is organized into four core operational modules accessible via the unified left sidebar navigation:

```
[ Unified Filter Bar: Date Picker | Hour Window (06:00 - 21:00) | Service Class | Corridor ]
                                        │
    ┌───────────────────┬───────────────┴───────────────┬───────────────────┐
    ▼                   ▼                               ▼                   ▼
1. Bus Bunching     2. Passenger Demand         3. Fleet Allocation     4. What-If Simulator
   Prediction          Forecasting                 & Directives            & Emergency Sandbox
```

---

### Module 1: Bus Bunching Prediction
Monitors live trip telemetry and headway regularities across all active corridors to forecast vehicle clumping before it occurs.

* **Key Telemetry**: Scheduled Departure, Actual Departure, Scheduled Headway ($\min$), Observed Gap ($\min$), Departure Delay ($\min$), Headway Deviation, and Bunching Probability ($\%$).
* **Machine Learning Engine**: Trained Random Forest Classifier predicts whether a trip will experience bunching ($headway \le 15\text{ min}$ or $\le 50\%$ of scheduled gap).
* **Operational Value**: Alerts dispatchers to hold departures or adjust headway pacing at origin terminals to restore uniform vehicle intervals.

![Bus Bunching](Dashboard/Bus%20bunching.png)

---

### Module 2: Passenger Demand Prediction
Forecasts route-level passenger demand for the upcoming hour and contrasts it against scheduled seating capacity to pinpoint capacity bottlenecks.

* **Key Telemetry**: Total Operating Fleet, Operating Seating Capacity, Current Demand, Predicted Next-Hour Demand, Capacity Shortage, Utilization Percentage, and Corridor Bottleneck Status.
* **Machine Learning Engine**: High-accuracy Random Forest Regressor trained on seasonal, calendar, hourly, and lag features.
* **Corridor Status Classification**:
  * **Severe Shortage**: Shortage $\ge 40$ passengers (Urgent reinforcement required).
  * **Capacity Deficit**: Shortage $\ge 1$ passenger (Utilization $> 100\%$).
  * **Optimal**: Capacity meets demand ($60\% \le \text{Utilization} \le 100\%$).
  * **Surplus Capacity**: Utilization $< 60\%$ (Candidate for fleet conservation).

![Passenger Demand](Dashboard/Passenger%20demand.png)

---

### Module 3: Fleet Allocation & Reallocation
A two-tier optimization engine that rebalances fleet distribution to eliminate passenger deficits while strictly preserving minimum service floors.

* **Dual Audit Views**:
  * **1. Deficit Corridors (Require Reinforcement)**: Exclusively lists routes where demand surpasses seating capacity ($\ge 1$ pax shortage). Balanced routes are filtered out to keep dispatcher attention focused on critical issues.
  * **2. Surplus Corridors (Available to Spare)**: Lists routes with low passenger volume where all passengers fit into fewer buses **and** excess buses exist above the statutory minimum service floor.
* **Two-Tier Relief Dispatch Engine**:
  * **Tier 1 (Route-to-Route Transfer)**: Shifts excess buses from active surplus corridors to adjacent deficit corridors.
  * **Tier 2 (Central Depot Standby Reserves)**: If all active routes are at capacity or minimum service floor, the system automatically draws from staged **Standby Depot Reserves** (`DEPOT-RES`) to clear deficits without degrading service on any active line.
* **Automated Directives**: Recommends feasible transfer directives with vehicle compatibility checks, distance limits ($\le 60\text{ km}$), passenger relief numbers, and single-click **Approve Dispatch** logging.

![Fleet Allocation](Dashboard/Fleet%20allocation.png)

---

### Module 4: What-If & Emergency Scenario Analysis
An isolated interactive sandbox allowing transport controllers to stress-test the network, evaluate ad-hoc disruptions, and execute manual overrides without modifying underlying datasets:

* **A. Sudden Bus Breakdown**: Simulates in-service vehicle disablement. Calculates lost seating capacity (e.g. $-55$ seats) and scans nearby corridors for compatible spare buses with repositioning ETAs.
* **B. Booth Emergency Request**: Handles urgent phone-ins from terminal timekeepers when sudden crowds gather (e.g. 45 stranded passengers). Recommends immediate auxiliary depot dispatch.
* **C. Manual Bus Reallocation**: Enables human controllers to select a source fleet (Depot Reserve or Surplus Corridor) and destination corridor. The system evaluates statutory minimum service rules, distance barriers, and vehicle compatibility before logging the dispatch directive.
* **D. VIP / Traffic Impact**: Models traffic congestion and police convoys (+25%, +50%, +100% delay surges). Computes projected headway delay, elevated bunching probability (up to $85\%$), and terminal holding intervals.
* **E. Constrained Routes Audit**: Details statutory minimum service floors and explains legal barriers protecting busy corridors from vehicle stripping.

![What If Analysis](Dashboard/What%20if%20analysis.png)

---

## 3. Machine Learning Models & Metric Evaluation

The platform utilizes benchmarked models trained on standardized operational datasets covering City Local (L01–L06), Suburban Regional (R01–R03), and Intercity (I01–I03) corridors.

### A. Bus Bunching Classification Models

Evaluated on trip-level headway telemetry, delay deviations, and scheduled intervals:

| Model | Accuracy (%) | Precision (%) | Recall (%) | F1-Score | F1 (Macro) | ROC-AUC Score | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Logistic Regression** | 99.68% | 89.62% | 100.00% | 0.9453 | 0.9718 | 1.0000 | Baseline |
| **Decision Tree Classifier** | 100.00% | 100.00% | 100.00% | 1.0000 | 1.0000 | 1.0000 | Candidate |
| **Random Forest Classifier** | **100.00%** | **100.00%** | **100.00%** | **1.0000** | **1.0000** | **1.0000** | **Selected Model** |

* **Model Selection Justification**: While Decision Tree achieved perfect test scores, the **Random Forest Classifier** (`models/bunching_rf_classifier.joblib`) was selected for deployment. Its multi-tree ensemble structure prevents leaf overfitting, handles multi-collinear telemetry variations, and outputs calibrated continuous probabilities for early bunching alerts.

---

### B. Passenger Demand Regression Models

Evaluated on hourly corridor operations across 2026 calendar dates, public holidays, festival travel windows, and historical demand patterns:

| Model | MAE (passengers) | RMSE (passengers) | MAPE (%) | $R^2$ Score | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Linear Regression** | 23.41 pax | 30.41 pax | 24.74% | 0.7486 | Baseline |
| **Decision Tree Regressor** | 8.38 pax | 11.71 pax | 7.20% | 0.9627 | Candidate |
| **Random Forest Regressor** | **8.09 pax** | **11.16 pax** | **6.96%** | **0.9662** | **Selected Model** |

* **Model Selection Justification**: The **Random Forest Regressor** (`models/demand_rf_regressor.joblib`) achieved superior predictive performance across all metrics:
  * **Lowest Mean Absolute Error (MAE)**: Only $8.09$ passengers per bus trip.
  * **Lowest Mean Absolute Percentage Error (MAPE)**: $6.96\%$ error margin.
  * **Highest Coefficient of Determination ($R^2$)**: $0.9662$, explaining over $96.6\%$ of dynamic demand variance across peak hours, weekends, and festival windows.

---

## 4. Technology Stack

* **Backend**: Python 3.10+, FastAPI, Uvicorn (ASGI web server).
* **Data Processing & ML**: Pandas, NumPy, Scikit-Learn, Joblib.
* **Frontend**: Vanilla JavaScript (ES6+), HTML5, Vanilla CSS3 (Custom Transit Orange & White Design System).
* **Data Visualization**: Chart.js (interactive demand trends & fleet breakdown bars).

---

## 5. How to Run the Project

Follow these steps to set up and launch the application locally:

### Step 1: Clone the Repository
```bash
git clone https://github.com/Rithi-20/Bus-demand-prediction-and-optimization.git
cd Bus-demand-prediction-and-optimization
```

### Step 2: Set Up Virtual Environment (Recommended)
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Required Dependencies
```bash
pip install -r requirements.txt
```

### Step 4: Launch the Application Server
Run the FastAPI application via Uvicorn:
```bash
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

### Step 5: Access the Dashboard
Open your web browser and navigate to:
```
http://127.0.0.1:8000
```

---

## 6. Dashboard Navigation & Usage Guide

1. **Shared Top Filter Bar**:
   * **Date Picker**: Select any date from January 1, 2026 to December 31, 2026 using the native date picker.
   * **Time / Hour**: Select any operating hour from 06:00 AM to 09:00 PM (peak hours are tagged).
   * **Service Class**: Filter by `All`, `Local`, `Regional`, or `Intercity`.
   * **Corridor**: Filter down to an individual route or analyze network-wide operations.
2. **Tab 1: Bus Bunching**: Inspect trip departure telemetry, observed vs. scheduled gaps, and ML bunching warnings.
3. **Tab 2: Passenger Demand**: Review predicted hourly passenger volumes, route utilization bars, and capacity shortages.
4. **Tab 3: Fleet Allocation**: Review Deficit Corridors and Surplus Corridors side by side, and review/approve automated bus dispatch directives.
5. **Tab 4: What-If Analysis**: Test emergency disruptions (bus breakdown, terminal crowd spikes, manual bus transfers, VIP traffic slowdowns, and route constraint audits).

---

## 7. Project Directory Structure

```
├── cleaned_data/                                  # Active operational datasets (calendar, hourly, trips)
├── config/                                        # Global application settings
├── Dashboard/                                     # Dashboard module screenshots
│   ├── Bus bunching.png
│   ├── Passenger demand.png
│   ├── Fleet allocation.png
│   └── What if analysis.png
├── data preprocessing/                            # Jupyter notebooks for data cleaning & profiling
├── EDA/                                           # Exploratory Data Analysis notebooks
├── model comparison/                              # Scripts & evaluation results comparing ML algorithms
│   └── results/
│       ├── classification_metrics_summary.csv     # Bunching classification benchmark metrics
│       └── regression_metrics_summary.csv         # Demand forecasting benchmark metrics
├── models/                                        # Production-ready trained ML models (.joblib)
├── raw data/                                      # Original raw benchmark data
├── reports/                                       # Model evaluation metrics & validation reports
├── src/                                           # Core Python modules (features, optimization, services)
├── static/                                        # Web dashboard assets (CSS, JS, icons)
│   ├── css/style.css                              # Transit Orange & White stylesheet
│   ├── js/app.js                                  # Application state controller & API client
│   └── js/charts.js                               # Interactive Chart.js graphs
├── tests/                                         # Test suites for optimization & model inference
├── README.md                                      # Project documentation & execution guide
├── requirements.txt                               # Project dependencies
└── server.py                                      # FastAPI REST API backend
```
