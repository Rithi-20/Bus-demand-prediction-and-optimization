"""
Training Pipeline for Demand Based Public Transport Planning System.
Trains Bus Bunching Classifier and Passenger Demand Regressor,
evaluates both models chronologically, and persists models and reports.
"""

import json
from datetime import datetime
from config.settings import MODEL_PATHS, REPORTS_DIR
from src.models.bunching_model import train_bunching_model, save_bunching_model
from src.models.demand_model import train_demand_model, save_demand_model
from src.utils.logging_config import get_logger

logger = get_logger("TrainPipeline")

def run_training_pipeline() -> None:
    logger.info("=== STARTING MODEL TRAINING PIPELINE ===")
    start_time = datetime.now()
    
    # 1. Train Bus Bunching Early Warning Model
    logger.info("1/2: Training Bus Bunching Random Forest Classifier...")
    bunching_pipe, bunching_metrics = train_bunching_model(level="route_hour")
    save_bunching_model(bunching_pipe, bunching_metrics)
    
    # 2. Train Passenger Demand Forecasting Regressor
    logger.info("2/2: Training Passenger Demand Random Forest Regressor...")
    demand_pipe, demand_metrics = train_demand_model()
    save_demand_model(demand_pipe, demand_metrics)
    
    # 3. Save combined metrics report
    combined_report = {
        "timestamp": datetime.now().isoformat(),
        "elapsed_seconds": (datetime.now() - start_time).total_seconds(),
        "bunching_model": bunching_metrics,
        "demand_model": demand_metrics
    }
    
    with open(MODEL_PATHS["model_metrics"], "w", encoding="utf-8") as f:
        json.dump(combined_report, f, indent=2)
        
    logger.info(f"Combined evaluation metrics report saved to {MODEL_PATHS['model_metrics']}")
    logger.info("=== TRAINING PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_training_pipeline()
