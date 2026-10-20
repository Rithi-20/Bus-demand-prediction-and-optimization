"""
Scenario Simulation Engine for What-If Analysis.
Applies scenario multipliers, fleet adjustments, and disruptions, then invokes the optimizer.
"""

from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
from src.optimization.constraints import RouteAllocationInput, AllocationResult
from src.optimization.allocation_optimizer import optimize_bus_allocation
from src.data.load_data import load_seasonal_scenarios, load_disruption_scenarios
from src.utils.logging_config import get_logger

logger = get_logger("ScenarioSimulator")

def run_what_if_simulation(
    base_routes: List[Dict[str, Any]],
    demand_multiplier: float = 1.0,
    fleet_delta: int = 0,
    route_demand_multipliers: Optional[Dict[str, float]] = None,
    bus_breakdowns: Optional[Dict[str, int]] = None,
    active_seasonal_scenario: Optional[str] = None,
    active_disruption_scenario: Optional[str] = None,
    conserve_exact_fleet: bool = True
) -> AllocationResult:
    """
    Run what-if simulation by applying scenario modifiers to route demand and fleet,
    then recalculating integer bus reallocation.
    """
    route_demand_multipliers = route_demand_multipliers or {}
    bus_breakdowns = bus_breakdowns or {}
    
    # 1. Calculate scenario multipliers from scenario reference tables
    seasonal_mult = 1.0
    if active_seasonal_scenario and active_seasonal_scenario != "None":
        df_seasonal = load_seasonal_scenarios()
        match = df_seasonal[df_seasonal["scenario_name"] == active_seasonal_scenario]
        if not match.empty:
            seasonal_mult = float(match.iloc[0]["synthetic_demand_multiplier_assumption"])
            
    disruption_mult = 1.0
    if active_disruption_scenario and active_disruption_scenario != "None":
        df_disrupt = load_disruption_scenarios()
        match = df_disrupt[df_disrupt["disruption_scenario"] == active_disruption_scenario]
        if not match.empty:
            disruption_mult = float(match.iloc[0]["demand_multiplier_synthetic"])
            
    # Combined multiplier with cap at 2.0 (per dataset design rules)
    combined_scenario_mult = min(2.0, seasonal_mult * disruption_mult)
    
    inputs: List[RouteAllocationInput] = []
    total_current_fleet = 0
    
    for r in base_routes:
        rid = r["route_id"]
        cname = r.get("corridor_name", rid)
        base_demand = float(r.get("predicted_demand", r.get("passenger_count_synthetic", 0)))
        current_buses = int(r.get("current_buses", r.get("current_buses_scheduled_synthetic", 1)))
        cap_per_bus = int(r.get("assumed_bus_capacity", 50))
        min_buses = int(r.get("minimum_service_buses", r.get("minimum_service_buses_assumed", 1)))
        
        # Apply multipliers
        route_mult = route_demand_multipliers.get(rid, 1.0)
        final_demand = base_demand * demand_multiplier * combined_scenario_mult * route_mult
        
        # Apply breakdown reductions
        down_buses = bus_breakdowns.get(rid, 0)
        adj_current_buses = max(min_buses, current_buses - down_buses)
        
        total_current_fleet += adj_current_buses
        
        inputs.append(RouteAllocationInput(
            route_id=rid,
            corridor_name=cname,
            current_buses=adj_current_buses,
            predicted_demand=final_demand,
            bus_capacity=cap_per_bus,
            minimum_service_buses=min_buses
        ))
        
    # Adjusted fleet limit
    target_fleet_limit = max(0, total_current_fleet + fleet_delta)
    
    logger.info(
        f"Simulating scenario: demand_mult={demand_multiplier}, combined_scenario={combined_scenario_mult:.2f}, "
        f"fleet_delta={fleet_delta}, total_fleet={target_fleet_limit}"
    )
    
    result = optimize_bus_allocation(
        inputs=inputs,
        total_fleet_limit=target_fleet_limit,
        conserve_exact_fleet=conserve_exact_fleet
    )
    
    return result
