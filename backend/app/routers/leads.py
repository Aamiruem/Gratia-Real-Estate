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
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from .. import audit, notifications, ratelimit
from ..database import get_db
from ..models import AuditLog, FollowUp, Lead, Notification, User
from ..permissions import require_any_staff, require_manager, staff_role

router = APIRouter(prefix="/leads", tags=["Leads"])

LeadKind = Literal["contact", "visit", "callback", "property_enquiry", "consultation", "whatsapp"]
Requirement = Literal["buy", "sell", "rent", "invest"]
SOURCES = {"organic", "direct", "social", "referral", "paid", "email", "whatsapp", "app"}
APPOINTMENT_KINDS = {"visit", "consultation"}
# Sales pipeline for enquiries. "qualified" and "lost" are earlier names still
# found on older records; they stay valid so nothing stored needs rewriting.
LEAD_STATUSES = (
    "new", "contacted", "qualified", "interested", "site_visit_scheduled",
    "site_visit_completed", "negotiation", "booking", "converted",
    "not_interested", "closed",
)
LEGACY_LEAD_STATUSES = ("qualified", "lost")
VISIT_STATUSES = ("requested", "confirmed", "rescheduled", "completed", "cancelled", "no_show")
SORTS = {
    "newest": (Lead.created_at.desc(),),
    "oldest": (Lead.created_at.asc(),),
    "name": (func.lower(Lead.name).asc(), Lead.created_at.desc()),
    "status": (Lead.status.asc(), Lead.created_at.desc()),
    "follow_up": (Lead.follow_up_at.is_(None), Lead.follow_up_at.asc(), Lead.created_at.desc()),
    "updated": (Lead.updated_at.desc(),),
}


def allowed_statuses(lead_kind: str) -> tuple[str, ...]:
    return VISIT_STATUSES if lead_kind in APPOINTMENT_KINDS else LEAD_STATUSES + LEGACY_LEAD_STATUSES

KIND_TITLES = {
    "contact": "New customer enquiry received",
    "visit": "New property viewing request",
    "callback": "Customer requested a callback",
    "property_enquiry": "New property enquiry",
    "consultation": "New appointment scheduled",
    "whatsapp": "New lead generated (WhatsApp)",
}

VISITOR_LABELS = {
    "contact": "enquiry",
    "visit": "site visit request",
    "callback": "callback request",
    "property_enquiry": "property enquiry",
    "consultation": "consultation request",
    "whatsapp": "enquiry",
}
# Status changes the customer is told about (in their notification bell).
VISITOR_UPDATES = {
    "confirmed": ("Your visit is confirmed", "We look forward to meeting you"),
    "rescheduled": ("Your visit was rescheduled", "Please check the new date and time"),
    "completed": ("Thank you for visiting", "Your advisor will follow up with next steps"),
    "cancelled": ("Your visit was cancelled", "Contact us any time to book a new slot"),
    "contacted": ("An advisor is working on your enquiry", "We'll be in touch with options soon"),
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
    whatsapp: Optional[str] = Field(default=None, max_length=20)
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
    requirement: Optional[Requirement] = None
    contact_time: Optional[str] = Field(default=None, max_length=60)
    source: Optional[str] = Field(default=None, max_length=60)
    # Random key kept in the visitor's browser: their confirmations are saved for that device.
    device_token: Optional[str] = Field(default=None, max_length=80)
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

    @field_validator("whatsapp", mode="before")
    @classmethod
    def valid_whatsapp(cls, value):
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
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
    whatsapp: Optional[str] = None
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
    requirement: Optional[str] = None
    contact_time: Optional[str] = None
    source: Optional[str] = None
    assigned_to_id: Optional[int] = None
    follow_up_at: Optional[datetime] = None
    call_consent: bool = False
    call_consent_at: Optional[datetime] = None
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
    # 0 = unassign
    assigned_to_id: Optional[int] = Field(default=None, ge=0)
    follow_up_at: Optional[datetime] = None
    clear_follow_up: bool = False
    call_consent: Optional[bool] = None
    # Editable customer / enquiry details (staff "Edit details").
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    phone: Optional[str] = Field(default=None, min_length=10, max_length=20)
    whatsapp: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=255)
    property_slug: Optional[str] = Field(default=None, max_length=150)
    property_name: Optional[str] = Field(default=None, max_length=150)
    location: Optional[str] = Field(default=None, max_length=150)
    budget: Optional[str] = Field(default=None, max_length=60)
    property_type: Optional[str] = Field(default=None, max_length=80)
    requirement: Optional[str] = Field(default=None, max_length=20)
    message: Optional[str] = Field(default=None, max_length=2000)
    source: Optional[str] = Field(default=None, max_length=60)
    contact_time: Optional[str] = Field(default=None, max_length=60)


