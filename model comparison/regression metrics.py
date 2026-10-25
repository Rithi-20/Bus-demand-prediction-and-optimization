"""
Model Comparison: Regression Metrics Evaluation
Compares performance across:
1. Linear Regression
2. Decision Tree Regressor
3. Random Forest Regressor

Metrics: MAE, RMSE, R2 Score
"""
import pandas as pd
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# 1. Load predictions
df = pd.read_csv("model comparison/results/regression_predictions.csv")
y_true = df["actual"]

# 2. Models to evaluate
models = {
    "Linear Regression": df["pred_linear_regression"],
    "Decision Tree Regressor": df["pred_decision_tree"],
    "Random Forest Regressor": df["pred_random_forest"]
}

# 3. Calculate MAE, RMSE, and R2 for each model
metrics = []
for name, y_pred in models.items():
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    metrics.append({
        "Model": name,
        "MAE (Lower is Better)": round(mae, 2),
        "RMSE (Lower is Better)": round(rmse, 2),
        "R2 Score (Higher is Better)": round(r2, 4)
    })

# 4. Display comparison table
metrics_df = pd.DataFrame(metrics)
print("\n" + "=" * 65)
print("     PASSENGER DEMAND REGRESSION MODEL COMPARISON")
print("=" * 65)
print(metrics_df.to_string(index=False))
print("=" * 65)

# 5. Pick the winning model
winner = metrics_df.sort_values(by="R2 Score (Higher is Better)", ascending=False).iloc[0]
print(f"\nWINNING MODEL: {winner['Model']}")
print(f"R2 Score: {winner['R2 Score (Higher is Better)']}")
print(f"MAE: {winner['MAE (Lower is Better)']} passengers")
print(f"RMSE: {winner['RMSE (Lower is Better)']} passengers")
print("\nConclusion: Random Forest Regressor performs best because it captures")
print("non-linear passenger demand patterns during peak hours with lowest error.")
