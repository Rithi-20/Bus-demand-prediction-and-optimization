"""
Data loading module for Demand Based Public Transport Planning System.
Handles file loading with validation and caching.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional
import pandas as pd
from config.settings import FILES
from src.utils.logging_config import get_logger

logger = get_logger("DataLoader")

_DATA_CACHE: Dict[str, Any] = {}

def load_csv(file_key: str, use_cache: bool = True) -> pd.DataFrame:
    """Load a CSV dataset by key with caching."""
    if use_cache and file_key in _DATA_CACHE:
        return _DATA_CACHE[file_key]
    
    file_path = FILES.get(file_key)
    if not file_path or not Path(file_path).exists():
        raise FileNotFoundError(f"Dataset key '{file_key}' not found at path: {file_path}")
    
    logger.info(f"Loading {file_key} from {file_path}...")
    df = pd.read_csv(file_path)
    if use_cache:
        _DATA_CACHE[file_key] = df
    return df

def load_routes(use_cache: bool = True) -> pd.DataFrame:
    return load_csv("routes", use_cache)

def load_seasonal_scenarios(use_cache: bool = True) -> pd.DataFrame:
    return load_csv("seasonal", use_cache)

def load_disruption_scenarios(use_cache: bool = True) -> pd.DataFrame:
    return load_csv("disruption", use_cache)

def load_trips(use_cache: bool = True) -> pd.DataFrame:
    return load_csv("trips", use_cache)

def load_hourly_demand(use_cache: bool = True) -> pd.DataFrame:
    return load_csv("demand", use_cache)

def load_model_data(use_cache: bool = True) -> pd.DataFrame:
    return load_csv("model_data", use_cache)

def load_allocations(use_cache: bool = True) -> pd.DataFrame:
    return load_csv("allocation", use_cache)

def load_json(file_key: str) -> Dict[str, Any]:
    """Load a JSON metadata/documentation file."""
    file_path = FILES.get(file_key)
    if not file_path or not Path(file_path).exists():
        raise FileNotFoundError(f"JSON file '{file_key}' not found at {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_data_dictionary() -> Dict[str, Any]:
    return load_json("data_dict")

def load_validation_report() -> Dict[str, Any]:
    return load_json("validation_report")