EDITABLE_TEXT = {
    "name": 80, "email": 255, "property_slug": 150, "property_name": 150, "location": 150, "budget": 60,
    "property_type": 80, "message": 2000, "source": 60, "contact_time": 60,
}


class LeadAdminCreate(LeadCreate):
    """A lead entered by staff (phone call, walk-in, referral...)."""

    kind: LeadKind = "contact"
    source: Optional[str] = Field(default="manual", max_length=60)
    status: Optional[str] = Field(default=None, max_length=20)
    assigned_to_id: Optional[int] = Field(default=None, ge=1)
    follow_up_at: Optional[datetime] = None
    owner_notes: str = Field(default="", max_length=5000)


class AuditEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_name: str
    action: str
    detail: str
    created_at: datetime


class FollowUpCreate(BaseModel):
    note: str = Field(min_length=2, max_length=3000)
    next_action_at: Optional[datetime] = None
    status: Optional[str] = Field(default=None, max_length=20)


class FollowUpResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_name: str
    note: str
    next_action_at: Optional[datetime]
    created_at: datetime


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
        # Same enquiry again (maybe from another device): make sure this device
        # also sees the confirmation in its notification bell.
        device = notifications.device_hash(payload.device_token)
        if device and not db.scalar(
            select(Notification.id).where(
                Notification.audience == "visitor",
                Notification.recipient == device,
                Notification.lead_reference == existing.reference,
            )
        ):
            notifications.create(
                db,
                audience="visitor",
                recipient=device,
                kind=f"lead.{existing.kind}",
                title=f"We received your {VISITOR_LABELS.get(existing.kind, 'enquiry')}",
                body=f"Reference {existing.reference}. Our advisor will contact you shortly.",
                link="/notifications",
                lead_reference=existing.reference,
            )
            db.commit()
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
        whatsapp=payload.whatsapp,
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
        requirement=payload.requirement,
        contact_time=clean(payload.contact_time, 60),
        source=payload.source if payload.source in SOURCES else ("direct" if payload.source else None),
        device_hash=notifications.device_hash(payload.device_token),
    )
    db.add(lead)
    db.flush()
    audit.record(db, None, "created", "lead", lead.reference, f"Submitted on the website ({lead.source_page or 'unknown page'}).")

    title = KIND_TITLES[payload.kind]
    if payload.kind == "property_enquiry" and lead.property_name:
        title = f"New enquiry about {lead.property_name}"
    body = _summary(lead)
    link = f"/admin/leads?lead={lead.reference}"
    item = notifications.create(
        db, audience="owner", kind=f"lead.{payload.kind}", title=title, body=body, link=link, lead_reference=lead.reference
    )
    if lead.device_hash:
        notifications.create(
            db,
            audience="visitor",
            recipient=lead.device_hash,
            kind=f"lead.{payload.kind}",
            title=f"We received your {VISITOR_LABELS[payload.kind]}",
            body=f"Reference {lead.reference}. Our advisor will contact you shortly.",
            link="/notifications",
            lead_reference=lead.reference,
        )
    db.commit()
    db.refresh(lead)
    notifications.dispatch(background, [item])
    background.add_task(notifications.push_to_owner_phone, f"{title} · {lead.reference}", body, link)

    return LeadCreated(reference=lead.reference, kind=lead.kind, status=lead.status, created_at=lead.created_at)


class LeadFilters(BaseModel):
    kind: Optional[str] = None
    status: Optional[str] = None
    q: Optional[str] = None
    upcoming: bool = False
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    location: Optional[str] = None
    property: Optional[str] = None
    budget: Optional[str] = None
    source: Optional[str] = None
    requirement: Optional[str] = None
    assigned: Optional[str] = None  # member id, "me" or "unassigned"


def lead_filters(
    kind: Optional[str] = Query(default=None, max_length=30),
    status_: Optional[str] = Query(default=None, alias="status", max_length=30),
    q: Optional[str] = Query(default=None, max_length=100),
    upcoming: bool = False,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    location: Optional[str] = Query(default=None, max_length=150),
    property_: Optional[str] = Query(default=None, alias="property", max_length=150),
    budget: Optional[str] = Query(default=None, max_length=60),
    source: Optional[str] = Query(default=None, max_length=60),
    requirement: Optional[str] = Query(default=None, max_length=20),
    assigned: Optional[str] = Query(default=None, max_length=20),
) -> LeadFilters:
    return LeadFilters(
        kind=kind, status=status_, q=q, upcoming=upcoming, date_from=date_from, date_to=date_to,
        location=location, property=property_, budget=budget, source=source, requirement=requirement,
        assigned=assigned,
    )


