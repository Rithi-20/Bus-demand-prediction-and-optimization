"""
Feature engineering and dataset preparation module for Demand Based Public Transport Planning System.
Enforces strict leakage prevention, chronological splitting, and robust preprocessing.
"""

from typing import Tuple, List, Dict, Any, Optional
import pandas as pd
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from config.settings import (
    CHRONOLOGICAL_SPLIT_RATIO,
    BUNCHING_FEATURES,
    BUNCHING_TARGET,
    ROUTE_HOUR_BUNCHING_FEATURES,
    ROUTE_HOUR_BUNCHING_TARGET,
    DEMAND_FEATURES,
    DEMAND_TARGET
)
from src.data.load_data import load_trips, load_model_data, load_routes
from src.utils.logging_config import get_logger

logger = get_logger("FeatureEngineering")

def get_chronological_split(
    df: pd.DataFrame, 
    date_col: str = "date", 
    split_ratio: float = CHRONOLOGICAL_SPLIT_RATIO
) -> Tuple[pd.DataFrame, pd.DataFrame, str]:
    """
    Split a DataFrame chronologically based on unique sorted dates.
    Returns (train_df, test_df, cutoff_date).
    """
    df = df.copy()
    unique_dates = sorted(df[date_col].dropna().unique())
    cutoff_idx = int(len(unique_dates) * split_ratio)
    cutoff_date = unique_dates[cutoff_idx]
    
    train_df = df[df[date_col] < cutoff_date].copy()
    test_df = df[df[date_col] >= cutoff_date].copy()
    
    logger.info(
        f"Chronological split at {cutoff_date}: Train rows={len(train_df)} ({len(train_df[date_col].unique())} days), "
        f"Test rows={len(test_df)} ({len(test_df[date_col].unique())} days)"
    )
    return train_df, test_df, str(cutoff_date)

def prepare_bunching_dataset(
    level: str = "route_hour"
) -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.Series, List[str], List[str], str]:
    """
    Prepare feature matrices and target vectors for Bus Bunching early warning.
    level: 'route_hour' (default, evaluates route-hour risk) or 'trip'.
    Strictly excludes actual headways and event counts to prevent leakage.
    """
    if level == "route_hour":
        df = load_model_data().copy()
        # Train and evaluate on route-hours where trips exist
        df = df[df["has_trip_in_hour_synthetic"] == 1].copy()
        target_col = ROUTE_HOUR_BUNCHING_TARGET
        features = ROUTE_HOUR_BUNCHING_FEATURES.copy()
    else:
        df = load_trips().copy()
        # Merge corridor context if missing
        routes_df = load_routes()
        if "corridor_type" not in df.columns:
            df = df.merge(routes_df[["route_id", "corridor_type"]], on="route_id", how="left")
        if "day_of_week" not in df.columns:
            df["day_of_week"] = pd.to_datetime(df["date"]).dt.day_name()
        if "month" not in df.columns:
            df["month"] = pd.to_datetime(df["date"]).dt.month
        if "is_weekend" not in df.columns:
            df["is_weekend"] = df["day_of_week"].isin(["Saturday", "Sunday"]).astype(int)
        target_col = BUNCHING_TARGET
        features = BUNCHING_FEATURES.copy()

    # Drop rows where target is NaN
    df = df.dropna(subset=[target_col]).copy()
    df[target_col] = df[target_col].astype(int)

    # Chronological Split
    train_df, test_df, cutoff_date = get_chronological_split(df, date_col="date")

    # Fill missing values in categorical / numeric features safely
    cat_features = [f for f in features if df[f].dtype == "object" or df[f].dtype == "string"]
    num_features = [f for f in features if f not in cat_features]

    X_train = train_df[features].copy()
    y_train = train_df[target_col].copy()
    X_test = test_df[features].copy()
    y_test = test_df[target_col].copy()

    logger.info(f"Bunching dataset prepared ({level}): X_train={X_train.shape}, X_test={X_test.shape}")
    return X_train, y_train, X_test, y_test, num_features, cat_features, cutoff_date

def prepare_demand_dataset() -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.Series, List[str], List[str], str]:
    """
    Prepare feature matrices and target vectors for Passenger Demand regression.
    Strictly excludes passenger_count_next_hour_synthetic from inputs.
    Excludes same-row left-behind count/flag to prevent data leakage.
    """
    df = load_model_data().copy()
    
    # Filter out rows missing next-hour target (hour 22 records)
    valid_mask = df[DEMAND_TARGET].notnull()
    df = df[valid_mask].copy()

    target_col = DEMAND_TARGET
    features = DEMAND_FEATURES.copy()

    train_df, test_df, cutoff_date = get_chronological_split(df, date_col="date")

    cat_features = [f for f in features if df[f].dtype == "object" or df[f].dtype == "string"]
    num_features = [f for f in features if f not in cat_features]

    X_train = train_df[features].copy()
    y_train = train_df[target_col].copy()
    X_test = test_df[features].copy()
    y_test = test_df[target_col].copy()

    logger.info(f"Demand dataset prepared: X_train={X_train.shape}, X_test={X_test.shape}")
    return X_train, y_train, X_test, y_test, num_features, cat_features, cutoff_date

def build_preprocessor(num_features: List[str], cat_features: List[str]) -> ColumnTransformer:
    """Build a reusable Scikit-learn ColumnTransformer."""
    numeric_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler())
    ])
    
    categorical_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="constant", fill_value="Unknown")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False))
    ])
    
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, num_features),
            ("cat", categorical_transformer, cat_features)
        ],
        remainder="drop"
    )
    return preprocessor
