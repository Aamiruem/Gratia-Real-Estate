"""Safe API-facing prediction service for the checked-in Gratia model artifact."""

from __future__ import annotations

import json
import threading
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "model" / "price_model.joblib"
METADATA_PATH = ROOT / "model" / "metadata.json"
_lock = threading.Lock()
_cached_model = None
_cached_mtime_ns = None


def _model_bundle():
    global _cached_model, _cached_mtime_ns
    import joblib

    try:
        current_mtime = MODEL_PATH.stat().st_mtime_ns
    except OSError as error:
        raise RuntimeError("Price prediction model is missing. Train the model before starting the backend.") from error
    if _cached_model is None or current_mtime != _cached_mtime_ns:
        with _lock:
            current_mtime = MODEL_PATH.stat().st_mtime_ns
            if _cached_model is None or current_mtime != _cached_mtime_ns:
                _cached_model = joblib.load(MODEL_PATH)
                _cached_mtime_ns = current_mtime
    return _cached_model


def get_metadata() -> dict:
    try:
        return json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("Price prediction metadata is unavailable.") from error


def get_options() -> dict:
    metadata = get_metadata()
    return {
        "success": True,
        "options": metadata["options"],
        "localities_by_location": metadata["localities_by_location"],
        "numeric_ranges": metadata["numeric_ranges"],
        "metrics": _public_metrics(metadata),
    }


def _public_metrics(metadata: dict) -> dict:
    return {
        "version": metadata["version"],
        "sample_count": metadata["sample_count"],
        "validation_rows": metadata["validation_rows"],
        "mae_inr": metadata["mae_inr"],
        "mape_pct": metadata["mape_pct"],
        "r2": metadata["r2"],
        "absolute_error_p90_pct": metadata["absolute_error_p90_pct"],
        "trained_at": metadata["trained_at"],
        "data_provenance": metadata["data_provenance"],
    }


def predict(property_data: dict) -> dict:
    import pandas as pd

    bundle = _model_bundle()
    metadata = get_metadata()
    row = {column: property_data[column] for column in bundle["features"]}
    prediction = max(0.0, float(bundle["pipeline"].predict(pd.DataFrame([row]))[0]))
    p90 = min(max(float(metadata["absolute_error_p90_pct"]) / 100, 0.0), 0.75)
    warnings = []
    locality_options = metadata["localities_by_location"].get(property_data["location"], [])
    if property_data["locality"] not in locality_options:
        warnings.append("This locality was not represented in the training data; estimate reliability may be lower.")
    for name, bounds in metadata["numeric_ranges"].items():
        value = float(property_data[name])
        if value < bounds["min"] or value > bounds["max"]:
            warnings.append(f"{name.replace('_', ' ').title()} is outside the training data range.")
    trained_categories = metadata["options"]
    for name, options in trained_categories.items():
        value = str(property_data[name])
        if value not in options:
            warnings.append(f"{name.replace('_', ' ').title()} was not represented in the training data.")

    return {
        "predicted_price": round(prediction, 2),
        "price_per_sqft": round(prediction / max(float(property_data["area"]), 1), 2),
        "min_price": round(max(0.0, prediction * (1 - p90)), 2),
        "max_price": round(prediction * (1 + p90), 2),
        "validation_error_p90_pct": round(p90 * 100, 2),
        "model_version": metadata["version"],
        "metrics": _public_metrics(metadata),
        "warnings": warnings,
    }
