"""
FinSight Python ML Subprocess Service
Applied Machine Learning: Linear Regression Spending Forecasting & K-Means Behavioral Clustering.
Receives JSON payload via stdin and outputs structured JSON to stdout.
"""
import sys
import json
import numpy as np
from datetime import datetime
from collections import defaultdict
from sklearn.linear_model import LinearRegression
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

class Transaction:
    def __init__(self, data):
        self.type = str(data.get("type", "expense")).lower()
        try:
            self.amount = max(0.0, float(data.get("amount", 0.0)))
        except (ValueError, TypeError):
            self.amount = 0.0
        self.category_name = data.get("category_name")
        
        date_val = data.get("transaction_date")
        self.transaction_date = None
        if isinstance(date_val, str):
            try:
                # Parse 'YYYY-MM-DD' or ISO timestamp
                clean_date = date_val.split("T")[0].split(" ")[0].strip()
                self.transaction_date = datetime.strptime(clean_date, "%Y-%m-%d").date()
            except Exception:
                self.transaction_date = None
        elif hasattr(date_val, 'strftime'):
            self.transaction_date = date_val

    @property
    def is_valid(self):
        return self.transaction_date is not None and self.amount > 0

def train_spending_model(transactions):
    """
    Time-Series Monthly Spending Forecast with Time-Aware Out-of-Sample Holdout Evaluation.
    Prevents temporal data leakage and compares model against a naive persistence baseline.
    """
    valid_expenses = [t for t in transactions if t.is_valid and t.type == "expense"]
    if len(valid_expenses) < 3:
        return {
            "predicted_total": 0,
            "trend": "insufficient_data",
            "confidence": 0,
            "historical_months": 0,
            "evaluation": {
                "message": "At least 3 valid expense transactions across multiple months are required."
            }
        }

    monthly = defaultdict(float)
    for t in valid_expenses:
        key = t.transaction_date.strftime("%Y-%m")
        monthly[key] += t.amount

    sorted_months = sorted(monthly.keys())
    num_months = len(sorted_months)

    if num_months < 2:
        return {
            "predicted_total": 0,
            "trend": "insufficient_data",
            "confidence": 0,
            "historical_months": num_months,
            "evaluation": {
                "message": "Transactions span fewer than 2 distinct calendar months."
            }
        }

    X_all = np.arange(num_months).reshape(-1, 1)
    y_all = np.array([monthly[m] for m in sorted_months], dtype=float)

    # Time-Aware Holdout Evaluation (if at least 3 months available)
    evaluation_meta = {}
    if num_months >= 3:
        # Train on earlier months, test on most recent completed month
        X_train, y_train = X_all[:-1], y_all[:-1]
        X_test, y_test = X_all[-1:], y_all[-1:]

        eval_model = LinearRegression()
        eval_model.fit(X_train, y_train)
        y_test_pred = float(eval_model.predict(X_test)[0])

        model_test_mae = abs(y_test_pred - float(y_test[0]))
        # Naive persistence baseline: predict the immediate previous month's value
        naive_baseline_pred = float(y_train[-1])
        baseline_mae = abs(naive_baseline_pred - float(y_test[0]))

        evaluation_meta = {
            "evaluation_type": "time_aware_holdout",
            "train_months_count": num_months - 1,
            "test_month": sorted_months[-1],
            "model_holdout_mae": round(model_test_mae, 2),
            "baseline_holdout_mae": round(baseline_mae, 2),
            "baseline_comparison": "outperformed_baseline" if model_test_mae < baseline_mae else "comparable_to_baseline"
        }
    else:
        evaluation_meta = {
            "evaluation_type": "in_sample_only",
            "message": "Fewer than 3 calendar months available. Holdout evaluation omitted to prevent high variance."
        }

    # Full Model Fit for Upcoming Period Forecast
    full_model = LinearRegression()
    full_model.fit(X_all, y_all)
    predicted_raw = float(full_model.predict([[num_months]])[0])
    # Financial constraint: monthly expenditure cannot be negative
    predicted_bounded = max(0.0, predicted_raw)

    slope = float(full_model.coef_[0])
    mean_y = float(np.mean(y_all))

    if mean_y == 0:
        trend = "stable"
    elif slope > 0.05 * mean_y:
        trend = "rising"
    elif slope < -0.05 * mean_y:
        trend = "falling"
    else:
        trend = "stable"

    # Compute R^2 score bounded at 0
    try:
        r2 = max(0.0, float(full_model.score(X_all, y_all)))
    except Exception:
        r2 = 0.0

    return {
        "predicted_total": round(predicted_bounded, 2),
        "trend": trend,
        "confidence": round(r2, 2),
        "slope": round(slope, 2),
        "historical_months": num_months,
        "evaluation": evaluation_meta
    }

def cluster_transactions(transactions, n_clusters=3):
    """
    K-Means Behavioral Spending Clustering.
    Features: [transaction_amount, day_of_month, day_of_week, is_weekend].
    Standardized via StandardScaler with reproducible seed.
    """
    valid_expenses = [t for t in transactions if t.is_valid and t.type == "expense"]
    if len(valid_expenses) < n_clusters:
        return []

    features = []
    for t in valid_expenses:
        d = t.transaction_date
        features.append([
            float(t.amount),
            float(d.day),
            float(d.weekday()),
            1.0 if d.weekday() >= 5 else 0.0
        ])
    X = np.array(features, dtype=float)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X_scaled)

    clusters_map = {}
    for i, label in enumerate(labels):
        label_idx = int(label)
        if label_idx not in clusters_map:
            clusters_map[label_idx] = {"total": 0.0, "count": 0, "categories": set()}
        tx = valid_expenses[i]
        clusters_map[label_idx]["total"] += tx.amount
        clusters_map[label_idx]["count"] += 1
        if tx.category_name:
            clusters_map[label_idx]["categories"].add(str(tx.category_name))

    # Rank clusters by total amount descending
    sorted_clusters = sorted(clusters_map.items(), key=lambda x: x[1]["total"], reverse=True)

    cluster_names = {
        0: "High Spends",
        1: "Everyday Essentials",
        2: "Occasional",
    }

    results = []
    for rank, (orig_label, data) in enumerate(sorted_clusters):
        avg = data["total"] / data["count"] if data["count"] > 0 else 0.0
        label_name = cluster_names.get(rank, f"Cluster {rank + 1}")
        results.append({
            "cluster_id": rank,
            "name": label_name,
            "count": data["count"],
            "avg_amount": round(float(avg), 2),
            "total_amount": round(float(data["total"]), 2),
            "categories": sorted(list(data["categories"]))
        })

    return results

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data or not input_data.strip():
            print(json.dumps({"error": "No input received"}))
            return
        
        req = json.loads(input_data)
        mode = req.get("mode")
        raw_txs = req.get("transactions", [])
        
        if not isinstance(raw_txs, list):
            print(json.dumps({"error": "transactions must be a list"}))
            return

        transactions = [Transaction(t) for t in raw_txs if isinstance(t, dict)]
        
        if mode == "predict":
            result = train_spending_model(transactions)
        elif mode == "cluster":
            result = cluster_transactions(transactions)
        else:
            result = {"error": f"Invalid mode: {mode}"}
            
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
