"""Lead generation: website enquiry forms and property-visit management.

Public:  POST /leads                  save an enquiry, returns its reference (e.g. GE-261115-7KQ2M)
Owner:   GET  /leads                  list / filter / search
         GET  /leads/stats            counts for the dashboard
         GET  /leads/export.csv       spreadsheet export
         GET  /leads/{reference}      one lead
         PATCH /leads/{reference}     update status, notes or visit time
"""

import csv
import io
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import notifications, ratelimit
from ..database import get_db
from ..models import Lead, User
from .videos import require_video_admin

router = APIRouter(prefix="/leads", tags=["Leads"])

LeadKind = Literal["contact", "visit", "callback", "property_enquiry", "consultation", "whatsapp"]
APPOINTMENT_KINDS = {"visit", "consultation"}
LEAD_STATUSES = ("new", "contacted", "qualified", "converted", "lost")
VISIT_STATUSES = ("requested", "confirmed", "rescheduled", "completed", "cancelled", "no_show")

KIND_TITLES = {
    "contact": "New customer enquiry received",
    "visit": "New property viewing request",
    "callback": "Customer requested a callback",
    "property_enquiry": "New property enquiry",
    "consultation": "New appointment scheduled",
    "whatsapp": "New lead generated (WhatsApp)",
}

DUPLICATE_WINDOW = timedelta(minutes=30)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # no 0/O, 1/I


def clean(value: Optional[str], limit: int) -> Optional[str]:
    if value is None:
        return None
    value = _CONTROL.sub("", value).strip()
    return value[:limit] or None


def normalize_phone(raw: str) -> str:
    """Indian mobiles become +91XXXXXXXXXX; other countries need a leading +."""
    has_plus = raw.strip().startswith("+")
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    elif has_plus and 10 <= len(digits) <= 15 and not digits.startswith("91"):
        return f"+{digits}"
    if len(digits) == 10 and digits[0] in "6789":
        return f"+91{digits}"
    raise ValueError("Enter a valid 10-digit mobile number (or include the country code with +).")


class LeadCreate(BaseModel):
    kind: LeadKind
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=10, max_length=20)
    email: Optional[EmailStr] = None
    property_slug: Optional[str] = Field(default=None, max_length=150)
    property_name: Optional[str] = Field(default=None, max_length=150)
    location: Optional[str] = Field(default=None, max_length=150)
    budget: Optional[str] = Field(default=None, max_length=60)
    property_type: Optional[str] = Field(default=None, max_length=80)
    visit_date: Optional[date] = None
    visit_time: Optional[str] = Field(default=None, max_length=60)
    visitors: Optional[str] = Field(default=None, max_length=30)
    contact_method: Optional[str] = Field(default=None, max_length=20)
    message: str = Field(default="", max_length=2000)
    source_page: Optional[str] = Field(default=None, max_length=200)
    # Honeypot: hidden from people, bots tend to fill it.
    website: Optional[str] = Field(default=None, max_length=200)

    @field_validator("email", mode="before")
    @classmethod
    def empty_email(cls, value):
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = clean(value, 80) or ""
        if len(value) < 2 or not re.search(r"[^\W\d_]", value):
            raise ValueError("Please enter your name.")
        return value

    @field_validator("phone")
    @classmethod
    def valid_phone(cls, value: str) -> str:
        return normalize_phone(value)


class LeadCreated(BaseModel):
    reference: str
    kind: str
    status: str
    duplicate: bool = False
    created_at: datetime


class LeadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    reference: str
    kind: str
    status: str
    name: str
    phone: str
    email: Optional[str]
    property_slug: Optional[str]
    property_name: Optional[str]
    location: Optional[str]
    budget: Optional[str]
    property_type: Optional[str]
    visit_date: Optional[date]
    visit_time: Optional[str]
    visitors: Optional[str]
    contact_method: Optional[str]
    message: str
    source_page: Optional[str]
    owner_notes: str
    created_at: datetime
    updated_at: datetime


class LeadList(BaseModel):
    items: list[LeadResponse]
    total: int


class LeadUpdate(BaseModel):
    status: Optional[str] = Field(default=None, max_length=20)
    owner_notes: Optional[str] = Field(default=None, max_length=5000)
    visit_date: Optional[date] = None
    visit_time: Optional[str] = Field(default=None, max_length=60)


def new_reference(db: Session) -> str:
    stamp = datetime.now(timezone.utc).strftime("%y%m%d")
    for _ in range(10):
        reference = f"GE-{stamp}-{''.join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(5))}"
        if not db.scalar(select(Lead.id).where(Lead.reference == reference)):
            return reference
    raise HTTPException(status_code=500, detail="Could not create a lead reference. Please try again.")


