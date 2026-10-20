TAMIL NADU SYNTHETIC TRANSPORT DATASET — CORRECTED V2

PURPOSE
A synthetic dataset for a Streamlit prototype with next-hour passenger-demand forecasting, simulated bus-bunching early warning, capacity-based left-behind estimates, and fleet-conserving bus reallocation.

IMPORTANT LIMITATION
All row-level passenger counts, delays, schedules, capacities, labels, scenario effects, and allocation outputs are synthetic. Real place names provide context only; the corridors are not verified official route numbers or official timetables. There is no live GPS or verified historical ridership data.

FILES
- tn_hourly_passenger_demand.csv: hourly synthetic demand by illustrative corridor.
- tn_route_hour_model_data.csv: next-hour demand target, integrated delay aggregates, bunching label, and capacity-based left-behind estimate.
- tn_trip_delay_scenarios.csv: synthetic trip departures/delays plus scheduled/actual headways and trip-level bunching labels.
- tn_allocation_scenarios.csv: fleet-conserving route-hour reallocation scenarios.
- tn_routes_context.csv: corridor context.
- seasonal_scenarios.csv and disruption_scenarios.csv: scenario windows and illustrative multipliers.
- VALIDATION_REPORT.json: automated checks and definitions.
- DATA_DICTIONARY.json: column names and inferred data types.
- SOURCES_AND_LIMITATIONS.txt: public context links and limitations.

TARGETS AND LOGIC
1. Main ML target: passenger_count_next_hour_synthetic. It is the next hour's passenger count on the same route and date. It is blank when no next-hour row is available; 22:00 is not linked to next day's 05:00.
2. Left-behind estimate: max(0, passenger_count_synthetic - total_capacity_available_synthetic). left_behind_flag_synthetic is 1 if this count is greater than zero. This is a derived capacity estimate, not an independently observed label. For a future prediction, forecast next-hour demand first, then compare it with planned capacity. Do not train a model to predict same-row derived left-behind counts from same-row passenger/capacity columns.
3. Bunching: a simulated trip is flagged if actual headway <= 15 minutes OR actual headway <= 50% of scheduled headway. Route-hour target is 1 if any trip scheduled in that hour has a flagged event. These are illustrative thresholds.
4. Trip delay integration: aggregate by date + route_id + scheduled departure hour. No-trip route-hours have trip_count=0; has_trip_in_hour_synthetic identifies them.
5. Bus allocation: for each date-hour, sum(recommended buses) equals sum(current scheduled buses). At least minimum service on each route is maintained; remaining buses are distributed by demand with largest-remainder rounding.
6. Scenario overlap: all active seasonal and disruption names are retained. Scenario effects for interactive what-if simulations combine multiplicatively, not additively, with a combined demand multiplier cap of 2.0. Dates with multiple active seasonal scenarios get a 10% additional synthetic stress factor in the base synthetic counts. Multiplier columns are illustrative assumptions for the simulator, not measured effects and not a claim that every row was regenerated from those multipliers.

MODELLING CAUTIONS
- Use chronological train/test splits.
- For demand forecasting, exclude passenger_count_next_hour_synthetic from inputs.
- Do not use left_behind_count_synthetic or left_behind_flag_synthetic as demand-model inputs.
- For bunching, exclude bunching_risk_label_synthetic and direct target-derived fields such as actual_headway_min_synthetic and bunching_event_count_synthetic from model inputs. Train/evaluate on rows with trips where appropriate.
- Use MAE/RMSE for demand regression. For bunching classification, report precision, recall, F1 and confusion matrix; accuracy alone is misleading with imbalanced labels.
- Synthetic-data metrics demonstrate the pipeline only and do not establish real-world accuracy.
