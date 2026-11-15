"""Property listings.

Public:  GET /properties, GET /properties/{slug}           (published only)
Staff:   GET /admin/properties                             (all, incl. unpublished)
Manager: POST /admin/properties, PUT/DELETE /admin/properties/{id}

Publishing a listing, changing its price, availability or offer creates a real
public notification. If VERCEL_DEPLOY_HOOK_URL is set, the site is rebuilt so
the sitemap and search-engine pages include the change.
"""

import json
import logging
import re
import threading
import time
from datetime import datetime
from typing import Literal, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config, notifications
from ..database import get_db
from ..models import Property, User
from ..permissions import require_any_staff, require_manager

logger = logging.getLogger("gratia.properties")

public_router = APIRouter(prefix="/properties", tags=["Properties"])
admin_router = APIRouter(prefix="/admin/properties", tags=["Admin: properties"])

SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
AVAILABILITY_LABELS = {"available": "Available", "limited": "Limited units left", "sold_out": "Sold out"}


class PropertyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    developer: str
    location: str
    category: str
    type: str
    configuration: str
    status: str
    availability: str
    price: str
    price_min_cr: Optional[float]
    offer: str
    image: str
    gallery: list[str]
    description: str
    highlights: list[str]
    seo_title: str
    seo_description: str
    featured: bool
    published: bool
    sort_order: int
    updated_at: datetime


class PropertyWrite(BaseModel):
    slug: str = Field(min_length=2, max_length=150)
    name: str = Field(min_length=2, max_length=150)
    developer: str = Field(default="", max_length=150)
    location: str = Field(min_length=2, max_length=150)
    category: Literal["residential", "commercial"] = "residential"
    type: str = Field(default="Residential", max_length=80)
    configuration: str = Field(default="", max_length=120)
    status: str = Field(default="Launched", max_length=60)
    availability: Literal["available", "limited", "sold_out"] = "available"
    price: str = Field(default="Price on request", max_length=80)
    price_min_cr: Optional[float] = Field(default=None, ge=0, le=1000)
    offer: str = Field(default="", max_length=200)
    image: str = Field(default="", max_length=2000)
    gallery: list[str] = Field(default_factory=list, max_length=20)
    description: str = Field(default="", max_length=8000)
    highlights: list[str] = Field(default_factory=list, max_length=30)
    seo_title: str = Field(default="", max_length=160)
    seo_description: str = Field(default="", max_length=300)
    featured: bool = False
    published: bool = True
    sort_order: int = Field(default=0, ge=-10000, le=10000)

    @field_validator("slug")
    @classmethod
    def valid_slug(cls, value: str) -> str:
        value = value.strip().lower()
        if not SLUG.match(value):
            raise ValueError("Use lowercase letters, numbers and hyphens only, e.g. dlf-privana-north")
        return value

    @field_validator("image")
    @classmethod
    def valid_image(cls, value: str) -> str:
        if value and not (value.startswith("https://") or value.startswith("/")):
            raise ValueError("Image must be an https:// address or a path on this site")
        return value

    @field_validator("gallery")
    @classmethod
    def valid_gallery(cls, value: list[str]) -> list[str]:
        return [url.strip() for url in value if url.strip().startswith(("https://", "/"))]

    @field_validator("highlights")
    @classmethod
    def clean_highlights(cls, value: list[str]) -> list[str]:
        return [item.strip()[:80] for item in value if item.strip()]


# ---------- public ----------


