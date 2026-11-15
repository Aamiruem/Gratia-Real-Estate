"""First-party website analytics.

POST /analytics/events   the browser sends events (only after the visitor accepts
                         analytics cookies). No names, phone numbers or emails.
GET  /admin/analytics    staff dashboard summary.
"""

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from .. import ratelimit
from ..database import get_db
from ..models import AnalyticsEvent, Lead, User
from ..permissions import require_any_staff

router = APIRouter(tags=["Analytics"])

EVENT_NAMES = {
    "page_view", "property_view", "search", "enquiry_click", "lead_submit", "whatsapp_click",
    "call_click", "email_click", "share", "install_click", "app_install", "notification_optin",
}
SOURCES = {"organic", "direct", "social", "referral", "paid", "email", "whatsapp", "app"}
ID = re.compile(r"^[A-Za-z0-9_-]{8,40}$")
SAFE = re.compile(r"[^\w\s./:#?&=%+,@-]", re.UNICODE)


class EventIn(BaseModel):
    name: str = Field(max_length=40)
    path: str = Field(default="", max_length=300)
    property_slug: Optional[str] = Field(default=None, max_length=150)
    detail: str = Field(default="", max_length=120)

    @field_validator("path", "detail")
    @classmethod
    def strip_unsafe(cls, value: str) -> str:
        # Drop query strings from paths (they may carry personal data) and odd characters.
        return SAFE.sub("", value.split("?")[0])[:300]


class EventBatch(BaseModel):
    visitor_id: str = Field(max_length=40)
    session_id: str = Field(max_length=40)
    source: str = Field(default="direct", max_length=40)
    referrer_host: str = Field(default="", max_length=120)
    device: str = Field(default="", max_length=10)
    events: list[EventIn] = Field(max_length=25)


@router.post("/analytics/events", status_code=status.HTTP_204_NO_CONTENT)
async def collect(request: Request, db: Session = Depends(get_db)):
    # navigator.sendBeacon posts text/plain, so parse the body ourselves.
    raw = await request.body()
    if len(raw) > 20_000:
        raise HTTPException(status_code=413, detail="Too large")
    try:
        batch = EventBatch(**json.loads(raw or b"{}"))
    except (ValueError, ValidationError, TypeError):
        raise HTTPException(status_code=422, detail="Invalid analytics payload")
    if not (ID.match(batch.visitor_id) and ID.match(batch.session_id)):
        raise HTTPException(status_code=422, detail="Invalid ids")
    ratelimit.hit(f"analytics:{ratelimit.client_ip(request)}", limit=300, window_seconds=600)

    source = batch.source if batch.source in SOURCES else "referral"
    device = batch.device if batch.device in {"mobile", "tablet", "desktop"} else ""
    referrer = re.sub(r"[^a-z0-9.-]", "", batch.referrer_host.lower())[:120]
    for event in batch.events:
        if event.name not in EVENT_NAMES:
            continue
        db.add(
            AnalyticsEvent(
                name=event.name,
                path=event.path,
                property_slug=(event.property_slug or None) and re.sub(r"[^a-z0-9-]", "", event.property_slug)[:150],
                source=source,
                referrer_host=referrer,
                visitor_id=batch.visitor_id,
                session_id=batch.session_id,
                device=device,
                detail=event.detail,
            )
        )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


@router.get("/admin/analytics")
def summary(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    _staff: User = Depends(require_any_staff),
):
    since = _since(days)
    events = select(AnalyticsEvent).where(AnalyticsEvent.created_at >= since).subquery()
    page_views = select(events).where(events.c.name == "page_view").subquery()

    def scalar(query):
        return db.scalar(query) or 0

    totals = {
        "visitors": scalar(select(func.count(distinct(events.c.visitor_id)))),
        "sessions": scalar(select(func.count(distinct(events.c.session_id)))),
        "page_views": scalar(select(func.count()).select_from(page_views)),
        "leads": scalar(select(func.count()).where(Lead.created_at >= since)),
    }
    totals["conversion_rate"] = round(100 * totals["leads"] / totals["sessions"], 1) if totals["sessions"] else 0

    day = func.date(events.c.created_at)
    trend_rows = db.execute(
        select(day, func.count(distinct(events.c.visitor_id)), func.count(distinct(events.c.session_id)))
        .group_by(day)
        .order_by(day)
    ).all()
    lead_day = func.date(Lead.created_at)
    leads_by_day = dict(
        (str(d), c) for d, c in db.execute(select(lead_day, func.count()).where(Lead.created_at >= since).group_by(lead_day)).all()
    )
    trend = [{"date": str(d), "visitors": v, "sessions": s, "leads": leads_by_day.get(str(d), 0)} for d, v, s in trend_rows]

    sources = db.execute(
        select(events.c.source, func.count(distinct(events.c.session_id))).group_by(events.c.source).order_by(func.count(distinct(events.c.session_id)).desc())
    ).all()
    referrers = db.execute(
        select(events.c.referrer_host, func.count(distinct(events.c.session_id)))
        .where(events.c.referrer_host != "")
        .group_by(events.c.referrer_host)
        .order_by(func.count(distinct(events.c.session_id)).desc())
        .limit(10)
    ).all()
    top_pages = db.execute(
        select(page_views.c.path, func.count()).group_by(page_views.c.path).order_by(func.count().desc()).limit(10)
    ).all()
    top_properties = db.execute(
        select(events.c.property_slug, func.count())
        .where(events.c.name == "property_view", events.c.property_slug.is_not(None))
        .group_by(events.c.property_slug)
        .order_by(func.count().desc())
        .limit(10)
    ).all()
    interactions = dict(db.execute(select(events.c.name, func.count()).group_by(events.c.name)).all())
    devices = dict(
        db.execute(select(events.c.device, func.count(distinct(events.c.session_id))).group_by(events.c.device)).all()
    )
    searches = db.execute(
        select(events.c.detail, func.count())
        .where(events.c.name == "search", events.c.detail != "")
        .group_by(events.c.detail)
        .order_by(func.count().desc())
        .limit(10)
    ).all()
    lead_sources = db.execute(
        select(func.coalesce(Lead.source, "unknown"), func.count()).where(Lead.created_at >= since).group_by(Lead.source)
    ).all()

    return {
        "days": days,
        "totals": totals,
        "trend": trend,
        "sources": [{"source": s, "sessions": c} for s, c in sources],
        "referrers": [{"host": h, "sessions": c} for h, c in referrers],
        "top_pages": [{"path": p, "views": c} for p, c in top_pages],
        "top_properties": [{"slug": p, "views": c} for p, c in top_properties],
        "interactions": interactions,
        "devices": {k or "unknown": v for k, v in devices.items()},
        "searches": [{"query": q, "count": c} for q, c in searches],
        "lead_sources": [{"source": s, "leads": c} for s, c in lead_sources],
    }
