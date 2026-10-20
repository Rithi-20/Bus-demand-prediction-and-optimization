"""
Optimization Constraints and Validation Rules for Bus Reallocation.
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional

@dataclass
class RouteAllocationInput:
    route_id: str
    corridor_name: str
    current_buses: int
    predicted_demand: float
    bus_capacity: int = 50
    minimum_service_buses: int = 1
    max_buses_allowed: int = 30
    bunching_risk_prob: float = 0.0

@dataclass
class AllocationResult:
    success: bool
    status_message: str
    solver_name: str
    total_fleet_available: int
    total_fleet_allocated: int
    fleet_conserved: bool
    total_demand: float
    total_shortage_before: float
    total_shortage_after: float
    shortage_reduction: float
    total_buses_shifted: int
    route_allocations: List[Dict[str, Any]]
    objective_value: Optional[float] = None
    warnings: Optional[List[str]] = None
