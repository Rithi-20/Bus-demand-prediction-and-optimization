"""
Allocation Service for Demand Based Public Transport Planning System.
Connects predicted demand to bus reallocation optimization and scenario simulation.
"""

from typing import Dict, Any, List, Optional
import pandas as pd
from src.services.prediction_service import get_route_hour_summary
from src.optimization.scenario_simulator import run_what_if_simulation
from src.optimization.constraints import AllocationResult
from src.data.load_data import load_allocations
from src.utils.logging_config import get_logger

logger = get_logger("AllocationService")

def get_reallocation_for_date_hour(
    date_str: str,
    hour_val: int,
    demand_multiplier: float = 1.0,
    fleet_delta: int = 0,
    route_demand_multipliers: Optional[Dict[str, float]] = None,
    bus_breakdowns: Optional[Dict[str, int]] = None,
    active_seasonal_scenario: Optional[str] = None,
    active_disruption_scenario: Optional[str] = None,
    conserve_exact_fleet: bool = True
) -> AllocationResult:
    """
    Generate dynamic bus reallocation for a date and hour using predicted demand.
    """
    # 1. Fetch current summary and predicted demand
    summary_df = get_route_hour_summary(date_str, hour_val)
    if summary_df.empty:
        return AllocationResult(
            success=False,
            status_message=f"No route records found for {date_str} hour {hour_val}:00.",
            solver_name="None",
            total_fleet_available=0,
            total_fleet_allocated=0,
            fleet_conserved=False,
            total_demand=0.0,
            total_shortage_before=0.0,
            total_shortage_after=0.0,
            shortage_reduction=0.0,
            total_buses_shifted=0,
            route_allocations=[]
        )
        
    # Also fetch minimum service info from allocation reference if needed
    df_alloc = load_allocations()
    alloc_sub = df_alloc[(df_alloc["date"] == date_str) & (df_alloc["hour"] == hour_val)]
    min_service_map = dict(zip(alloc_sub["route_id"], alloc_sub["minimum_service_buses_assumed"])) if not alloc_sub.empty else {}

    base_routes = []
    for _, row in summary_df.iterrows():
        rid = row["route_id"]
        base_routes.append({
            "route_id": rid,
            "corridor_name": row.get("corridor_name", rid),
            "predicted_demand": float(row["predicted_next_hour_demand"]),
            "passenger_count_synthetic": float(row["passenger_count_synthetic"]),
            "current_buses": int(row["buses_scheduled_synthetic"]),
            "assumed_bus_capacity": int(row["assumed_bus_capacity"]),
            "minimum_service_buses": min_service_map.get(rid, 1)
        })
        
    result = run_what_if_simulation(
        base_routes=base_routes,
        demand_multiplier=demand_multiplier,
        fleet_delta=fleet_delta,
        route_demand_multipliers=route_demand_multipliers,
        bus_breakdowns=bus_breakdowns,
        active_seasonal_scenario=active_seasonal_scenario,
        active_disruption_scenario=active_disruption_scenario,
        conserve_exact_fleet=conserve_exact_fleet
    )
    
    return result
