"""
Model Comparison: Bus Bunching Classification
Trains 3 Classification Models to predict bunching_label (0 = Normal, 1 = Bunching):
1. Logistic Regression
2. Decision Tree Classifier
3. Random Forest Classifier
"""
import os
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier

# 1. Load engineered dataset from cleaned_data
df = pd.read_csv("cleaned_data/trip_operations.csv", low_memory=False)

# 2. Select simple features and target
features = [
    "hour_int",
    "scheduled_headway_min",
    "actual_headway_min",
    "departure_delay_min",
    "headway_deviation_min",
    "headway_ratio"
]
target = "bunching_label"

X = df[features]
y = df[target]

print(f"Dataset ready: {X.shape[0]} samples, {X.shape[1]} features")
print(f"Class counts:\\n{y.value_counts()}")

# 3. Train-Test Split (80% train, 20% test with stratification)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)

# 4. Train Model 1: Logistic Regression (balanced class weight)
print("Training Logistic Regression...")
model_lr = LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42)
model_lr.fit(X_train, y_train)
pred_lr = model_lr.predict(X_test)
proba_lr = model_lr.predict_proba(X_test)[:, 1]

# 5. Train Model 2: Decision Tree Classifier (balanced class weight)
print("Training Decision Tree Classifier...")
model_dt = DecisionTreeClassifier(class_weight="balanced", max_depth=6, random_state=42)
model_dt.fit(X_train, y_train)
pred_dt = model_dt.predict(X_test)
proba_dt = model_dt.predict_proba(X_test)[:, 1]

# 6. Train Model 3: Random Forest Classifier (balanced class weight)
print("Training Random Forest Classifier...")
model_rf = RandomForestClassifier(n_estimators=100, max_depth=8, class_weight="balanced", random_state=42, n_jobs=-1)
model_rf.fit(X_train, y_train)
pred_rf = model_rf.predict(X_test)
proba_rf = model_rf.predict_proba(X_test)[:, 1]

# 7. Save test predictions for metrics comparison
os.makedirs("model comparison/results", exist_ok=True)
results = pd.DataFrame({
    "actual": y_test.values,
    "pred_logistic_regression": pred_lr,
    "proba_logistic_regression": proba_lr,
    "pred_decision_tree": pred_dt,
    "proba_decision_tree": proba_dt,
    "pred_random_forest": pred_rf,
    "proba_random_forest": proba_rf
})
results.to_csv("model comparison/results/classification_predictions.csv", index=False)
print("Saved predictions to 'model comparison/results/classification_predictions.csv'")