def _contains(column, text: str):
    return func.lower(func.coalesce(column, "")).like(f"%{text.strip().lower()}%")


def _filtered(filters: LeadFilters, staff: Optional[User] = None):
    query = select(Lead)
    kind = filters.kind
    if kind == "appointments":
        query = query.where(Lead.kind.in_(APPOINTMENT_KINDS))
    elif kind == "enquiries":
        query = query.where(Lead.kind.not_in(APPOINTMENT_KINDS))
    elif kind:
        query = query.where(Lead.kind == kind)
    if filters.status:
        query = query.where(Lead.status == filters.status)
    if filters.upcoming:
        query = query.where(Lead.visit_date >= date.today())
    if filters.date_from:
        query = query.where(Lead.created_at >= datetime.combine(filters.date_from, datetime.min.time(), tzinfo=timezone.utc))
    if filters.date_to:
        end = datetime.combine(filters.date_to, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1)
        query = query.where(Lead.created_at < end)
    if filters.location:
        query = query.where(_contains(Lead.location, filters.location))
    if filters.property:
        query = query.where(
            or_(Lead.property_slug == filters.property.strip(), _contains(Lead.property_name, filters.property))
        )
    if filters.budget:
        query = query.where(_contains(Lead.budget, filters.budget))
    if filters.source:
        query = query.where(Lead.source == filters.source)
    if filters.requirement:
        query = query.where(Lead.requirement == filters.requirement)
    if filters.assigned == "unassigned":
        query = query.where(Lead.assigned_to_id.is_(None))
    elif filters.assigned == "me" and staff is not None:
        query = query.where(Lead.assigned_to_id == staff.id)
    elif filters.assigned and filters.assigned.isdigit():
        query = query.where(Lead.assigned_to_id == int(filters.assigned))
    if filters.q:
        q = filters.q
        like = f"%{q.strip().lower()}%"
        matches = [
            func.lower(Lead.name).like(like),
            func.lower(Lead.reference).like(like),
            func.lower(func.coalesce(Lead.email, "")).like(like),
            func.lower(func.coalesce(Lead.property_name, "")).like(like),
            func.lower(func.coalesce(Lead.location, "")).like(like),
            func.lower(Lead.message).like(like),
        ]
        digits = re.sub(r"\D", "", q)
        if len(digits) >= 3:
            matches.append(Lead.phone.like(f"%{digits}%"))
            matches.append(func.coalesce(Lead.whatsapp, "").like(f"%{digits}%"))
        query = query.where(or_(*matches))
    return query


@router.get("", response_model=LeadList)
def list_leads(
    filters: LeadFilters = Depends(lead_filters),
    sort: str = Query(default="newest", max_length=20),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    staff: User = Depends(require_any_staff),
):
    query = _filtered(filters, staff)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    if filters.upcoming and sort == "newest":
        order = (Lead.visit_date.asc(), Lead.created_at.desc())
    else:
        order = SORTS.get(sort, SORTS["newest"])
    items = db.scalars(query.order_by(*order).limit(limit).offset(offset)).all()
    return LeadList(items=items, total=total)


@router.get("/stats")
def lead_stats(db: Session = Depends(get_db), _staff: User = Depends(require_any_staff)):
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
    "reference", "created_at", "updated_at", "kind", "status", "name", "phone", "whatsapp", "email",
    "property_name", "property_slug", "location", "budget", "property_type", "requirement", "visit_date",
    "visit_time", "visitors", "contact_method", "contact_time", "message", "owner_notes", "source",
    "source_page", "assigned_to", "follow_up_at",
)


def _export_rows(filters: LeadFilters, staff: User, db: Session) -> list[list[str]]:
    rows = db.scalars(_filtered(filters, staff).order_by(Lead.created_at.desc())).all()
    names = {u.id: u.name for u in db.scalars(select(User)).all()}
    table = []
    for lead in rows:
        values = []
        for field in EXPORT_FIELDS:
            value = names.get(lead.assigned_to_id, "") if field == "assigned_to" else getattr(lead, field)
            value = "" if value is None else str(value)
            # Stop spreadsheet apps from treating customer text as a formula.
            values.append("'" + value if value[:1] in ("=", "+", "-", "@") and field not in ("phone", "whatsapp") else value)
        table.append(values)
    return table


