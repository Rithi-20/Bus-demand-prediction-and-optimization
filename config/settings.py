"""
Demand Based Public Transport Planning System Configuration and Settings
Central configuration for data paths, models, optimization parameters, and features.
"""

import os
from pathlib import Path

# Base Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
MODELS_DIR = PROJECT_ROOT / "models"
REPORTS_DIR = PROJECT_ROOT / "reports"

# Ensure directories exist
MODELS_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

# Dataset filenames
FILES = {
    "routes": DATA_DIR / "tn_routes_context.csv",
    "seasonal": DATA_DIR / "seasonal_scenarios.csv",
    "disruption": DATA_DIR / "disruption_scenarios.csv",
    "trips": DATA_DIR / "tn_trip_delay_scenarios.csv",
    "demand": DATA_DIR / "tn_hourly_passenger_demand.csv",
    "model_data": DATA_DIR / "tn_route_hour_model_data.csv",
    "allocation": DATA_DIR / "tn_allocation_scenarios.csv",
    "data_dict": DATA_DIR / "DATA_DICTIONARY.json",
    "validation_report": DATA_DIR / "VALIDATION_REPORT.json"
}

# Model artifacts
MODEL_PATHS = {
    "bunching_model": MODELS_DIR / "bunching_rf_classifier.joblib",
    "bunching_metadata": MODELS_DIR / "bunching_metadata.json",
    "demand_model": MODELS_DIR / "demand_rf_regressor.joblib",
    "demand_metadata": MODELS_DIR / "demand_metadata.json",
    "model_metrics": REPORTS_DIR / "model_evaluation_metrics.json",
    "dataset_report": REPORTS_DIR / "dataset_inspection_report.json"
}

# Train/Test Split Settings
CHRONOLOGICAL_SPLIT_RATIO = 0.80  # 80% train, 20% test chronologically
RANDOM_SEED = 42

# Features for Bus Bunching Classifier
# Strictly excluding post-event outcomes (actual_headway_min_synthetic, bunching_event_count_synthetic, etc.)
BUNCHING_FEATURES = [
    "route_id",
    "hour",
    "day_of_week",
    "month",
    "is_weekend",
    "peak_period_flag_synthetic",
    "scheduled_headway_min_synthetic",
    "seasonal_scenario_name",
    "disruption_scenario_name",
    "corridor_type"
]
BUNCHING_TARGET = "bunching_event_label_synthetic"

# Route-Hour Bunching Features (for route-hour model)
ROUTE_HOUR_BUNCHING_FEATURES = [
    "route_id",
    "hour",
    "day_of_week",
    "month",
    "is_weekend",
    "mean_scheduled_headway_min_synthetic",
    "min_scheduled_headway_min_synthetic",
    "buses_scheduled_synthetic",
    "trip_count_synthetic",
    "seasonal_scenario_name",
    "disruption_scenario_name",
    "corridor_type"
]
ROUTE_HOUR_BUNCHING_TARGET = "bunching_risk_label_synthetic"

# Features for Passenger Demand Regressor
# Strictly excluding future labels and same-row left_behind estimates
DEMAND_FEATURES = [
    "route_id",
    "hour",
    "day_of_week",
    "month",
    "is_weekend",
    "corridor_type",
    "passenger_count_synthetic",  # current hour demand
    "buses_scheduled_synthetic",
    "assumed_bus_capacity",
    "total_capacity_available_synthetic",
    "seasonal_scenario_name",
    "disruption_scenario_name",
    "active_seasonal_scenario_count_synthetic"
]
DEMAND_TARGET = "passenger_count_next_hour_synthetic"

# Optimization Defaults
OPTIMIZATION_CONFIG = {
    "shortage_penalty": 10.0,     # High penalty for each passenger capacity shortfall
    "deviation_penalty": 1.0,     # Penalty for reallocating away from baseline schedule
    "bus_usage_cost": 0.1,        # Slight cost per bus deployed
    "default_capacity_per_bus": 50,
    "max_demand_multiplier_cap": 2.0
}
