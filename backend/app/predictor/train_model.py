"""Train and evaluate the Gratia NCR price estimate model.

Run from backend with the backend environment: python -m app.predictor.train_model
The held-out validation metrics are saved alongside the model and are never
described as a guarantee of an individual property's market value.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "property_data.csv"
MODEL_PATH = ROOT / "model" / "price_model.joblib"
OPTIONS_PATH = ROOT / "model" / "metadata.json"
VERSION = "gratia-ncr-random-forest-v1"

NUMERIC = [
    "area", "bedrooms", "bathrooms", "floor", "total_floors", "property_age",
    "parking", "balcony", "amenities_count", "metro_distance", "school_distance",
    "hospital_distance", "main_road_distance",
]
CATEGORICAL = [
    "location", "locality", "property_type", "lift", "furnishing", "facing",
    "amenities", "gated_community", "security", "power_backup", "water_supply",
    "property_status",
]
FEATURES = CATEGORICAL[:3] + NUMERIC + CATEGORICAL[3:]
TARGET = "price"


def main() -> None:
    frame = pd.read_csv(DATA_PATH)
    missing = sorted(set(FEATURES + [TARGET]) - set(frame.columns))
    if missing:
        raise ValueError(f"Training data is missing required columns: {', '.join(missing)}")
    frame = frame[FEATURES + [TARGET]].copy()
    frame[TARGET] = pd.to_numeric(frame[TARGET], errors="coerce")
    for column in NUMERIC:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame = frame.dropna(subset=[TARGET])
    if len(frame) < 100:
        raise ValueError("At least 100 priced records are required for a holdout evaluation.")
    for column in CATEGORICAL:
        frame[column] = frame[column].fillna("Unknown").astype(str).str.strip()
    frame = frame.drop_duplicates().reset_index(drop=True)

    x_train, x_test, y_train, y_test = train_test_split(
        frame[FEATURES], frame[TARGET], test_size=0.2, random_state=42,
    )
    transformer = ColumnTransformer(
        transformers=[
            ("numeric", SimpleImputer(strategy="median"), NUMERIC),
            ("categorical", Pipeline([
                ("imputer", SimpleImputer(strategy="constant", fill_value="Unknown")),
                ("onehot", OneHotEncoder(handle_unknown="ignore")),
            ]), CATEGORICAL),
        ],
        remainder="drop",
    )
    pipeline = Pipeline([
        ("preprocessor", transformer),
        ("model", RandomForestRegressor(
            n_estimators=160,
            max_depth=18,
            min_samples_leaf=2,
            max_features=1.0,
            random_state=42,
            n_jobs=-1,
        )),
    ])
    pipeline.fit(x_train, y_train)
    predictions = np.maximum(pipeline.predict(x_test), 0)
    absolute_pct_errors = np.abs(predictions - y_test.to_numpy()) / np.maximum(y_test.to_numpy(), 1)

    feature_names = pipeline.named_steps["preprocessor"].get_feature_names_out()
    importances = pipeline.named_steps["model"].feature_importances_
    top_features = sorted(
        ({"feature": str(name), "importance": float(value)} for name, value in zip(feature_names, importances)),
        key=lambda item: item["importance"], reverse=True,
    )[:30]
    options = {
        column: sorted(frame[column].dropna().astype(str).unique().tolist())
        for column in CATEGORICAL if column != "locality"
    }
    localities: dict[str, list[str]] = {}
    for city, group in frame.groupby("location"):
        localities[str(city)] = sorted(group["locality"].dropna().astype(str).unique().tolist())
    metrics = {
        "version": VERSION,
        "sample_count": int(len(frame)),
        "training_rows": int(len(x_train)),
        "validation_rows": int(len(x_test)),
        "mae_inr": float(mean_absolute_error(y_test, predictions)),
        "rmse_inr": float(np.sqrt(mean_squared_error(y_test, predictions))),
        "mape_pct": float(mean_absolute_percentage_error(y_test, predictions) * 100),
        "r2": float(r2_score(y_test, predictions)),
        "absolute_error_p90_pct": float(np.quantile(absolute_pct_errors, 0.9) * 100),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "data_provenance": "Repository-supplied CSV; no source/date metadata provided.",
        "numeric_ranges": {
            column: {"min": float(frame[column].min()), "max": float(frame[column].max())}
            for column in NUMERIC if frame[column].notna().any()
        },
        "options": options,
        "localities_by_location": localities,
        "feature_importance": top_features,
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": pipeline, "features": FEATURES, "metrics": metrics}, MODEL_PATH, compress=3)
    OPTIONS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps({key: metrics[key] for key in (
        "version", "sample_count", "training_rows", "validation_rows", "mae_inr",
        "rmse_inr", "mape_pct", "r2", "absolute_error_p90_pct", "trained_at",
    )}, indent=2))
    print(f"Model: {MODEL_PATH}")


if __name__ == "__main__":
    main()