def _export_name(extension: str) -> str:
    return f"gratia-leads-{datetime.now(timezone.utc).strftime('%Y%m%d')}.{extension}"


@router.get("/export.csv")
def export_leads(
    filters: LeadFilters = Depends(lead_filters),
    db: Session = Depends(get_db),
    staff: User = Depends(require_any_staff),
):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(EXPORT_FIELDS)
    writer.writerows(_export_rows(filters, staff, db))
    return Response(
        content=chr(0xFEFF) + buffer.getvalue(),  # BOM so Excel reads UTF-8 (₹, names)
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{_export_name("csv")}"'},
    )


@router.get("/export.xlsx")
def export_leads_excel(
    filters: LeadFilters = Depends(lead_filters),
    db: Session = Depends(get_db),
    staff: User = Depends(require_any_staff),
):
    from openpyxl import Workbook
    from openpyxl.styles import Font

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Leads"
    sheet.append([field.replace("_", " ").title() for field in EXPORT_FIELDS])
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    for row in _export_rows(filters, staff, db):
        sheet.append(row)
    sheet.freeze_panes = "A2"
    for column in sheet.columns:
        width = max(len(str(cell.value or "")) for cell in column[:200])
        sheet.column_dimensions[column[0].column_letter].width = min(max(10, width + 2), 50)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{_export_name("xlsx")}"'},
    )


@router.get("/follow-ups/due", response_model=LeadList)
def due_follow_ups(
    scope: Literal["overdue", "today", "upcoming", "all"] = "all",
    db: Session = Depends(get_db),
    _staff: User = Depends(require_any_staff),
):
    """Leads with a scheduled follow-up, soonest first."""
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    query = select(Lead).where(Lead.follow_up_at.is_not(None))
    if scope == "overdue":
        query = query.where(Lead.follow_up_at < now)
    elif scope == "today":
        query = query.where(Lead.follow_up_at >= start, Lead.follow_up_at < start + timedelta(days=1))
    elif scope == "upcoming":
        query = query.where(Lead.follow_up_at >= now)
    items = db.scalars(query.order_by(Lead.follow_up_at.asc()).limit(200)).all()
    return LeadList(items=items, total=len(items))


def create_due_follow_up_notifications(db: Session) -> list[Notification]:
    """Adds one "Follow-up due" notification per lead whose follow-up time has passed."""
    now = datetime.now(timezone.utc)
    due = db.scalars(select(Lead).where(Lead.follow_up_at.is_not(None), Lead.follow_up_at <= now).limit(100)).all()
    created = []
    for lead in due:
        follow_up_at = lead.follow_up_at if lead.follow_up_at.tzinfo else lead.follow_up_at.replace(tzinfo=timezone.utc)
        exists = db.scalar(
            select(Notification.id).where(
                Notification.kind == "lead.follow_up",
                Notification.lead_reference == lead.reference,
                Notification.created_at >= follow_up_at,
            )
        )
        if not exists:
            created.append(
                notifications.create(
                    db,
                    audience="owner",
                    kind="lead.follow_up",
                    title=f"Follow-up due: {lead.name}",
                    body=f"{lead.reference} · {lead.phone}",
                    link=f"/admin/leads?lead={lead.reference}",
                    lead_reference=lead.reference,
                )
            )
    if created:
        db.commit()
    return created


def notify_customer(db: Session, lead: Lead, new_status: str) -> None:
    """Tells the customer (on the device they used) about a real status change."""
    if not lead.device_hash or new_status not in VISITOR_UPDATES:
        return
    title, text = VISITOR_UPDATES[new_status]
    when = ""
    if lead.kind in APPOINTMENT_KINDS and lead.visit_date and new_status in ("confirmed", "rescheduled"):
        when = f" {lead.visit_date.strftime('%a %d %b %Y')}" + (f", {lead.visit_time}" if lead.visit_time else "") + "."
    place = f" ({lead.property_name})" if lead.property_name else ""
    notifications.create(
        db,
        audience="visitor",
        recipient=lead.device_hash,
        kind="lead.update",
        title=title,
        body=f"Reference {lead.reference}{place}.{when} {text}.",
        link="/notifications",
        lead_reference=lead.reference,
    )


