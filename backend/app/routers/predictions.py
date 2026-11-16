"""Public, rate-limited property price estimates from the NCR model."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .. import ratelimit
from ..predictor import service


router = APIRouter(prefix="/predictions", tags=["Price predictions"])
logger = logging.getLogger("gratia.predictions")


class PropertyPredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    location: str = Field(min_length=2, max_length=80)
    locality: str = Field(min_length=1, max_length=100)
    property_type: str = Field(min_length=2, max_length=60)
    area: float = Field(gt=0, le=100_000)
    bedrooms: float = Field(ge=0, le=20)
    bathrooms: float = Field(ge=0, le=20)
    floor: float = Field(default=0, ge=0, le=200)
    total_floors: float = Field(default=0, ge=0, le=200)
    property_age: float = Field(default=0, ge=0, le=200)
    parking: float = Field(default=0, ge=0, le=50)
    lift: str = Field(default="No", max_length=30)
    furnishing: str = Field(default="Unfurnished", max_length=60)
    facing: str = Field(default="North", max_length=40)
    balcony: float = Field(default=0, ge=0, le=50)
    amenities: str = Field(default="", max_length=500)
    amenities_count: float = Field(default=0, ge=0, le=100)
    gated_community: str = Field(default="No", max_length=30)
    security: str = Field(default="No", max_length=30)
    power_backup: str = Field(default="No", max_length=30)
    water_supply: str = Field(default="24x7", max_length=60)
    property_status: str = Field(default="Ready to Move", max_length=60)
    metro_distance: float = Field(default=0, ge=0, le=500)
    school_distance: float = Field(default=0, ge=0, le=500)
    hospital_distance: float = Field(default=0, ge=0, le=500)
    main_road_distance: float = Field(default=0, ge=0, le=500)


@router.get("/health")
def prediction_health():
    try:
        metrics = service.get_options()["metrics"]
        return {"status": "ready", "model_version": metrics["version"], "sample_count": metrics["sample_count"]}
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/options")
def prediction_options():
    try:
        return service.get_options()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/metrics")
def prediction_metrics():
    try:
        return service.get_options()["metrics"]
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/feature-importance")
def feature_importance():
    try:
        return {"success": True, "feature_importance": service.get_metadata()["feature_importance"]}
    except (RuntimeError, KeyError) as error:
        raise HTTPException(status_code=503, detail="Model insights are unavailable.") from error


@router.post("")
def create_prediction(payload: PropertyPredictionRequest, request: Request):
    try:
        ratelimit.hit(f"price-predict:{ratelimit.client_ip(request)}", limit=20, window_seconds=600)
        data = payload.model_dump()
        options = service.get_options()
        if data["location"] not in options["options"]["location"]:
            raise HTTPException(status_code=422, detail="Choose a city supported by the current training data.")
        localities = options["localities_by_location"].get(data["location"], [])
        if data["locality"] not in localities:
            raise HTTPException(status_code=422, detail="Choose a locality listed for the selected city.")
        if data["property_type"] not in options["options"]["property_type"]:
            raise HTTPException(status_code=422, detail="Choose a property type supported by the model.")
        result = service.predict(data)
        result["created_at"] = datetime.now(timezone.utc)
        return result
    except HTTPException:
        raise
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        logger.exception("Price prediction failed")
        raise HTTPException(status_code=500, detail="Could not calculate this estimate. Please try again.") from error
