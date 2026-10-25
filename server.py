"""
Demand-Based Public Transport Planning System: FastAPI Backend.
Integrates trained Random Forest Classifier (Bus Bunching) and
Random Forest Regressor (Passenger Demand) with transparent
constraint-based fleet reallocation and emergency what-if simulation.
"""
import os
import glob
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, Query, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib

app = FastAPI(title="Demand-Based Public Transport Planning System API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# 1. LOAD MODELS & DATASETS
# ---------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "cleaned_data")

# Load Datasets from cleaned_data/
ROUTES_DF = pd.read_csv(os.path.join(DATA_DIR, "route_master.csv"))
DEMAND_DF = pd.read_csv(os.path.join(DATA_DIR, "hourly_demand_operations.csv"), low_memory=False)
TRIPS_DF = pd.read_csv(os.path.join(DATA_DIR, "trip_operations.csv"), low_memory=False)
CALENDAR_DF = pd.read_csv(os.path.join(DATA_DIR, "calendar_events.csv"))

# Clean and normalize service_class strings
for df in [ROUTES_DF, DEMAND_DF, TRIPS_DF]:
    if "service_class" in df.columns:
        df["service_class"] = df["service_class"].astype(str).str.strip()
    if "route_id" in df.columns:
        df["route_id"] = df["route_id"].astype(str).str.strip()
    if "bus_type" in df.columns:
        df["bus_type"] = df["bus_type"].astype(str).str.strip()

# Day of week mapping
DAY_MAP = {'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6}

# Load Saved Machine Learning Models
RF_CLASSIFIER_PATH = os.path.join(BASE_DIR, "models", "classification", "random_forest_classifier.joblib")
RF_REGRESSOR_PATH = os.path.join(BASE_DIR, "models", "regression", "random_forest_regressor.joblib")

RF_CLASSIFIER = None
RF_REGRESSOR = None

if os.path.exists(RF_CLASSIFIER_PATH):
    try:
        RF_CLASSIFIER = joblib.load(RF_CLASSIFIER_PATH)
        print(f"[ML] Successfully loaded Bunching Classifier from {RF_CLASSIFIER_PATH}")
    except Exception as e:
        print(f"[ML ERROR] Could not load Bunching Classifier: {e}")

if os.path.exists(RF_REGRESSOR_PATH):
    try:
        RF_REGRESSOR = joblib.load(RF_REGRESSOR_PATH)
        print(f"[ML] Successfully loaded Demand Regressor from {RF_REGRESSOR_PATH}")
    except Exception as e:
        print(f"[ML ERROR] Could not load Demand Regressor: {e}")

AVAILABLE_DATES = sorted(DEMAND_DF["date"].unique().tolist())
AVAILABLE_HOURS = sorted(DEMAND_DF["hour_int"].unique().tolist())
APPROVED_DIRECTIVES: List[Dict[str, Any]] = []

# Route metadata lookup dictionary
ROUTE_INFO = {}
for _, r in ROUTES_DF.iterrows():
    ROUTE_INFO[r["route_id"]] = {
        "route_id": r["route_id"],
        "route_name": r["route_name"],
        "service_class": r["service_class"],
        "origin": r["origin"],
        "destination": r["destination"],
        "distance_km": float(r["distance_km"]),
        "bus_type": r["bus_type"],
        "capacity_per_bus": int(r["capacity_per_bus"]),
        "base_buses": int(r["base_buses"]),
        "minimum_service_bus_count": int(r["minimum_service_bus_count"])
    }

# ---------------------------------------------------------
# 2. FILTER & METADATA ENDPOINT
# ---------------------------------------------------------
@app.get("/api/filters")
def get_filters():
    """Returns available dates, hours, routes, and service classes for the compact filter bar."""
    routes_list = []
    for _, r in ROUTES_DF.iterrows():
        routes_list.append({
            "route_id": r["route_id"],
            "route_name": r["route_name"],
            "service_class": r["service_class"],
            "bus_type": r["bus_type"],
            "origin": r["origin"],
            "destination": r["destination"]
        })
    return {
        "dates": AVAILABLE_DATES,
        "default_date": AVAILABLE_DATES[0] if AVAILABLE_DATES else "2026-01-01",
        "hours": AVAILABLE_HOURS,
        "default_hour": 8,
        "service_classes": ["All", "Local", "Regional", "Intercity"],
        "routes": routes_list
    }

# ---------------------------------------------------------
# 3. MODULE 1: BUS BUNCHING PREDICTION
# ---------------------------------------------------------
@app.get("/api/bunching")
def get_bunching_prediction(
    date: str = "2026-01-01",
    hour: int = 8,
    service_class: str = "All",
    route_id: Optional[str] = None
):
    """
    Evaluates trip-level headway telemetry using the trained Random Forest Classifier.
    Predicts: Bunching (Class 1) or Not Bunching (Class 0) with continuous probability.
    """
    # Filter trip records
    mask = (TRIPS_DF["date"] == str(date)) & (TRIPS_DF["hour_int"] == int(hour))
    if service_class and service_class != "All" and isinstance(service_class, str):
        mask = mask & (TRIPS_DF["service_class"] == service_class)
    if route_id and route_id != "All" and isinstance(route_id, str):
        mask = mask & (TRIPS_DF["route_id"] == route_id)

    matched_trips = TRIPS_DF[mask].copy()

    # Fallback to closest available trips if date has no trips for that hour
    if matched_trips.empty:
        mask_fallback = TRIPS_DF["hour_int"] == hour
        if service_class and service_class != "All":
            mask_fallback = mask_fallback & (TRIPS_DF["service_class"] == service_class)
        if route_id and route_id != "All":
            mask_fallback = mask_fallback & (TRIPS_DF["route_id"] == route_id)
        matched_trips = TRIPS_DF[mask_fallback].head(30).copy()

    trip_results = []
    bunching_count = 0
    total_trips = len(matched_trips)

    if not matched_trips.empty and RF_CLASSIFIER is not None:
        # Prepare exact feature columns used during model training
        # Features: ['hour_int', 'scheduled_headway_min', 'actual_headway_min', 'departure_delay_min', 'headway_deviation_min', 'headway_ratio']
        feat_cols = getattr(RF_CLASSIFIER, "feature_names_in_", [
            'hour_int', 'scheduled_headway_min', 'actual_headway_min',
            'departure_delay_min', 'headway_deviation_min', 'headway_ratio'
        ])
        
        # Ensure auxiliary ratio columns exist
        if "headway_deviation_min" not in matched_trips.columns:
            matched_trips["headway_deviation_min"] = matched_trips["actual_headway_min"] - matched_trips["scheduled_headway_min"]
        if "headway_ratio" not in matched_trips.columns:
            matched_trips["headway_ratio"] = matched_trips["actual_headway_min"] / np.maximum(0.1, matched_trips["scheduled_headway_min"])
        if "is_delayed" not in matched_trips.columns:
            matched_trips["is_delayed"] = (matched_trips["departure_delay_min"] > 5.0).astype(int)
        if "delay_ratio" not in matched_trips.columns:
            matched_trips["delay_ratio"] = matched_trips["departure_delay_min"] / np.maximum(1.0, matched_trips["scheduled_headway_min"])

        X_eval = matched_trips[feat_cols].copy().fillna(0)
        preds = RF_CLASSIFIER.predict(X_eval)
        probas = RF_CLASSIFIER.predict_proba(X_eval)[:, 1]

        for i, (_, row) in enumerate(matched_trips.iterrows()):
            rid = row["route_id"]
            r_meta = ROUTE_INFO.get(rid, {})
            is_bunching = int(preds[i]) == 1
            prob = float(probas[i])
            if is_bunching:
                bunching_count += 1

            sched_h = float(row["scheduled_headway_min"])
            actual_h = float(row["actual_headway_min"])
            delay = float(row["departure_delay_min"])
            headway_gap = actual_h - sched_h

            advisory = "Normal operations. Headway gap maintained."
            if is_bunching:
                advisory = f"Hold trailing bus by 3-5 min at terminal to restore {sched_h:.0f}m gap."
            elif delay > 8:
                advisory = "Departure delayed. Monitor terminal dispatch interval."

            trip_results.append({
                "trip_id": row["trip_id"],
                "route_id": rid,
                "route_name": r_meta.get("route_name", rid),
                "service_class": row["service_class"],
                "bus_type": row.get("bus_type", r_meta.get("bus_type", "Normal")),
                "scheduled_headway": round(sched_h, 1),
                "actual_headway": round(actual_h, 1),
                "departure_delay": round(delay, 1),
                "headway_gap": round(headway_gap, 1),
                "prediction": "Bunching" if is_bunching else "Not Bunching",
                "bunching_probability": round(prob * 100, 1),
                "risk_badge": "High Risk" if is_bunching else ("Medium Risk" if prob > 0.4 else "Normal"),
                "advisory": advisory
            })

    # Sort so bunching trips appear first
    trip_results.sort(key=lambda x: (x["prediction"] != "Bunching", -x["bunching_probability"]))

    # Route-level risk aggregation for compact chart
    route_risk = {}
    for t in trip_results:
        rid = t["route_id"]
        if rid not in route_risk:
            route_risk[rid] = {"route_id": rid, "route_name": t["route_name"], "probs": []}
        route_risk[rid]["probs"].append(t["bunching_probability"])

    route_chart_data = []
    for rid, val in route_risk.items():
        avg_prob = round(sum(val["probs"]) / len(val["probs"]), 1)
        route_chart_data.append({
            "route_id": rid,
            "route_name": val["route_name"],
            "avg_bunching_prob": avg_prob,
            "is_bunching": avg_prob >= 50.0
        })
    route_chart_data.sort(key=lambda x: x["avg_bunching_prob"], reverse=True)

    bunching_rate = round((bunching_count / max(1, total_trips)) * 100, 1)

    return {
        "date": date,
        "hour": hour,
        "service_class": service_class,
        "route_id": route_id or "All",
        "summary": {
            "total_trips": total_trips,
            "bunching_count": bunching_count,
            "normal_count": total_trips - bunching_count,
            "bunching_rate_pct": bunching_rate,
            "system_status": "CRITICAL" if bunching_count > 2 else ("WARNING" if bunching_count > 0 else "STABLE")
        },
        "route_chart": route_chart_data[:8],
        "trips": trip_results
    }

# ---------------------------------------------------------
# 4. MODULE 2: PASSENGER DEMAND PREDICTION
# ---------------------------------------------------------
@app.get("/api/demand")
def get_demand_prediction(
    date: str = "2026-01-01",
    hour: int = 8,
    service_class: str = "All",
    route_id: Optional[str] = None
):
    """
    Predicts next-hour passenger demand using trained Random Forest Regressor.
    Calculates capacity shortage: max(predicted_passenger_demand - total_capacity, 0).
    """
    mask = (DEMAND_DF["date"] == str(date)) & (DEMAND_DF["hour_int"] == int(hour))
    if service_class and service_class != "All" and isinstance(service_class, str):
        mask = mask & (DEMAND_DF["service_class"] == service_class)
    if route_id and route_id != "All" and isinstance(route_id, str):
        mask = mask & (DEMAND_DF["route_id"] == route_id)

    matched_demand = DEMAND_DF[mask].copy()

    # Fallback to closest hour
    if matched_demand.empty:
        mask_fallback = DEMAND_DF["hour_int"] == hour
        if service_class and service_class != "All":
            mask_fallback = mask_fallback & (DEMAND_DF["service_class"] == service_class)
        if route_id and route_id != "All":
            mask_fallback = mask_fallback & (DEMAND_DF["route_id"] == route_id)
        matched_demand = DEMAND_DF[mask_fallback].head(12).copy()

    # Check calendar for festival or holiday flags
    cal_row = CALENDAR_DF[CALENDAR_DF["date"] == date]
    holiday_name = "Regular Operations"
    if not cal_row.empty:
        fest = str(cal_row["festival_scenario"].values[0]).strip()
        hol = str(cal_row["official_holiday_name"].values[0]).strip()
        if fest and fest.lower() not in ["no_festival", "none", "nan", ""]:
            holiday_name = f"Festival Window ({fest})"
        elif hol and hol.lower() not in ["no_festival", "none", "nan", ""]:
            holiday_name = f"Public Holiday ({hol})"
        else:
            holiday_name = "Regular Operations"

    demand_results = []
    total_predicted = 0.0
    total_capacity = 0.0
    total_shortage = 0.0
    shortage_routes_count = 0

    if not matched_demand.empty and RF_REGRESSOR is not None:
        # Prepare exact feature columns used during model training
        feat_cols = getattr(RF_REGRESSOR, "feature_names_in_", [
            'hour_int', 'hour_sin', 'hour_cos', 'day_of_week',
            'is_weekend', 'is_friday', 'is_peak_hour', 'holiday_flag',
            'rainfall_mm', 'construction_active',
            'scheduled_bus_count', 'available_bus_count', 'total_capacity',
            'passenger_demand', 'capacity_shortage',
            'scheduled_headway_min', 'mean_actual_headway_min', 'mean_departure_delay_min'
        ])

        # Ensure features are present
        if "hour_sin" not in matched_demand.columns:
            matched_demand["hour_sin"] = np.sin(2 * np.pi * matched_demand["hour_int"] / 24)
        if "hour_cos" not in matched_demand.columns:
            matched_demand["hour_cos"] = np.cos(2 * np.pi * matched_demand["hour_int"] / 24)
        if matched_demand["day_of_week"].dtype == object:
            matched_demand["day_of_week"] = matched_demand["day_of_week"].map(DAY_MAP).fillna(0).astype(int)

        X_eval = matched_demand[feat_cols].copy().fillna(0)
        preds = RF_REGRESSOR.predict(X_eval)

        for i, (_, row) in enumerate(matched_demand.iterrows()):
            rid = row["route_id"]
            r_meta = ROUTE_INFO.get(rid, {})
            current_obs = float(row["passenger_demand"])
            pred_demand = max(5.0, float(preds[i]))
            cap = int(row["total_capacity"])
            
            # Integer passenger shortage: A real deficit exists only when rounded passenger demand exceeds seat capacity
            rounded_demand = round(pred_demand)
            shortage = max(0, rounded_demand - cap)
            
            utilization = round((pred_demand / max(1, cap)) * 100, 1)
            if shortage == 0 and utilization > 100.0:
                utilization = 100.0

            if shortage >= 1:
                shortage_routes_count += 1

            total_predicted += pred_demand
            total_capacity += cap
            total_shortage += shortage

            status = "Optimal"
            if shortage >= 40:
                status = "Severe Shortage"
            elif shortage >= 1:
                status = "Capacity Deficit"
            elif utilization < 60:
                status = "Surplus Capacity"

            demand_results.append({
                "route_id": rid,
                "route_name": r_meta.get("route_name", rid),
                "service_class": row["service_class"],
                "bus_type": row.get("bus_type", r_meta.get("bus_type", "Normal")),
                "current_observed_demand": round(current_obs, 1),
                "predicted_next_hour_demand": round(pred_demand, 1),
                "total_capacity": cap,
                "capacity_shortage": int(shortage),
                "utilization_pct": utilization,
                "status": status,
                "available_buses": int(row.get("available_bus_count", r_meta.get("base_buses", 4))),
                "min_service_buses": int(row.get("minimum_service_bus_count", r_meta.get("minimum_service_bus_count", 2)))
            })

    # Sort descending by shortage so priority deficit corridors appear first
    demand_results.sort(key=lambda x: x["capacity_shortage"], reverse=True)

    is_peak = hour in [8, 9, 10, 17, 18, 19]

    return {
        "date": date,
        "hour": hour,
        "is_peak_hour": is_peak,
        "calendar_status": holiday_name,
        "service_class": service_class,
        "summary": {
            "total_predicted_demand": round(total_predicted),
            "total_fleet_capacity": round(total_capacity),
            "net_capacity_deficit": round(total_shortage),
            "shortage_routes_count": shortage_routes_count,
            "overall_utilization_pct": round((total_predicted / max(1, total_capacity)) * 100, 1)
        },
        "routes": demand_results
    }

# ---------------------------------------------------------
# 5. MODULE 3: FLEET ALLOCATION & REALLOCATION ENGINE
# ---------------------------------------------------------
class AllocationRequest(BaseModel):
    date: str
    hour: int
    service_class: str = "All"
    shortage_threshold: float = 20.0

@app.post("/api/allocation")
def get_fleet_allocation(req: AllocationRequest):
    """
    Transparent, constraint-based fleet reallocation engine.
    Matches deficit destination routes with surplus compatible source routes.
    Enforces minimum service constraints, vehicle compatibility, and distance limits.
    """
    demand_data = get_demand_prediction(req.date, req.hour, req.service_class)
    routes = demand_data["routes"]

    # Fleet Surplus Analysis: For every corridor, calculate if fewer buses are needed for its demand
    fleet_surplus_analysis = []
    for r in routes:
        rid = r["route_id"]
        rmeta = ROUTE_INFO.get(rid, {})
        cur_buses = r["available_buses"]
        min_buses = r["min_service_buses"]
        cap_per_bus = rmeta.get("capacity_per_bus", 50)
        pred_dem = r["predicted_next_hour_demand"]

        # Minimum buses required to seat this predicted demand
        buses_needed = max(min_buses, int(np.ceil(pred_dem / max(1, cap_per_bus))))
        # Surplus buses above passenger need and statutory minimum
        surplus_buses = max(0, cur_buses - buses_needed)

        status_text = "Balanced Fleet"
        if surplus_buses > 0:
            status_text = f"{surplus_buses} Surplus Bus(es) Available to Shift"
        elif r["capacity_shortage"] >= 1:
            needed_extra = int(np.ceil(r["capacity_shortage"] / max(1, cap_per_bus)))
            status_text = f"Deficit: Needs {needed_extra} Extra Bus(es)"

        fleet_surplus_analysis.append({
            "route_id": rid,
            "route_name": r["route_name"],
            "service_class": r["service_class"],
            "bus_type": r["bus_type"],
            "capacity_per_bus": cap_per_bus,
            "current_buses": cur_buses,
            "predicted_demand": round(pred_dem),
            "buses_needed_for_demand": buses_needed,
            "minimum_service_buses": min_buses,
            "surplus_buses_available": surplus_buses,
            "status": status_text
        })

    # Identify deficit routes (destination routes needing capacity, minimum threshold >= 20 pax)
    deficit_routes = [r for r in routes if r["capacity_shortage"] >= max(1.0, req.shortage_threshold)]

    # Check available compatible reserve buses from operational schedule for this hour
    hour_records = DEMAND_DF[(DEMAND_DF["date"] == str(req.date)) & (DEMAND_DF["hour_int"] == int(req.hour))]
    reserve_pool = {
        "Normal": 2 if 7 <= req.hour <= 20 else 0,
        "AC": 1 if 7 <= req.hour <= 20 else 0,
        "Sleeper": 1 if 18 <= req.hour <= 22 else 0
    }
    if not hour_records.empty and "reserve_bus_count" in hour_records.columns:
        local_recs = hour_records[hour_records["service_class"] == "Local"]
        if not local_recs.empty:
            reserve_pool["Normal"] = int(local_recs["reserve_bus_count"].max())

    # Track allocated donor buses to prevent a bus from being allocated to two routes simultaneously
    allocated_from_donor = {}
    recommendations = []
    rec_counter = 1

    for dst in deficit_routes:
        dst_rid = dst["route_id"]
        dst_meta = ROUTE_INFO.get(dst_rid, {})
        dst_shortage = dst["capacity_shortage"]
        dst_bus_type = dst["bus_type"]
        dst_class = dst["service_class"]
        dst_cap_per_bus = dst_meta.get("capacity_per_bus", 55)

        matched = False

        # PRIORITY 1: Search for Route-to-Route transfer from routes that have genuine SURPLUS BUSES
        # When a route has e.g. 5 buses but all passengers fit into 3 or 4 buses, shift 1 surplus bus!
        surplus_donor_candidates = [
            f for f in fleet_surplus_analysis
            if f["route_id"] != dst_rid and (f["surplus_buses_available"] - allocated_from_donor.get(f["route_id"], 0)) > 0
        ]

        for src in surplus_donor_candidates:
            src_rid = src["route_id"]
            src_meta = ROUTE_INFO.get(src_rid, {})
            src_buses = src["current_buses"]
            src_min = src["minimum_service_buses"]
            src_bus_type = src["bus_type"]
            src_class = src["service_class"]
            src_already_donated = allocated_from_donor.get(src_rid, 0)

            # CONSTRAINT 1: Source route must retain minimum service buses
            if (src_buses - src_already_donated - 1) < src_min:
                continue

            # CONSTRAINT 2: Vehicle Compatibility & Service-Class Rules
            if dst_class == "Intercity":
                if src_class != "Intercity" or dst_bus_type != src_bus_type:
                    continue
            elif dst_class == "Local":
                if src_class != "Local" or dst_bus_type != src_bus_type:
                    continue
            elif dst_class == "Regional":
                if src_class not in ["Regional", "Local"] or dst_bus_type != src_bus_type:
                    continue

            # CONSTRAINT 3: Operational Distance Limit (within 60 km repositioning window)
            dst_dist = dst_meta.get("distance_km", 40.0)
            src_dist = src_meta.get("distance_km", 40.0)
            if abs(dst_dist - src_dist) > 60.0:
                continue

            # CONSTRAINT 4: Donor route passenger coverage
            src_cap_loss = src_meta.get("capacity_per_bus", 50)
            remaining_cap = (src_buses - src_already_donated - 1) * src_cap_loss
            if src["predicted_demand"] > remaining_cap:
                continue

            # All constraints satisfied -> FEASIBLE ROUTE-TO-ROUTE RECOMMENDATION
            pax_relieved = min(dst_shortage, src_cap_loss)
            allocated_from_donor[src_rid] = src_already_donated + 1

            recommendations.append({
                "recommendation_id": f"REC-{rec_counter:03d}",
                "target_route_id": dst_rid,
                "target_route_name": dst["route_name"],
                "target_service_class": dst_class,
                "predicted_shortage": round(dst_shortage),
                "source_route_id": src_rid,
                "source_route_name": f"{src['route_name']} (Surplus Fleet)",
                "source_service_class": src_class,
                "recommended_bus_type": src_bus_type,
                "seats_relieved": int(pax_relieved),
                "feasibility": "FEASIBLE",
                "allocation_type": "Route-to-Route Shift",
                "reason": f"Shifts 1 surplus {src_bus_type} bus from {src_rid} ({src['current_buses']} active buses, only {src['buses_needed_for_demand']} needed for {src['predicted_demand']} pax). Relieves shortage of {dst_shortage:.0f} pax on {dst_rid}.",
                "constraints_checked": f"Donor {src_rid} retains {src_buses - allocated_from_donor[src_rid]} buses (>= min {src_min}); vehicle compatible; distance within operational range.",
                "approval_status": "Pending Operator Approval"
            })
            rec_counter += 1
            matched = True
            break

        if matched:
            continue

        # PRIORITY 2: Check compatible Standby Depot Reserve Bus if no route has surplus buses
        if reserve_pool.get(dst_bus_type, 0) > 0 and (dst_class != "Intercity" or dst_bus_type in ["AC", "Normal"]):
            reserve_pool[dst_bus_type] -= 1
            pax_relieved = min(dst_shortage, dst_cap_per_bus)
            recommendations.append({
                "recommendation_id": f"REC-{rec_counter:03d}",
                "target_route_id": dst_rid,
                "target_route_name": dst["route_name"],
                "target_service_class": dst_class,
                "predicted_shortage": round(dst_shortage),
                "source_route_id": "DEPOT-RES",
                "source_route_name": f"Central Depot Standby Reserve ({dst_bus_type})",
                "source_service_class": dst_class,
                "recommended_bus_type": dst_bus_type,
                "seats_relieved": int(pax_relieved),
                "feasibility": "FEASIBLE",
                "allocation_type": "Depot Reserve Dispatch",
                "reason": f"Dispatches 1 standby {dst_bus_type} reserve bus ({dst_cap_per_bus} seats) from Central Staging Depot directly to {dst_rid} to relieve {dst_shortage:.0f} pax shortage without reducing service on any active line.",
                "constraints_checked": "Depot reserve available; vehicle type compatible; zero degradation to other routes.",
                "approval_status": "Pending Operator Approval"
            })
            rec_counter += 1
            matched = True
            continue

        # If no donor and no reserve found, log transparently as REJECTED with specific operational reason
        if not matched:
            rejection_reason = "No surplus bus available on adjacent lines and depot reserves exhausted."
            if dst_class == "Intercity" and dst_bus_type == "AC":
                rejection_reason = "No surplus AC coach available in network; cross-class replacement with Sleeper/Normal prohibited."
            elif dst_class == "Intercity" and dst_bus_type == "Sleeper":
                rejection_reason = "No surplus Sleeper coach available; standard seating bus prohibited for night intercity route."

            recommendations.append({
                "recommendation_id": f"REC-{rec_counter:03d}",
                "target_route_id": dst_rid,
                "target_route_name": dst["route_name"],
                "target_service_class": dst_class,
                "predicted_shortage": round(dst_shortage),
                "source_route_id": "None",
                "source_route_name": "No Surplus / Depot Empty",
                "source_service_class": dst_class,
                "recommended_bus_type": dst_bus_type,
                "seats_relieved": 0,
                "feasibility": "REJECTED",
                "allocation_type": "None",
                "reason": rejection_reason,
                "constraints_checked": "Constraint violated: Lack of compatible vehicle or all donor lines at minimum-service limit.",
                "approval_status": "Rejected by System"
            })
            rec_counter += 1

    feasible_count = sum(1 for r in recommendations if r["feasibility"] == "FEASIBLE")

    return {
        "summary": {
            "deficit_routes_identified": len(deficit_routes),
            "feasible_recommendations": feasible_count,
            "rejected_recommendations": len(recommendations) - feasible_count,
            "total_shortage_addressed": sum(r["seats_relieved"] for r in recommendations if r["feasibility"] == "FEASIBLE"),
            "status_label": "OPTIMAL DISPATCH READY" if feasible_count > 0 else "NO FEASIBLE REALLOCATION"
        },
        "fleet_surplus_analysis": fleet_surplus_analysis,
        "recommendations": recommendations,
        "all_routes": routes
    }

class ApprovalRequest(BaseModel):
    recommendation_id: str
    operator_notes: Optional[str] = "Approved by transport controller"

@app.post("/api/allocation/approve")
def approve_recommendation(req: ApprovalRequest):
    """Logs authorized operator approval of a proposed bus movement."""
    entry = {
        "recommendation_id": req.recommendation_id,
        "approved": True,
        "notes": req.operator_notes,
        "status": "APPROVED_BY_OPERATOR"
    }
    APPROVED_DIRECTIVES.append(entry)
    return {
        "success": True,
        "message": f"Recommendation {req.recommendation_id} successfully marked as APPROVED.",
        "directive": entry
    }

class ManualAllocationRequest(BaseModel):
    source_id: str
    target_route_id: str
    buses_to_shift: int = 1
    date: str = "2026-01-01"
    hour: int = 8
    operator_notes: Optional[str] = "Manual dispatch override by controller"

@app.post("/api/allocation/manual")
def manual_bus_allocation(req: ManualAllocationRequest):
    """
    Allows a transit operator to manually shift a bus from a surplus route or depot reserve
    to a destination route, validating all operational constraints.
    """
    dst_rid = req.target_route_id
    if dst_rid not in ROUTE_INFO:
        raise HTTPException(status_code=400, detail=f"Target route '{dst_rid}' not found in network.")

    dst_meta = ROUTE_INFO[dst_rid]
    src_id = req.source_id

    # Case A: Dispatch from Central Depot Reserve
    if src_id.startswith("DEPOT-RES"):
        res_bus_type = "Normal"
        if "AC" in src_id or dst_meta["bus_type"] == "AC":
            res_bus_type = "AC"
        elif "Sleeper" in src_id or dst_meta["bus_type"] == "Sleeper":
            res_bus_type = "Sleeper"

        if dst_meta["service_class"] == "Intercity" and res_bus_type != dst_meta["bus_type"]:
            return {
                "success": False,
                "message": f"Incompatible Vehicle: Cannot assign {res_bus_type} reserve to {dst_meta['bus_type']} intercity corridor {dst_rid}."
            }

        directive = {
            "directive_id": f"MANUAL-{len(APPROVED_DIRECTIVES)+1:03d}",
            "type": "Manual Depot Reserve Dispatch",
            "source": f"Central Staging Depot ({res_bus_type})",
            "target": f"{dst_rid} - {dst_meta['route_name']}",
            "buses_shifted": req.buses_to_shift,
            "bus_type": res_bus_type,
            "status": "EXECUTED",
            "notes": req.operator_notes
        }
        APPROVED_DIRECTIVES.append(directive)
        return {
            "success": True,
            "message": f"Successfully dispatched {req.buses_to_shift} {res_bus_type} reserve bus(es) to {dst_rid}.",
            "directive": directive
        }

    # Case B: Route-to-Route Manual Transfer
    if src_id not in ROUTE_INFO:
        raise HTTPException(status_code=400, detail=f"Source route '{src_id}' not found.")

    if src_id == dst_rid:
        return {"success": False, "message": "Source and destination routes cannot be identical."}

    src_meta = ROUTE_INFO[src_id]

    # Validate Vehicle Compatibility
    if dst_meta["service_class"] == "Intercity" and (src_meta["service_class"] != "Intercity" or src_meta["bus_type"] != dst_meta["bus_type"]):
        return {
            "success": False,
            "message": f"Constraint Violated: Cannot shift {src_meta['bus_type']} bus from {src_id} ({src_meta['service_class']}) to {dst_meta['bus_type']} corridor {dst_rid} ({dst_meta['service_class']})."
        }

    if dst_meta["service_class"] == "Local" and src_meta["service_class"] != "Local":
        return {
            "success": False,
            "message": f"Constraint Violated: Cannot shift {src_meta['service_class']} bus to Local city service {dst_rid}."
        }

    # Validate Distance
    if abs(src_meta["distance_km"] - dst_meta["distance_km"]) > 60.0:
        return {
            "success": False,
            "message": f"Constraint Violated: Distance repositioning exceeds 60 km limit ({abs(src_meta['distance_km'] - dst_meta['distance_km']):.1f} km difference)."
        }

    # Validate Minimum Service
    if (src_meta["base_buses"] - req.buses_to_shift) < src_meta["minimum_service_bus_count"]:
        return {
            "success": False,
            "message": f"Constraint Violated: Shifting {req.buses_to_shift} bus(es) would drop {src_id} below statutory minimum service ({src_meta['minimum_service_bus_count']} buses)."
        }

    directive = {
        "directive_id": f"MANUAL-{len(APPROVED_DIRECTIVES)+1:03d}",
        "type": "Manual Route-to-Route Shift",
        "source": f"{src_id} - {src_meta['route_name']}",
        "target": f"{dst_rid} - {dst_meta['route_name']}",
        "buses_shifted": req.buses_to_shift,
        "bus_type": src_meta["bus_type"],
        "status": "EXECUTED",
        "notes": req.operator_notes
    }
    APPROVED_DIRECTIVES.append(directive)
    return {
        "success": True,
        "message": f"Successfully shifted {req.buses_to_shift} {src_meta['bus_type']} bus(es) from {src_id} to {dst_rid}.",
        "directive": directive
    }
def approve_recommendation(req: ApprovalRequest):
    """Logs authorized operator approval of a proposed bus movement."""
    entry = {
        "recommendation_id": req.recommendation_id,
        "approved": True,
        "notes": req.operator_notes,
        "status": "APPROVED_BY_OPERATOR"
    }
    APPROVED_DIRECTIVES.append(entry)
    return {
        "success": True,
        "message": f"Recommendation {req.recommendation_id} successfully marked as APPROVED.",
        "directive": entry
    }

# ---------------------------------------------------------
# 6. WHAT-IF & EMERGENCY SCENARIO SIMULATOR
# ---------------------------------------------------------
class SimulatorRequest(BaseModel):
    scenario_type: str # "breakdown", "booth_request", "vip_traffic", "constrained_routes"
    route_id: str
    hour: int = 8
    date: str = "2026-01-01"
    bus_type: str = "Normal"
    count: int = 1
    stranded_pax: int = 40
    delay_multiplier: float = 1.3

@app.post("/api/simulate")
def run_what_if_simulation(req: SimulatorRequest):
    """
    Interactive What-If & Emergency Scenario simulator.
    Kept strictly isolated from historical ML training data.
    """
    rid = req.route_id
    r_meta = ROUTE_INFO.get(rid, {})

    if req.scenario_type == "breakdown":
        # Scenario A: Sudden Bus Breakdown
        base_cap = r_meta.get("capacity_per_bus", 50)
        lost_cap = req.count * base_cap
        
        # Search for compatible spare
        replacement_options = []
        for other_id, meta in ROUTE_INFO.items():
            if other_id != rid and meta["bus_type"] == req.bus_type and meta["service_class"] == r_meta.get("service_class"):
                replacement_options.append({
                    "donor_route_id": other_id,
                    "donor_name": meta["route_name"],
                    "available_bus_type": meta["bus_type"],
                    "estimated_arrival_minutes": int(meta["distance_km"] * 0.8) if meta["service_class"] == "Local" else 25
                })

        return {
            "scenario": "Sudden Bus Breakdown",
            "affected_route": f"{rid} - {r_meta.get('route_name', rid)}",
            "unavailable_buses": req.count,
            "bus_type": req.bus_type,
            "lost_seat_capacity": lost_cap,
            "compatible_replacements_found": len(replacement_options),
            "options": replacement_options[:3],
            "action_advice": f"Deploy 1 {req.bus_type} from {replacement_options[0]['donor_route_id'] if replacement_options else 'Central Reserve Depot'}." if replacement_options else "No compatible bus on nearby route. Request auxiliary depot reserve.",
            "data_isolation_notice": "Simulation output only. Historical dataset remains unmodified."
        }

    elif req.scenario_type == "booth_request":
        # Scenario B: Control Booth Emergency Request
        return {
            "scenario": "Control Booth Emergency Request (Stranded Passengers)",
            "route": f"{rid} - {r_meta.get('route_name', rid)}",
            "stranded_passengers": req.stranded_pax,
            "urgency": "High",
            "feasible_response": f"Dispatch 1 auxiliary {req.bus_type} bus from nearest staging depot to clear backlog ({req.stranded_pax} passengers).",
            "status": "Simulation Active",
            "data_isolation_notice": "Simulated dispatch advisory. No automated real-world movement triggered."
        }

    elif req.scenario_type == "vip_traffic":
        # Scenario C: VIP / CM Visit or Traffic Restriction
        sim_delay = round(12.0 * req.delay_multiplier, 1)
        return {
            "scenario": "VIP Visit / Road Restriction Simulation",
            "affected_corridor": f"{rid} - {r_meta.get('route_name', rid)}",
            "traffic_delay_multiplier": f"+{(req.delay_multiplier - 1.0)*100:.0f}%",
            "projected_headway_delay": f"{sim_delay} minutes",
            "bunching_risk_elevation": "HIGH (Headway decay probability elevated to ~85%)",
            "recommended_dispatch_mitigation": "Hold departures at origin terminal by 4 minutes to prevent in-transit vehicle clustering.",
            "data_isolation_notice": "Simulation calculation only."
        }

    else:
        # Scenario D: Operationally Constrained Routes
        return {
            "scenario": "Operationally Constrained Routes Audit",
            "route": f"{rid} - {r_meta.get('route_name', rid)}",
            "minimum_service_limit": r_meta.get("minimum_service_bus_count", 2),
            "base_fleet": r_meta.get("base_buses", 5),
            "constraint_assessment": "This corridor is restricted from releasing vehicles during peak hours because doing so would breach the statutory minimum service frequency.",
            "feasible_alternative": "Maintain static schedule; deploy depot reserve only if demand surpasses 150% capacity."
        }

# ---------------------------------------------------------
# 7. SERVE STATIC ASSETS & FRONTEND
# ---------------------------------------------------------
os.makedirs(os.path.join(BASE_DIR, "static"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "static", "css"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "static", "js"), exist_ok=True)

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

@app.get("/")
def serve_dashboard():
    return FileResponse(os.path.join(BASE_DIR, "static", "index.html"))

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