def _get(reference: str, db: Session) -> Lead:
    lead = db.scalars(select(Lead).where(Lead.reference == reference.upper())).first()
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return lead


@router.get("/{reference}", response_model=LeadResponse)
def get_lead(reference: str, db: Session = Depends(get_db), _staff: User = Depends(require_any_staff)):
    return _get(reference, db)


@router.patch("/{reference}", response_model=LeadResponse)
def update_lead(
    reference: str,
    payload: LeadUpdate,
    db: Session = Depends(get_db),
    staff: User = Depends(require_any_staff),
):
    lead = _get(reference, db)
    changes: list[str] = []
    if payload.assigned_to_id is not None:
        if payload.assigned_to_id == 0:
            if lead.assigned_to_id is not None:
                changes.append("assigned: nobody")
            lead.assigned_to_id = None
        else:
            member = db.get(User, payload.assigned_to_id)
            if member is None or staff_role(member) is None:
                raise HTTPException(status_code=422, detail="Choose an active team member.")
            if lead.assigned_to_id != member.id:
                changes.append(f"assigned: {member.name}")
            lead.assigned_to_id = member.id
    if payload.clear_follow_up:
        if lead.follow_up_at is not None:
            changes.append("follow-up cleared")
        lead.follow_up_at = None
    elif payload.follow_up_at is not None:
        lead.follow_up_at = payload.follow_up_at
        changes.append(f"follow-up: {payload.follow_up_at.strftime('%d %b %Y %H:%M')}")
    if payload.call_consent is not None and payload.call_consent != lead.call_consent:
        lead.call_consent = payload.call_consent
        lead.call_consent_at = datetime.now(timezone.utc) if payload.call_consent else None
        lead.call_consent_by_id = staff.id if payload.call_consent else None
        changes.append("AI phone-call consent recorded" if payload.call_consent else "AI phone-call consent withdrawn")
    if payload.status is not None:
        if payload.status not in allowed_statuses(lead.kind):
            raise HTTPException(status_code=422, detail=f"Status must be one of: {', '.join(allowed_statuses(lead.kind))}")
        if payload.status != lead.status:
            notify_customer(db, lead, payload.status)
            changes.append(f"status: {lead.status} → {payload.status}")
        lead.status = payload.status
    if payload.owner_notes is not None:
        notes = clean(payload.owner_notes, 5000) or ""
        if notes != lead.owner_notes:
            changes.append("internal notes updated")
        lead.owner_notes = notes
    if payload.visit_date is not None:
        lead.visit_date = payload.visit_date
        changes.append(f"visit date: {payload.visit_date.isoformat()}")
    if payload.visit_time is not None:
        lead.visit_time = clean(payload.visit_time, 60)

    # Customer / enquiry details ("Edit details").
    edited = []
    for field, limit in EDITABLE_TEXT.items():
        value = getattr(payload, field)
        if value is None:
            continue
        if field == "name":
            value = clean(value, limit) or ""
            if len(value) < 2:
                raise HTTPException(status_code=422, detail="Name is required.")
        elif field == "email":
            value = clean(value, limit)
            if value and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", value):
                raise HTTPException(status_code=422, detail="Enter a valid email address.")
            value = value.lower() if value else None
        elif field == "message":
            value = clean(value, limit) or ""
        else:
            value = clean(value, limit)
        if getattr(lead, field) != value:
            edited.append(field)
            setattr(lead, field, value)
    for field in ("phone", "whatsapp"):
        raw = getattr(payload, field)
        if raw is None:
            continue
        try:
            value = normalize_phone(raw) if raw.strip() else None
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        if field == "phone" and value is None:
            raise HTTPException(status_code=422, detail="Mobile number is required.")
        if getattr(lead, field) != value:
            edited.append(field)
            setattr(lead, field, value)
    if payload.requirement is not None:
        value = payload.requirement or None
        if value is not None and value not in ("buy", "sell", "rent", "invest"):
            raise HTTPException(status_code=422, detail="Requirement must be buy, sell, rent or invest.")
        if lead.requirement != value:
            edited.append("requirement")
            lead.requirement = value
    if edited:
        changes.append("edited: " + ", ".join(edited))

    if changes:
        audit.record(db, staff, "updated", "lead", lead.reference, "; ".join(changes))
    db.commit()
    db.refresh(lead)
    return lead


@router.get("/{reference}/follow-ups", response_model=list[FollowUpResponse])
def list_follow_ups(reference: str, db: Session = Depends(get_db), _staff: User = Depends(require_any_staff)):
    lead = _get(reference, db)
    return db.scalars(select(FollowUp).where(FollowUp.lead_id == lead.id).order_by(FollowUp.created_at.desc())).all()


