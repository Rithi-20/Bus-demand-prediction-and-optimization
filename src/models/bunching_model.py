"""
Bus Bunching Early Warning Model.
Random Forest Classifier to predict bunching risk on trips/route-hours.
"""

from typing import Dict, Any, Tuple
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report
)
from config.settings import RANDOM_SEED, MODEL_PATHS
from src.features.feature_engineering import prepare_bunching_dataset, build_preprocessor
from src.utils.logging_config import get_logger

logger = get_logger("BunchingModel")

def train_bunching_model(level: str = "route_hour") -> Tuple[Pipeline, Dict[str, Any]]:
    """Train Random Forest Classifier for bus bunching risk."""
    X_train, y_train, X_test, y_test, num_features, cat_features, cutoff_date = prepare_bunching_dataset(level=level)
    
    preprocessor = build_preprocessor(num_features, cat_features)
    
    rf_clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=12,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=RANDOM_SEED,
        n_jobs=-1
    )
    
    pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("classifier", rf_clf)
    ])
    
    logger.info("Fitting Bus Bunching Random Forest Classifier...")
    pipeline.fit(X_train, y_train)
    
    # Predict on test set
    y_pred = pipeline.predict(X_test)
    y_prob = pipeline.predict_proba(X_test)[:, 1] if hasattr(pipeline, "predict_proba") else None
    
    acc = float(accuracy_score(y_test, y_pred))
    prec = float(precision_score(y_test, y_pred, zero_division=0))
    rec = float(recall_score(y_test, y_pred, zero_division=0))
    f1 = float(f1_score(y_test, y_pred, zero_division=0))
    cm = confusion_matrix(y_test, y_pred).tolist()
    
    auc = None
    if y_prob is not None and len(np.unique(y_test)) > 1:
        auc = float(roc_auc_score(y_test, y_prob))
        
    class_report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    
    # Feature importances
    onehot_features = []
    if hasattr(pipeline.named_steps["preprocessor"].named_transformers_["cat"], "named_steps"):
        onehot = pipeline.named_steps["preprocessor"].named_transformers_["cat"].named_steps["onehot"]
        if hasattr(onehot, "get_feature_names_out"):
            onehot_features = list(onehot.get_feature_names_out(cat_features))
    
    all_transformed_features = num_features + onehot_features
    importances = pipeline.named_steps["classifier"].feature_importances_
    
    feature_importance_dict = {}
    if len(all_transformed_features) == len(importances):
        feature_importance_dict = {feat: float(imp) for feat, imp in zip(all_transformed_features, importances)}
        # Sort descending
        feature_importance_dict = dict(sorted(feature_importance_dict.items(), key=lambda x: x[1], reverse=True)[:15])

    metrics = {
        "model_type": "RandomForestClassifier",
        "level": level,
        "cutoff_date": cutoff_date,
        "train_samples": int(len(X_train)),
        "test_samples": int(len(X_test)),
        "test_positive_count": int((y_test == 1).sum()),
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "roc_auc": auc,
        "confusion_matrix": cm,
        "classification_report": class_report,
        "top_feature_importance": feature_importance_dict,
        "numeric_features": num_features,
        "categorical_features": cat_features
    }
    
    logger.info(
        f"Bunching Model Evaluation -> Accuracy: {acc:.4f}, Precision: {prec:.4f}, "
        f"Recall: {rec:.4f}, F1: {f1:.4f}, ROC-AUC: {auc if auc else 'N/A'}"
    )
    
    return pipeline, metrics

def save_bunching_model(pipeline: Pipeline, metadata: Dict[str, Any]) -> None:
    """Persist bunching model pipeline and metadata."""
    joblib.dump(pipeline, MODEL_PATHS["bunching_model"])
    import json
    with open(MODEL_PATHS["bunching_metadata"], "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    logger.info(f"Bunching model saved to {MODEL_PATHS['bunching_model']}")

def load_bunching_model() -> Tuple[Pipeline, Dict[str, Any]]:
    """Load persisted bunching model pipeline and metadata."""
    if not MODEL_PATHS["bunching_model"].exists() or not MODEL_PATHS["bunching_metadata"].exists():
        raise FileNotFoundError("Bunching model artifact not found. Please run train_models.py first.")
    pipeline = joblib.load(MODEL_PATHS["bunching_model"])
    import json
    with open(MODEL_PATHS["bunching_metadata"], "r", encoding="utf-8") as f:
        metadata = json.load(f)
    return pipeline, metadata
