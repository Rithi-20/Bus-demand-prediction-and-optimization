"""
Model Comparison: Passenger Demand Regression
Trains 3 Regression Models to predict next_hour_passenger_demand:
1. Linear Regression
2. Decision Tree Regressor
3. Random Forest Regressor
"""
import os
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor

# 1. Load engineered dataset from cleaned_data
df = pd.read_csv("cleaned_data/hourly_demand_operations.csv", low_memory=False)

# 2. Exclude rows where the target is unavailable (do not fill with zero or mean)
df = df.dropna(subset=["next_hour_passenger_demand"])

# 3. Select simple features and target
features = [
    "hour_int",
    "passenger_demand",
    "total_capacity",
    "capacity_shortage",
    "scheduled_bus_count",
    "available_bus_count",
    "scheduled_headway_min"
]
target = "next_hour_passenger_demand"

X = df[features]
y = df[target]

print(f"Dataset ready: {X.shape[0]} samples, {X.shape[1]} features")

# 4. Train-Test Split (80% train, 20% test)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42
)

# 5. Train Model 1: Linear Regression
print("Training Linear Regression...")
model_lr = LinearRegression()
model_lr.fit(X_train, y_train)
pred_lr = model_lr.predict(X_test)

# 6. Train Model 2: Decision Tree Regressor
print("Training Decision Tree Regressor...")
model_dt = DecisionTreeRegressor(max_depth=10, random_state=42)
model_dt.fit(X_train, y_train)
pred_dt = model_dt.predict(X_test)

# 7. Train Model 3: Random Forest Regressor
print("Training Random Forest Regressor...")
model_rf = RandomForestRegressor(n_estimators=100, max_depth=12, random_state=42, n_jobs=-1)
model_rf.fit(X_train, y_train)
pred_rf = model_rf.predict(X_test)

# 8. Save test predictions for metrics comparison
os.makedirs("model comparison/results", exist_ok=True)
results = pd.DataFrame({
    "actual": y_test.values,
    "pred_linear_regression": pred_lr,
    "pred_decision_tree": pred_dt,
    "pred_random_forest": pred_rf
})
results.to_csv("model comparison/results/regression_predictions.csv", index=False)
print("Saved predictions to 'model comparison/results/regression_predictions.csv'")