@router.post("/{reference}/follow-ups", response_model=FollowUpResponse, status_code=status.HTTP_201_CREATED)
def add_follow_up(
    reference: str,
    payload: FollowUpCreate,
    db: Session = Depends(get_db),
    staff: User = Depends(require_any_staff),
):
    lead = _get(reference, db)
    detail = "follow-up note added"
    if payload.status is not None:
        if payload.status not in allowed_statuses(lead.kind):
            raise HTTPException(status_code=422, detail=f"Status must be one of: {', '.join(allowed_statuses(lead.kind))}")
        if payload.status != lead.status:
            notify_customer(db, lead, payload.status)
            detail += f"; status: {lead.status} → {payload.status}"
        lead.status = payload.status
    entry = FollowUp(
        lead_id=lead.id,
        author_id=staff.id,
        author_name=staff.name,
        note=clean(payload.note, 3000) or "",
        next_action_at=payload.next_action_at,
    )
    lead.follow_up_at = payload.next_action_at
    if payload.next_action_at:
        detail += f"; next follow-up {payload.next_action_at.strftime('%d %b %Y %H:%M')}"
    db.add(entry)
    audit.record(db, staff, "follow_up", "lead", lead.reference, detail)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/{reference}/history", response_model=list[AuditEntry])
def lead_history(reference: str, db: Session = Depends(get_db), _staff: User = Depends(require_any_staff)):
    """Everything that happened to this lead, newest first."""
    lead = _get(reference, db)
    return db.scalars(
        select(AuditLog)
        .where(AuditLog.target_type == "lead", AuditLog.target_id == lead.reference)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    ).all()


@router.post("/manual", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
def create_lead_by_staff(
    payload: LeadAdminCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    staff: User = Depends(require_any_staff),
):
    """A lead entered in the admin panel (phone call, walk-in, referral...)."""
    status_value = payload.status or ("requested" if payload.kind in APPOINTMENT_KINDS else "new")
    if status_value not in allowed_statuses(payload.kind):
        raise HTTPException(status_code=422, detail=f"Status must be one of: {', '.join(allowed_statuses(payload.kind))}")
    if payload.assigned_to_id is not None:
        member = db.get(User, payload.assigned_to_id)
        if member is None or staff_role(member) is None:
            raise HTTPException(status_code=422, detail="Choose an active team member.")
    duplicate = db.scalar(select(Lead.reference).where(Lead.phone == payload.phone).order_by(Lead.created_at.desc()))
    lead = Lead(
        reference=new_reference(db),
        kind=payload.kind,
        status=status_value,
        name=payload.name,
        phone=payload.phone,
        whatsapp=payload.whatsapp,
        email=str(payload.email).lower() if payload.email else None,
        property_slug=clean(payload.property_slug, 150),
        property_name=clean(payload.property_name, 150),
        location=clean(payload.location, 150),
        budget=clean(payload.budget, 60),
        property_type=clean(payload.property_type, 80),
        visit_date=payload.visit_date,
        visit_time=clean(payload.visit_time, 60),
        contact_method=clean(payload.contact_method, 20),
        message=clean(payload.message, 2000) or "",
        requirement=payload.requirement,
        contact_time=clean(payload.contact_time, 60),
        source=clean(payload.source, 60) or "manual",
        source_page="admin panel",
        owner_notes=clean(payload.owner_notes, 5000) or "",
        assigned_to_id=payload.assigned_to_id,
        follow_up_at=payload.follow_up_at,
    )
    db.add(lead)
    db.flush()
    note = f"Entered by {staff.name} in the admin panel."
    if duplicate:
        note += f" Same phone as earlier lead {duplicate}."
    audit.record(db, staff, "created", "lead", lead.reference, note)
    db.commit()
    db.refresh(lead)
    notifications.dispatch(background, [])
    return lead


@router.delete("/{reference}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(reference: str, db: Session = Depends(get_db), manager: User = Depends(require_manager)):
    """Permanently removes a lead and its follow-ups. Owners/admins only; the
    audit log keeps who deleted it and a summary (not the customer's details)."""
    lead = _get(reference, db)
    db.execute(delete(FollowUp).where(FollowUp.lead_id == lead.id))
    audit.record(db, manager, "deleted", "lead", lead.reference, f"Deleted {lead.kind} lead (status {lead.status}).")
    db.delete(lead)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
