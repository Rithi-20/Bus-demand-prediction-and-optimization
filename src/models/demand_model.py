"""
Passenger Demand Forecasting Model.
Random Forest Regressor to predict next-hour passenger demand on transit corridors.
"""

from typing import Dict, Any, Tuple
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from config.settings import RANDOM_SEED, MODEL_PATHS
from src.features.feature_engineering import prepare_demand_dataset, build_preprocessor
from src.utils.logging_config import get_logger

logger = get_logger("DemandModel")

def train_demand_model() -> Tuple[Pipeline, Dict[str, Any]]:
    """Train Random Forest Regressor for next-hour passenger demand forecasting."""
    X_train, y_train, X_test, y_test, num_features, cat_features, cutoff_date = prepare_demand_dataset()
    
    preprocessor = build_preprocessor(num_features, cat_features)
    
    rf_reg = RandomForestRegressor(
        n_estimators=100,
        max_depth=15,
        min_samples_leaf=2,
        random_state=RANDOM_SEED,
        n_jobs=-1
    )
    
    pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("regressor", rf_reg)
    ])
    
    logger.info("Fitting Passenger Demand Random Forest Regressor...")
    pipeline.fit(X_train, y_train)
    
    # Predict on test set
    y_pred = pipeline.predict(X_test)
    
    mae = float(mean_absolute_error(y_test, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    r2 = float(r2_score(y_test, y_pred))
    
    # Baseline comparison: predicting next hour using current hour passenger count
    y_baseline = X_test["passenger_count_synthetic"]
    base_mae = float(mean_absolute_error(y_test, y_baseline))
    base_rmse = float(np.sqrt(mean_squared_error(y_test, y_baseline)))
    base_r2 = float(r2_score(y_test, y_baseline))
    
    mae_improvement_pct = float(((base_mae - mae) / base_mae) * 100) if base_mae > 0 else 0.0
    rmse_improvement_pct = float(((base_rmse - rmse) / base_rmse) * 100) if base_rmse > 0 else 0.0

    # Feature importances
    onehot_features = []
    if hasattr(pipeline.named_steps["preprocessor"].named_transformers_["cat"], "named_steps"):
        onehot = pipeline.named_steps["preprocessor"].named_transformers_["cat"].named_steps["onehot"]
        if hasattr(onehot, "get_feature_names_out"):
            onehot_features = list(onehot.get_feature_names_out(cat_features))
            
    all_transformed_features = num_features + onehot_features
    importances = pipeline.named_steps["regressor"].feature_importances_
    
    feature_importance_dict = {}
    if len(all_transformed_features) == len(importances):
        feature_importance_dict = {feat: float(imp) for feat, imp in zip(all_transformed_features, importances)}
        feature_importance_dict = dict(sorted(feature_importance_dict.items(), key=lambda x: x[1], reverse=True)[:15])

    metrics = {
        "model_type": "RandomForestRegressor",
        "cutoff_date": cutoff_date,
        "train_samples": int(len(X_train)),
        "test_samples": int(len(X_test)),
        "mae": mae,
        "rmse": rmse,
        "r2": r2,
        "baseline_mae": base_mae,
        "baseline_rmse": base_rmse,
        "baseline_r2": base_r2,
        "mae_improvement_pct": mae_improvement_pct,
        "rmse_improvement_pct": rmse_improvement_pct,
        "top_feature_importance": feature_importance_dict,
        "numeric_features": num_features,
        "categorical_features": cat_features
    }
    
    logger.info(
        f"Demand Model Evaluation -> MAE: {mae:.4f} (Base: {base_mae:.4f}), "
        f"RMSE: {rmse:.4f} (Base: {base_rmse:.4f}), R2: {r2:.4f} (Base: {base_r2:.4f})"
    )
    
    return pipeline, metrics

def save_demand_model(pipeline: Pipeline, metadata: Dict[str, Any]) -> None:
    """Persist demand model pipeline and metadata."""
    joblib.dump(pipeline, MODEL_PATHS["demand_model"])
    import json
    with open(MODEL_PATHS["demand_metadata"], "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    logger.info(f"Demand model saved to {MODEL_PATHS['demand_model']}")

def load_demand_model() -> Tuple[Pipeline, Dict[str, Any]]:
    """Load persisted demand model pipeline and metadata."""
    if not MODEL_PATHS["demand_model"].exists() or not MODEL_PATHS["demand_metadata"].exists():
        raise FileNotFoundError("Demand model artifact not found. Please run train_models.py first.")
    pipeline = joblib.load(MODEL_PATHS["demand_model"])
    import json
    with open(MODEL_PATHS["demand_metadata"], "r", encoding="utf-8") as f:
        metadata = json.load(f)
    return pipeline, metadata
