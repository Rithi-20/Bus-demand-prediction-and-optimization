"""
Data validation module for Demand Based Public Transport Planning System.
Validates raw datasets, verifies schemas, identifies primary keys, checks anomalies and consistency.
"""

import json
from pathlib import Path
from typing import Dict, Any, List
import pandas as pd
import numpy as np
from config.settings import FILES, REPORTS_DIR, MODEL_PATHS
from src.data.load_data import (
    load_routes, load_seasonal_scenarios, load_disruption_scenarios,
    load_trips, load_hourly_demand, load_model_data, load_allocations
)
from src.utils.logging_config import get_logger

logger = get_logger("DataValidator")

def inspect_and_validate_all() -> Dict[str, Any]:
    """Perform comprehensive inspection and validation across all CSV datasets."""
    report: Dict[str, Any] = {
        "status": "PASS",
        "datasets": {},
        "consistency_checks": {},
        "target_distributions": {},
        "anomalies_detected": []
    }
    
    datasets = {
        "tn_routes_context.csv": load_routes(use_cache=False),
        "seasonal_scenarios.csv": load_seasonal_scenarios(use_cache=False),
        "disruption_scenarios.csv": load_disruption_scenarios(use_cache=False),
        "tn_trip_delay_scenarios.csv": load_trips(use_cache=False),
        "tn_hourly_passenger_demand.csv": load_hourly_demand(use_cache=False),
        "tn_route_hour_model_data.csv": load_model_data(use_cache=False),
        "tn_allocation_scenarios.csv": load_allocations(use_cache=False)
    }
    
    for fname, df in datasets.items():
        n_rows, n_cols = df.shape
        dups = int(df.duplicated().sum())
        null_counts = {c: int(v) for c, v in df.isnull().sum().items() if v > 0}
        
        # Categorize column types
        num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        cat_cols = df.select_dtypes(include=["object", "string"]).columns.tolist()
        
        report["datasets"][fname] = {
            "row_count": n_rows,
            "col_count": n_cols,
            "duplicates": dups,
            "null_counts": null_counts,
            "numeric_columns": num_cols,
            "categorical_columns": cat_cols,
            "columns": list(df.columns)
        }
    
    # Consistency Checks
    df_routes = datasets["tn_routes_context.csv"]
    df_trips = datasets["tn_trip_delay_scenarios.csv"]
    df_demand = datasets["tn_hourly_passenger_demand.csv"]
    df_model = datasets["tn_route_hour_model_data.csv"]
    df_alloc = datasets["tn_allocation_scenarios.csv"]
    
    expected_routes = set(df_routes["route_id"].unique())
    routes_in_model = set(df_model["route_id"].unique())
    routes_in_alloc = set(df_alloc["route_id"].unique())
    routes_in_demand = set(df_demand["route_id"].unique())
    
    routes_match = (expected_routes == routes_in_model == routes_in_alloc == routes_in_demand)
    report["consistency_checks"]["route_ids_consistent"] = routes_match
    report["consistency_checks"]["total_unique_routes"] = len(expected_routes)
    
    if not routes_match:
        report["anomalies_detected"].append("Route ID mismatch across core datasets.")
    
    # Capacity consistency
    if (df_model["assumed_bus_capacity"] <= 0).any():
        report["anomalies_detected"].append("Found non-positive bus capacity in model data.")
    
    # Negative passenger counts check
    if (df_model["passenger_count_synthetic"] < 0).any():
        report["anomalies_detected"].append("Found negative passenger count in model data.")
    
    # Fleet conservation check on allocation dataset
    fleet_grouped = df_alloc.groupby(["date", "hour"])[["current_buses_scheduled_synthetic", "simulated_recommended_buses"]].sum()
    fleet_mismatches = int((fleet_grouped["current_buses_scheduled_synthetic"] != fleet_grouped["simulated_recommended_buses"]).sum())
    report["consistency_checks"]["fleet_conservation_mismatches"] = fleet_mismatches
    
    # Minimum service check on allocation dataset
    min_service_violations = int((df_alloc["simulated_recommended_buses"] < df_alloc["minimum_service_buses_assumed"]).sum())
    report["consistency_checks"]["minimum_service_violations"] = min_service_violations
    
    # Target Distributions
    # 1. Bunching
    bunching_counts = df_trips["bunching_event_label_synthetic"].value_counts().to_dict()
    report["target_distributions"]["bunching_event_label_trip"] = {
        "0": int(bunching_counts.get(0, 0)),
        "1": int(bunching_counts.get(1, 0)),
        "positive_rate": float(df_trips["bunching_event_label_synthetic"].mean())
    }
    
    # 2. Demand target (valid hours)
    valid_demand_rows = df_model.dropna(subset=["passenger_count_next_hour_synthetic"])
    report["target_distributions"]["passenger_count_next_hour"] = {
        "valid_count": int(len(valid_demand_rows)),
        "missing_count": int(df_model["passenger_count_next_hour_synthetic"].isnull().sum()),
        "mean": float(valid_demand_rows["passenger_count_next_hour_synthetic"].mean()),
        "std": float(valid_demand_rows["passenger_count_next_hour_synthetic"].std()),
        "min": float(valid_demand_rows["passenger_count_next_hour_synthetic"].min()),
        "max": float(valid_demand_rows["passenger_count_next_hour_synthetic"].max())
    }
    
    # 3. Left behind derived estimate
    left_behind_counts = df_model["left_behind_flag_synthetic"].value_counts().to_dict()
    report["target_distributions"]["left_behind_flag"] = {
        "0": int(left_behind_counts.get(0, 0)),
        "1": int(left_behind_counts.get(1, 0)),
        "positive_rate": float(df_model["left_behind_flag_synthetic"].mean())
    }
    
    # Save Report
    out_path = MODEL_PATHS["dataset_report"]
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    logger.info(f"Validation report saved to {out_path}")
    
    return report

if __name__ == "__main__":
    rep = inspect_and_validate_all()
    print("Dataset Validation Summary:")
    print(f"Total Datasets: {len(rep['datasets'])}")
    print(f"Route consistency: {rep['consistency_checks']['route_ids_consistent']}")
    print(f"Fleet conservation mismatches: {rep['consistency_checks']['fleet_conservation_mismatches']}")
    print(f"Bunching positive rate (trips): {rep['target_distributions']['bunching_event_label_trip']['positive_rate']:.4%}")
    print(f"Passenger demand target mean: {rep['target_distributions']['passenger_count_next_hour']['mean']:.2f}")
