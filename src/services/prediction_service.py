"""
Prediction Service for Demand Based Public Transport Planning System.
Connects trained ML pipelines to live inference queries for bunching and demand.
"""

from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np
from src.models.bunching_model import load_bunching_model
from src.models.demand_model import load_demand_model
from src.data.load_data import load_model_data, load_routes, load_trips
from config.settings import ROUTE_HOUR_BUNCHING_FEATURES, DEMAND_FEATURES
from src.utils.logging_config import get_logger

logger = get_logger("PredictionService")

_BUNCHING_PIPELINE = None
_BUNCHING_META = None
_DEMAND_PIPELINE = None
_DEMAND_META = None

def get_bunching_model():
    global _BUNCHING_PIPELINE, _BUNCHING_META
    if _BUNCHING_PIPELINE is None:
        _BUNCHING_PIPELINE, _BUNCHING_META = load_bunching_model()
    return _BUNCHING_PIPELINE, _BUNCHING_META

def get_demand_model():
    global _DEMAND_PIPELINE, _DEMAND_META
    if _DEMAND_PIPELINE is None:
        _DEMAND_PIPELINE, _DEMAND_META = load_demand_model()
    return _DEMAND_PIPELINE, _DEMAND_META

def predict_bunching_risk(features_df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
    """
    Predict bunching risk class (0 or 1) and risk probability [0.0, 1.0].
    """
    pipeline, _ = get_bunching_model()
    # Ensure all required features are present
    missing = [c for c in ROUTE_HOUR_BUNCHING_FEATURES if c not in features_df.columns]
    if missing:
        raise ValueError(f"Missing features for bunching model: {missing}")
    
    X = features_df[ROUTE_HOUR_BUNCHING_FEATURES].copy()
    preds = pipeline.predict(X)
    probs = pipeline.predict_proba(X)[:, 1] if hasattr(pipeline, "predict_proba") else np.zeros(len(X))
    return preds, probs

def predict_passenger_demand(features_df: pd.DataFrame) -> np.ndarray:
    """
    Predict next-hour passenger demand count.
    """
    pipeline, _ = get_demand_model()
    missing = [c for c in DEMAND_FEATURES if c not in features_df.columns]
    if missing:
        raise ValueError(f"Missing features for demand model: {missing}")
        
    X = features_df[DEMAND_FEATURES].copy()
    preds = pipeline.predict(X)
    return np.maximum(0.0, preds)  # Demand cannot be negative

def get_route_hour_summary(date_str: str, hour_val: int) -> pd.DataFrame:
    """
    Load data for a specific date and hour, generate bunching and demand predictions,
    and compute capacity shortages and utilization.
    """
    df_model = load_model_data()
    routes_df = load_routes()
    
    sub = df_model[(df_model["date"] == date_str) & (df_model["hour"] == hour_val)].copy()
    if sub.empty:
        return pd.DataFrame()
        
    # Demand predictions
    pred_demand = predict_passenger_demand(sub)
    sub["predicted_next_hour_demand"] = np.round(pred_demand, 1)
    
    # Capacity shortage calculations
    # Capacity is available capacity in that hour
    avail_cap = sub["total_capacity_available_synthetic"]
    sub["estimated_capacity_shortage"] = np.maximum(0.0, sub["predicted_next_hour_demand"] - avail_cap)
    sub["predicted_utilization_pct"] = np.where(
        avail_cap > 0,
        np.round((sub["predicted_next_hour_demand"] / avail_cap) * 100.0, 1),
        0.0
    )
    
    # Bunching predictions
    bunching_preds, bunching_probs = predict_bunching_risk(sub)
    sub["predicted_bunching_risk_flag"] = bunching_preds
    sub["predicted_bunching_prob"] = np.round(bunching_probs, 3)
    
    # Risk label mapping
    def map_risk(p):
        if p >= 0.65:
            return "High"
        elif p >= 0.35:
            return "Medium"
        return "Low"
    sub["bunching_risk_level"] = sub["predicted_bunching_prob"].apply(map_risk)
    
    # Merge corridor readable name
    if "corridor_name" not in sub.columns:
        context_map = routes_df.set_index("route_id").apply(
            lambda row: f"{row['origin_terminal_or_area']} -> {row['destination_terminal_or_area']} ({row['city_or_origin_city']})",
            axis=1
        ).to_dict()
        sub["corridor_name"] = sub["route_id"].map(context_map)
        
    return sub
