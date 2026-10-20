"""
Input validation utilities for Demand Based Public Transport Planning System.
"""

from typing import Any, Dict, List
import pandas as pd
import numpy as np

def validate_non_negative_int(val: Any, field_name: str, min_val: int = 0) -> int:
    """Validate that value is an integer >= min_val."""
    try:
        ival = int(val)
        if ival < min_val:
            raise ValueError(f"{field_name} must be >= {min_val}, got {ival}")
        return ival
    except (ValueError, TypeError) as e:
        raise ValueError(f"Invalid integer for {field_name}: {val} ({e})")

def validate_float_range(val: Any, field_name: str, min_val: float, max_val: float) -> float:
    """Validate that a float falls within [min_val, max_val]."""
    try:
        fval = float(val)
        if not (min_val <= fval <= max_val):
            raise ValueError(f"{field_name} must be between {min_val} and {max_val}, got {fval}")
        return fval
    except (ValueError, TypeError) as e:
        raise ValueError(f"Invalid float for {field_name}: {val} ({e})")

def validate_dataframe_columns(df: pd.DataFrame, required_cols: List[str], df_name: str = "DataFrame") -> None:
    """Check that dataframe contains required columns."""
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"{df_name} is missing required columns: {missing}")