@public_router.get("", response_model=list[PropertyOut])
def list_properties(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=60"
    return db.scalars(
        select(Property).where(Property.published.is_(True)).order_by(Property.sort_order, Property.id)
    ).all()


@public_router.get("/{slug}", response_model=PropertyOut)
def get_property(slug: str, db: Session = Depends(get_db)):
    item = db.scalar(select(Property).where(Property.slug == slug, Property.published.is_(True)))
    if item is None:
        raise HTTPException(status_code=404, detail="Property not found")
    return item


# ---------- admin ----------

_last_rebuild = 0.0
_rebuild_lock = threading.Lock()


def trigger_site_rebuild() -> None:
    """Asks Vercel to rebuild (fresh sitemap and SEO pages). At most once a minute."""
    global _last_rebuild
    hook = config.env("VERCEL_DEPLOY_HOOK_URL")
    if not hook.startswith("https://"):
        return
    with _rebuild_lock:
        if time.monotonic() - _last_rebuild < 60:
            return
        _last_rebuild = time.monotonic()
    try:
        with urlopen(Request(hook, data=b"", method="POST"), timeout=10):
            pass
    except (URLError, ValueError):
        logger.exception("Could not trigger the site rebuild")


def _events(before: dict | None, item: Property) -> list[tuple[str, str, str]]:
    """Real changes worth telling visitors about: (kind, title, body)."""
    if not item.published:
        return []
    where = f"{item.name}, {item.location}"
    if before is None or not before["published"]:
        return [("property.added", f"New property listed: {item.name}", f"{where}. {item.price}.")]
    events = []
    if item.price != before["price"]:
        events.append(("property.price", f"Price update: {item.name}", f"{where} is now {item.price}."))
    if item.availability != before["availability"] or item.status != before["status"]:
        label = AVAILABILITY_LABELS.get(item.availability, item.availability)
        events.append(("property.availability", f"Availability update: {item.name}", f"{item.status} · {label}."))
    if item.offer and item.offer != before["offer"]:
        events.append(("property.offer", f"New offer: {item.name}", item.offer))
    return events


def _snapshot(item: Property) -> dict:
    return {key: getattr(item, key) for key in ("published", "price", "availability", "status", "offer")}


def _save(item: Property, payload: PropertyWrite) -> None:
    for key, value in payload.model_dump().items():
        setattr(item, key, value)


def _announce(db: Session, background: BackgroundTasks, before: dict | None, item: Property) -> None:
    created = [
        notifications.create(db, audience="public", kind=kind, title=title, body=body, link=f"/projects/{item.slug}")
        for kind, title, body in _events(before, item)
    ]
    db.commit()
    notifications.dispatch(background, created)
    background.add_task(trigger_site_rebuild)


@admin_router.get("", response_model=list[PropertyOut])
def admin_list(db: Session = Depends(get_db), _staff: User = Depends(require_any_staff)):
    return db.scalars(select(Property).order_by(Property.sort_order, Property.id)).all()


@admin_router.post("", response_model=PropertyOut, status_code=status.HTTP_201_CREATED)
def create_property(
    payload: PropertyWrite,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    _manager: User = Depends(require_manager),
):
    if db.scalar(select(Property.id).where(Property.slug == payload.slug)):
        raise HTTPException(status_code=409, detail="Another property already uses this web address (slug).")
    item = Property()
    _save(item, payload)
    db.add(item)
    db.flush()
    _announce(db, background, None, item)
    db.refresh(item)
    return item


@admin_router.put("/{property_id}", response_model=PropertyOut)
def update_property(
    property_id: int,
    payload: PropertyWrite,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    _manager: User = Depends(require_manager),
):
    item = db.get(Property, property_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Property not found")
    clash = db.scalar(select(Property.id).where(Property.slug == payload.slug, Property.id != property_id))
    if clash:
        raise HTTPException(status_code=409, detail="Another property already uses this web address (slug).")
    before = _snapshot(item)
    _save(item, payload)
    db.flush()
    _announce(db, background, before, item)
    db.refresh(item)
    return item


@admin_router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(
    property_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    _manager: User = Depends(require_manager),
):
    item = db.get(Property, property_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Property not found")
    db.delete(item)
    db.commit()
    background.add_task(trigger_site_rebuild)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def seed_properties() -> None:
    """First start only: copies the website's original listings into the database."""
    from pathlib import Path

    from ..database import SessionLocal

    seed_file = Path(__file__).resolve().parents[1] / "data" / "properties_seed.json"
    with SessionLocal() as db:
        if db.scalar(select(Property.id).limit(1)) is not None or not seed_file.is_file():
            return
        for row in json.loads(seed_file.read_text(encoding="utf-8")):
            db.add(Property(**PropertyWrite(**row).model_dump()))
        db.commit()
