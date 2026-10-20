"""
Dynamic Bus Reallocation Optimizer.
Uses Google OR-Tools Mixed-Integer Linear Programming (MILP) with SciPy fallback.
Enforces fleet conservation, minimum service levels, integer constraints, and shortage minimization.
"""

from typing import List, Dict, Any, Optional
import numpy as np
from config.settings import OPTIMIZATION_CONFIG
from src.optimization.constraints import RouteAllocationInput, AllocationResult
from src.utils.logging_config import get_logger

logger = get_logger("AllocationOptimizer")

try:
    from ortools.linear_solver import pywraplp
    OR_TOOLS_AVAILABLE = True
except ImportError:
    OR_TOOLS_AVAILABLE = False
    logger.warning("Google OR-Tools not available. Will use SciPy / Analytical solver.")

def optimize_bus_allocation(
    inputs: List[RouteAllocationInput],
    total_fleet_limit: Optional[int] = None,
    conserve_exact_fleet: bool = True,
    shortage_penalty: float = OPTIMIZATION_CONFIG["shortage_penalty"],
    deviation_penalty: float = OPTIMIZATION_CONFIG["deviation_penalty"],
    bus_usage_cost: float = OPTIMIZATION_CONFIG["bus_usage_cost"]
) -> AllocationResult:
    """
    Solve integer bus allocation optimization.
    
    Inputs:
    - inputs: List of RouteAllocationInput with route demand, capacity, current buses, min service
    - total_fleet_limit: Total buses available to allocate across all routes. If None, sum(current_buses).
    - conserve_exact_fleet: If True, sum(allocated) must equal total_fleet_limit. If False, sum(allocated) <= total_fleet_limit.
    """
    if not inputs:
        return AllocationResult(
            success=False,
            status_message="No route inputs provided.",
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
    
    current_fleet_sum = sum(r.current_buses for r in inputs)
    fleet_limit = total_fleet_limit if total_fleet_limit is not None else current_fleet_sum
    min_service_sum = sum(r.minimum_service_buses for r in inputs)
    
    # Check Infeasibility: Available fleet cannot even satisfy minimum service
    if fleet_limit < min_service_sum:
        err_msg = (
            f"INFEASIBLE SCENARIO: Total available fleet ({fleet_limit} buses) is less than the "
            f"combined minimum service requirement ({min_service_sum} buses) across all {len(inputs)} routes."
        )
        logger.warning(err_msg)
        return AllocationResult(
            success=False,
            status_message=err_msg,
            solver_name="Pre-check",
            total_fleet_available=fleet_limit,
            total_fleet_allocated=0,
            fleet_conserved=False,
            total_demand=sum(r.predicted_demand for r in inputs),
            total_shortage_before=sum(max(0.0, r.predicted_demand - r.current_buses * r.bus_capacity) for r in inputs),
            total_shortage_after=0.0,
            shortage_reduction=0.0,
            total_buses_shifted=0,
            route_allocations=[],
            warnings=["Fleet limit is strictly below required minimum service levels."]
        )
    
    # Attempt OR-Tools MILP Solver
    if OR_TOOLS_AVAILABLE:
        try:
            return _solve_ortools_milp(
                inputs=inputs,
                fleet_limit=fleet_limit,
                conserve_exact_fleet=conserve_exact_fleet,
                shortage_penalty=shortage_penalty,
                deviation_penalty=deviation_penalty,
                bus_usage_cost=bus_usage_cost
            )
        except Exception as e:
            logger.warning(f"OR-Tools MILP failed ({e}). Falling back to proportional optimizer.")
    
    # Fallback to Analytical / Largest-Remainder optimizer
    return _solve_largest_remainder(
        inputs=inputs,
        fleet_limit=fleet_limit,
        conserve_exact_fleet=conserve_exact_fleet
    )

def _solve_ortools_milp(
    inputs: List[RouteAllocationInput],
    fleet_limit: int,
    conserve_exact_fleet: bool,
    shortage_penalty: float,
    deviation_penalty: float,
    bus_usage_cost: float
) -> AllocationResult:
    """Solve using OR-Tools CBC/SCIP Mixed-Integer Linear Program."""
    # Create solver
    solver = pywraplp.Solver.CreateSolver("CBC")
    if not solver:
        solver = pywraplp.Solver.CreateSolver("SCIP")
    if not solver:
        raise RuntimeError("Could not initialize CBC or SCIP solver in OR-Tools.")
    
    n = len(inputs)
    x = {}      # Integer bus allocation
    s = {}      # Shortage
    dev = {}    # Schedule deviation (|x - current|)
    
    for i, r in enumerate(inputs):
        x[i] = solver.IntVar(r.minimum_service_buses, r.max_buses_allowed, f"buses_{r.route_id}")
        s[i] = solver.NumVar(0.0, solver.infinity(), f"shortage_{r.route_id}")
        dev[i] = solver.NumVar(0.0, solver.infinity(), f"dev_{r.route_id}")
        
        # Shortage constraint: s[i] >= demand - capacity * x[i]
        solver.Add(s[i] >= r.predicted_demand - (r.bus_capacity * x[i]))
        
        # Absolute deviation constraints: dev[i] >= x[i] - current, dev[i] >= current - x[i]
        solver.Add(dev[i] >= x[i] - r.current_buses)
        solver.Add(dev[i] >= r.current_buses - x[i])
        
    # Fleet constraint
    total_allocated_expr = solver.Sum([x[i] for i in range(n)])
    if conserve_exact_fleet:
        solver.Add(total_allocated_expr == fleet_limit)
    else:
        solver.Add(total_allocated_expr <= fleet_limit)
        
    # Objective function
    objective = solver.Objective()
    for i in range(n):
        objective.SetCoefficient(s[i], shortage_penalty)
        objective.SetCoefficient(dev[i], deviation_penalty)
        objective.SetCoefficient(x[i], bus_usage_cost)
    objective.SetMinimization()
    
    status = solver.Solve()
    
    if status not in [pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE]:
        err_msg = f"OR-Tools could not find a feasible solution (status code {status})."
        logger.warning(err_msg)
        return AllocationResult(
            success=False,
            status_message=err_msg,
            solver_name="OR-Tools MILP",
            total_fleet_available=fleet_limit,
            total_fleet_allocated=0,
            fleet_conserved=False,
            total_demand=sum(r.predicted_demand for r in inputs),
            total_shortage_before=sum(max(0.0, r.predicted_demand - r.current_buses * r.bus_capacity) for r in inputs),
            total_shortage_after=0.0,
            shortage_reduction=0.0,
            total_buses_shifted=0,
            route_allocations=[],
            warnings=["Solver returned non-optimal/infeasible status."]
        )
    
    # Collect results and build output table
    alloc_records = []
    total_allocated = 0
    total_demand = 0.0
    total_shortage_before = 0.0
    total_shortage_after = 0.0
    total_shifted = 0
    
    for i, r in enumerate(inputs):
        rec_buses = int(round(x[i].solution_value()))
        delta = rec_buses - r.current_buses
        
        cap_before = r.current_buses * r.bus_capacity
        cap_after = rec_buses * r.bus_capacity
        
        shortage_before = max(0.0, r.predicted_demand - cap_before)
        shortage_after = max(0.0, r.predicted_demand - cap_after)
        
        util_before = (r.predicted_demand / cap_before * 100.0) if cap_before > 0 else 0.0
        util_after = (r.predicted_demand / cap_after * 100.0) if cap_after > 0 else 0.0
        
        total_allocated += rec_buses
        total_demand += r.predicted_demand
        total_shortage_before += shortage_before
        total_shortage_after += shortage_after
        total_shifted += abs(delta)
        
        alloc_records.append({
            "route_id": r.route_id,
            "corridor_name": r.corridor_name,
            "current_buses": r.current_buses,
            "recommended_buses": rec_buses,
            "reallocation_delta": delta,
            "predicted_demand": round(r.predicted_demand, 1),
            "capacity_before": cap_before,
            "capacity_after": cap_after,
            "shortage_before": round(shortage_before, 1),
            "shortage_after": round(shortage_after, 1),
            "utilization_before_pct": round(util_before, 1),
            "utilization_after_pct": round(util_after, 1),
            "minimum_service": r.minimum_service_buses,
            "status_note": "Added" if delta > 0 else ("Reduced" if delta < 0 else "Unchanged")
        })
        
    fleet_conserved = (total_allocated == fleet_limit)
    shortage_reduction = max(0.0, total_shortage_before - total_shortage_after)
    
    return AllocationResult(
        success=True,
        status_message="Optimal integer allocation found successfully.",
        solver_name="Google OR-Tools MILP (CBC)",
        total_fleet_available=fleet_limit,
        total_fleet_allocated=total_allocated,
        fleet_conserved=fleet_conserved,
        total_demand=round(total_demand, 1),
        total_shortage_before=round(total_shortage_before, 1),
        total_shortage_after=round(total_shortage_after, 1),
        shortage_reduction=round(shortage_reduction, 1),
        total_buses_shifted=total_shifted // 2,
        route_allocations=alloc_records,
        objective_value=float(solver.Objective().Value())
    )

def _solve_largest_remainder(
    inputs: List[RouteAllocationInput],
    fleet_limit: int,
    conserve_exact_fleet: bool
) -> AllocationResult:
    """Analytical largest-remainder algorithm that strictly guarantees integer fleet conservation."""
    n = len(inputs)
    allocated = {i: r.minimum_service_buses for i, r in enumerate(inputs)}
    remaining_buses = fleet_limit - sum(allocated.values())
    
    if remaining_buses > 0:
        # Calculate unserved demand after minimum service
        shortfalls = [
            max(0.0, inputs[i].predicted_demand - allocated[i] * inputs[i].bus_capacity)
            for i in range(n)
        ]
        sum_shortfall = sum(shortfalls)
        
        if sum_shortfall > 0:
            raw_shares = [remaining_buses * (sf / sum_shortfall) for sf in shortfalls]
            integer_shares = [int(np.floor(s)) for s in raw_shares]
            remainders = [raw_shares[i] - integer_shares[i] for i in range(n)]
            
            for i in range(n):
                allocated[i] += integer_shares[i]
                
            leftover = remaining_buses - sum(integer_shares)
            # Allocate leftover by largest remainder
            ranked_indices = sorted(range(n), key=lambda idx: remainders[idx], reverse=True)
            for k in range(leftover):
                allocated[ranked_indices[k % n]] += 1
        else:
            # Distribute leftover evenly or preserve current
            for k in range(remaining_buses):
                allocated[k % n] += 1
                
    alloc_records = []
    total_allocated = 0
    total_demand = 0.0
    total_shortage_before = 0.0
    total_shortage_after = 0.0
    total_shifted = 0
    
    for i, r in enumerate(inputs):
        rec_buses = int(allocated[i])
        delta = rec_buses - r.current_buses
        
        cap_before = r.current_buses * r.bus_capacity
        cap_after = rec_buses * r.bus_capacity
        
        shortage_before = max(0.0, r.predicted_demand - cap_before)
        shortage_after = max(0.0, r.predicted_demand - cap_after)
        
        util_before = (r.predicted_demand / cap_before * 100.0) if cap_before > 0 else 0.0
        util_after = (r.predicted_demand / cap_after * 100.0) if cap_after > 0 else 0.0
        
        total_allocated += rec_buses
        total_demand += r.predicted_demand
        total_shortage_before += shortage_before
        total_shortage_after += shortage_after
        total_shifted += abs(delta)
        
        alloc_records.append({
            "route_id": r.route_id,
            "corridor_name": r.corridor_name,
            "current_buses": r.current_buses,
            "recommended_buses": rec_buses,
            "reallocation_delta": delta,
            "predicted_demand": round(r.predicted_demand, 1),
            "capacity_before": cap_before,
            "capacity_after": cap_after,
            "shortage_before": round(shortage_before, 1),
            "shortage_after": round(shortage_after, 1),
            "utilization_before_pct": round(util_before, 1),
            "utilization_after_pct": round(util_after, 1),
            "minimum_service": r.minimum_service_buses,
            "status_note": "Added" if delta > 0 else ("Reduced" if delta < 0 else "Unchanged")
        })
        
    return AllocationResult(
        success=True,
        status_message="Allocation computed using proportional Largest-Remainder algorithm.",
        solver_name="Proportional Largest-Remainder",
        total_fleet_available=fleet_limit,
        total_fleet_allocated=total_allocated,
        fleet_conserved=(total_allocated == fleet_limit),
        total_demand=round(total_demand, 1),
        total_shortage_before=round(total_shortage_before, 1),
        total_shortage_after=round(total_shortage_after, 1),
        shortage_reduction=round(max(0.0, total_shortage_before - total_shortage_after), 1),
        total_buses_shifted=total_shifted // 2,
        route_allocations=alloc_records
    )