def _summary(lead: Lead) -> str:
    parts = [f"{lead.name} ({lead.phone})"]
    if lead.property_name:
        parts.append(lead.property_name)
    if lead.visit_date:
        parts.append(lead.visit_date.strftime("%d %b %Y") + (f", {lead.visit_time}" if lead.visit_time else ""))
    elif lead.budget:
        parts.append(lead.budget)
    return " · ".join(parts)


@router.post("", response_model=LeadCreated, status_code=status.HTTP_201_CREATED)
def create_lead(
    payload: LeadCreate,
    request: Request,
    response: Response,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    ip = ratelimit.client_ip(request)
    ratelimit.hit(f"lead-ip-10m:{ip}", limit=6, window_seconds=600)
    ratelimit.hit(f"lead-ip-day:{ip}", limit=30, window_seconds=86_400)

    now = datetime.now(timezone.utc)
    if payload.website:
        # Looks successful to the bot, but nothing is stored.
        return LeadCreated(reference=new_reference(db), kind=payload.kind, status="new", created_at=now)

    ratelimit.hit(f"lead-phone:{payload.phone}", limit=5, window_seconds=3600)

    if payload.kind in APPOINTMENT_KINDS:
        if payload.kind == "visit" and payload.visit_date is None:
            raise HTTPException(status_code=422, detail="Please choose a date for your visit.")
        if payload.visit_date is not None:
            today = date.today()
            if not (today - timedelta(days=1) <= payload.visit_date <= today + timedelta(days=120)):
                raise HTTPException(status_code=422, detail="Please choose a visit date within the next few months.")

    # Same person, same form, same property and date within 30 minutes:
    # return the earlier reference instead of storing a duplicate.
    existing = db.scalars(
        select(Lead)
        .where(
            Lead.phone == payload.phone,
            Lead.kind == payload.kind,
            Lead.property_slug.is_(None) if payload.property_slug is None else Lead.property_slug == payload.property_slug,
            Lead.visit_date.is_(None) if payload.visit_date is None else Lead.visit_date == payload.visit_date,
            Lead.created_at >= now - DUPLICATE_WINDOW,
        )
        .order_by(Lead.created_at.desc())
    ).first()
    if existing:
        response.status_code = status.HTTP_200_OK
        return LeadCreated(
            reference=existing.reference,
            kind=existing.kind,
            status=existing.status,
            duplicate=True,
            created_at=existing.created_at,
        )

    lead = Lead(
        reference=new_reference(db),
        kind=payload.kind,
        status="requested" if payload.kind in APPOINTMENT_KINDS else "new",
        name=payload.name,
        phone=payload.phone,
        email=str(payload.email).lower() if payload.email else None,
        property_slug=clean(payload.property_slug, 150),
        property_name=clean(payload.property_name, 150),
        location=clean(payload.location, 150),
        budget=clean(payload.budget, 60),
        property_type=clean(payload.property_type, 80),
        visit_date=payload.visit_date,
        visit_time=clean(payload.visit_time, 60),
        visitors=clean(payload.visitors, 30),
        contact_method=clean(payload.contact_method, 20),
        message=clean(payload.message, 2000) or "",
        source_page=clean(payload.source_page, 200),
    )
    db.add(lead)
    db.flush()

    title = KIND_TITLES[payload.kind]
    if payload.kind == "property_enquiry" and lead.property_name:
        title = f"New enquiry about {lead.property_name}"
    body = _summary(lead)
    link = f"/admin/leads?lead={lead.reference}"
    notifications.create(
        db, audience="owner", kind=f"lead.{payload.kind}", title=title, body=body, link=link, lead_reference=lead.reference
    )
    db.commit()
    db.refresh(lead)
    notifications.bump()
    background.add_task(notifications.push_to_owner_phone, f"{title} · {lead.reference}", body, link)

    return LeadCreated(reference=lead.reference, kind=lead.kind, status=lead.status, created_at=lead.created_at)


def _filtered(kind: Optional[str], status_: Optional[str], q: Optional[str], upcoming: bool):
    query = select(Lead)
    if kind == "appointments":
        query = query.where(Lead.kind.in_(APPOINTMENT_KINDS))
    elif kind == "enquiries":
        query = query.where(Lead.kind.not_in(APPOINTMENT_KINDS))
    elif kind:
        query = query.where(Lead.kind == kind)
    if status_:
        query = query.where(Lead.status == status_)
    if upcoming:
        query = query.where(Lead.visit_date >= date.today())
    if q:
        like = f"%{q.strip().lower()}%"
        matches = [
            func.lower(Lead.name).like(like),
            func.lower(Lead.reference).like(like),
            func.lower(func.coalesce(Lead.email, "")).like(like),
            func.lower(func.coalesce(Lead.property_name, "")).like(like),
            func.lower(func.coalesce(Lead.location, "")).like(like),
        ]
        digits = re.sub(r"\D", "", q)
        if len(digits) >= 3:
            matches.append(Lead.phone.like(f"%{digits}%"))
        query = query.where(or_(*matches))
    return query


@router.get("", response_model=LeadList)
def list_leads(
    kind: Optional[str] = Query(default=None, max_length=30),
    status_: Optional[str] = Query(default=None, alias="status", max_length=20),
    q: Optional[str] = Query(default=None, max_length=100),
    upcoming: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _owner: User = Depends(require_video_admin),
):
    query = _filtered(kind, status_, q, upcoming)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    order = (Lead.visit_date.asc(), Lead.created_at.desc()) if upcoming else (Lead.created_at.desc(),)
    items = db.scalars(query.order_by(*order).limit(limit).offset(offset)).all()
    return LeadList(items=items, total=total)


@router.get("/stats")
def lead_stats(db: Session = Depends(get_db), _owner: User = Depends(require_video_admin)):
    today = date.today()
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    by_kind = dict(db.execute(select(Lead.kind, func.count()).group_by(Lead.kind)).all())
    by_status = dict(db.execute(select(Lead.status, func.count()).group_by(Lead.status)).all())
    return {
        "total": sum(by_kind.values()),
        "last_7_days": db.scalar(select(func.count()).where(Lead.created_at >= week_ago)) or 0,
        "new": by_status.get("new", 0) + by_status.get("requested", 0),
        "visits_today": db.scalar(
            select(func.count()).where(Lead.kind.in_(APPOINTMENT_KINDS), Lead.visit_date == today)
        )
        or 0,
        "upcoming_visits": db.scalar(
            select(func.count()).where(
                Lead.kind.in_(APPOINTMENT_KINDS),
                Lead.visit_date >= today,
                Lead.status.in_(("requested", "confirmed", "rescheduled")),
            )
        )
        or 0,
        "by_kind": by_kind,
        "by_status": by_status,
    }


EXPORT_FIELDS = (
    "reference", "created_at", "kind", "status", "name", "phone", "email", "property_name", "property_slug",
    "location", "budget", "property_type", "visit_date", "visit_time", "visitors", "contact_method",
    "message", "owner_notes", "source_page",
)


@router.get("/export.csv")
def export_leads(
    kind: Optional[str] = Query(default=None, max_length=30),
    db: Session = Depends(get_db),
    _owner: User = Depends(require_video_admin),
):
    rows = db.scalars(_filtered(kind, None, None, False).order_by(Lead.created_at.desc())).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(EXPORT_FIELDS)
    for lead in rows:
        values = []
        for field in EXPORT_FIELDS:
            value = getattr(lead, field)
            value = "" if value is None else str(value)
            # Stop spreadsheet apps from treating customer text as a formula.
            values.append("'" + value if value[:1] in ("=", "+", "-", "@") and field not in ("phone",) else value)
        writer.writerow(values)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return Response(
        content=chr(0xFEFF) + buffer.getvalue(),  # BOM so Excel reads UTF-8 (₹, names)
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="gratia-leads-{stamp}.csv"'},
    )


def _get(reference: str, db: Session) -> Lead:
    lead = db.scalars(select(Lead).where(Lead.reference == reference.upper())).first()
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return lead


@router.get("/{reference}", response_model=LeadResponse)
def get_lead(reference: str, db: Session = Depends(get_db), _owner: User = Depends(require_video_admin)):
    return _get(reference, db)


@router.patch("/{reference}", response_model=LeadResponse)
def update_lead(
    reference: str,
    payload: LeadUpdate,
    db: Session = Depends(get_db),
    _owner: User = Depends(require_video_admin),
):
    lead = _get(reference, db)
    if payload.status is not None:
        allowed = VISIT_STATUSES if lead.kind in APPOINTMENT_KINDS else LEAD_STATUSES
        if payload.status not in allowed:
            raise HTTPException(status_code=422, detail=f"Status must be one of: {', '.join(allowed)}")
        lead.status = payload.status
    if payload.owner_notes is not None:
        lead.owner_notes = clean(payload.owner_notes, 5000) or ""
    if payload.visit_date is not None:
        lead.visit_date = payload.visit_date
    if payload.visit_time is not None:
        lead.visit_time = clean(payload.visit_time, 60)
    db.commit()
    db.refresh(lead)
    return lead
