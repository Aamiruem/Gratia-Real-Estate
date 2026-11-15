"""Admin panel: overview, customers, enquiry reports, team members and settings.
Every endpoint requires a signed-in staff account (see permissions.py)."""

import re
import secrets
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AnalyticsEvent, Lead, Property, SiteSetting, User
from ..permissions import require_any_staff, require_manager, staff_role
from ..security import hash_password

router = APIRouter(prefix="/admin", tags=["Admin"])
public_router = APIRouter(tags=["Settings"])

APPOINTMENT_KINDS = ("visit", "consultation")


# ---------------- overview ----------------


@router.get("/overview")
def overview(db: Session = Depends(get_db), staff: User = Depends(require_any_staff)):
    now = datetime.now(timezone.utc)
    week = now - timedelta(days=7)
    month = now - timedelta(days=30)
    today = date.today()
    by_status = dict(db.execute(select(Lead.status, func.count()).group_by(Lead.status)).all())

    def count(*conditions):
        return db.scalar(select(func.count()).select_from(Lead).where(*conditions)) or 0

    recent = db.scalars(select(Lead).order_by(Lead.created_at.desc()).limit(8)).all()
    visitors_30 = db.scalar(
        select(func.count(distinct(AnalyticsEvent.visitor_id))).where(AnalyticsEvent.created_at >= month)
    ) or 0
    return {
        "role": staff.staff_role,
        "visitors_30_days": visitors_30,
        "leads": {
            "total": sum(by_status.values()),
            "last_7_days": count(Lead.created_at >= week),
            "new": by_status.get("new", 0) + by_status.get("requested", 0),
            "contacted": by_status.get("contacted", 0) + by_status.get("confirmed", 0),
            "qualified": by_status.get("qualified", 0),
            "converted": by_status.get("converted", 0) + by_status.get("completed", 0),
            "lost": by_status.get("lost", 0) + by_status.get("cancelled", 0) + by_status.get("no_show", 0),
        },
        "visits_today": count(Lead.kind.in_(APPOINTMENT_KINDS), Lead.visit_date == today),
        "upcoming_visits": count(
            Lead.kind.in_(APPOINTMENT_KINDS), Lead.visit_date >= today, Lead.status.in_(("requested", "confirmed", "rescheduled"))
        ),
        "follow_ups_due": count(Lead.follow_up_at.is_not(None), Lead.follow_up_at <= now),
        "unassigned": count(Lead.assigned_to_id.is_(None), Lead.status.in_(("new", "requested"))),
        "properties": {
            "published": db.scalar(select(func.count()).select_from(Property).where(Property.published.is_(True))) or 0,
            "drafts": db.scalar(select(func.count()).select_from(Property).where(Property.published.is_(False))) or 0,
        },
        "recent_leads": [
            {
                "reference": lead.reference,
                "kind": lead.kind,
                "status": lead.status,
                "name": lead.name,
                "property_name": lead.property_name,
                "created_at": lead.created_at,
            }
            for lead in recent
        ],
    }


# ---------------- customers (people grouped from their enquiries) ----------------


@router.get("/customers")
def customers(
    q: Optional[str] = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    _staff: User = Depends(require_any_staff),
):
    leads = db.scalars(select(Lead).order_by(Lead.created_at.desc()).limit(5000)).all()
    people: dict[str, dict] = {}
    for lead in leads:  # newest first
        person = people.get(lead.phone)
        if person is None:
            person = people[lead.phone] = {
                "phone": lead.phone,
                "name": lead.name,
                "email": lead.email,
                "enquiries": 0,
                "kinds": [],
                "properties": [],
                "latest_status": lead.status,
                "latest_reference": lead.reference,
                "last_contact": lead.created_at,
                "first_contact": lead.created_at,
            }
        person["enquiries"] += 1
        person["first_contact"] = lead.created_at
        person["email"] = person["email"] or lead.email
        if lead.kind not in person["kinds"]:
            person["kinds"].append(lead.kind)
        if lead.property_name and lead.property_name not in person["properties"]:
            person["properties"].append(lead.property_name)
    rows = list(people.values())
    if q:
        needle = q.strip().lower()
        digits = re.sub(r"\D", "", q)
        rows = [
            r for r in rows
            if needle in r["name"].lower()
            or needle in (r["email"] or "").lower()
            or (len(digits) >= 3 and digits in r["phone"])
        ]
    return {"items": rows[:500], "total": len(rows)}


# ---------------- enquiry reports ----------------


@router.get("/reports")
def reports(
    days: int = Query(default=90, ge=1, le=730),
    db: Session = Depends(get_db),
    _staff: User = Depends(require_any_staff),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    in_range = Lead.created_at >= since

    def grouped(column):
        return [
            {"key": key or "Not specified", "count": n}
            for key, n in db.execute(
                select(column, func.count()).where(in_range).group_by(column).order_by(func.count().desc())
            ).all()
        ]

    total = db.scalar(select(func.count()).where(in_range)) or 0
    converted = db.scalar(select(func.count()).where(in_range, Lead.status.in_(("converted", "completed")))) or 0
    # Month buckets in Python: portable across SQLite and PostgreSQL.
    monthly = sorted(Counter(d.strftime("%Y-%m") for d in db.scalars(select(Lead.created_at).where(in_range))).items())
    return {
        "days": days,
        "total": total,
        "converted": converted,
        "conversion_rate": round(100 * converted / total, 1) if total else 0,
        "by_property": grouped(Lead.property_name)[:20],
        "by_kind": grouped(Lead.kind),
        "by_status": grouped(Lead.status),
        "by_source": grouped(Lead.source),
        "by_requirement": grouped(Lead.requirement),
        "by_budget": grouped(Lead.budget),
        "monthly": [{"month": m, "count": n} for m, n in monthly],
    }


# ---------------- team members ----------------


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: str
    is_active: bool
    created_at: datetime


class MemberCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    role: Literal["admin", "agent"] = "agent"


class MemberUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    role: Optional[Literal["admin", "agent"]] = None
    is_active: Optional[bool] = None


def _member_out(user: User) -> MemberOut:
    out = MemberOut.model_validate(user)
    out.role = staff_role(user) or user.role
    return out


@router.get("/team", response_model=list[MemberOut])
def team(db: Session = Depends(get_db), _staff: User = Depends(require_any_staff)):
    users = db.scalars(select(User).order_by(User.id)).all()
    return [_member_out(u) for u in users if staff_role(u) or u.role in ("admin", "agent")]


@router.post("/team", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def add_member(payload: MemberCreate, db: Session = Depends(get_db), manager: User = Depends(require_manager)):
    if payload.role == "admin" and manager.staff_role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can add administrators.")
    email = str(payload.email).lower()
    if db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise HTTPException(status_code=409, detail="A user with this email already exists.")
    # Sign-in is by one-time email code, so this password is random and never used.
    user = User(name=payload.name.strip(), email=email, role=payload.role, password_hash=hash_password(secrets.token_urlsafe(32)))
    db.add(user)
    db.commit()
    db.refresh(user)
    return _member_out(user)


@router.patch("/team/{user_id}", response_model=MemberOut)
def update_member(user_id: int, payload: MemberUpdate, db: Session = Depends(get_db), manager: User = Depends(require_manager)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if staff_role(user) == "owner":
        raise HTTPException(status_code=403, detail="The owner account can't be changed here.")
    if user.id == manager.id and payload.is_active is False:
        raise HTTPException(status_code=422, detail="You can't deactivate your own account.")
    if (payload.role == "admin" or user.role == "admin") and manager.staff_role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can change administrators.")
    if payload.name is not None:
        user.name = payload.name.strip()
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return _member_out(user)


# ---------------- settings ----------------

SOCIAL_KEYS = ("instagram", "facebook", "youtube", "linkedin", "x", "google_business")
DEFAULT_SETTINGS = {
    "social": {key: "" for key in SOCIAL_KEYS},
    "business_hours": "Mon–Sat, 10 AM – 7 PM",
    "ai_assistant_enabled": True,
    "announcement_bar": "",
}


class Settings(BaseModel):
    social: dict[str, str] = Field(default_factory=dict)
    business_hours: str = Field(default="", max_length=120)
    ai_assistant_enabled: bool = True
    announcement_bar: str = Field(default="", max_length=200)

    @field_validator("social")
    @classmethod
    def valid_social(cls, value: dict[str, str]) -> dict[str, str]:
        cleaned = {}
        for key in SOCIAL_KEYS:
            url = (value.get(key) or "").strip()
            if url and not url.startswith("https://"):
                raise ValueError(f"{key} link must start with https://")
            cleaned[key] = url[:300]
        return cleaned


def load_settings(db: Session) -> dict:
    row = db.get(SiteSetting, "site")
    merged = {**DEFAULT_SETTINGS, **(row.value if row else {})}
    merged["social"] = {**DEFAULT_SETTINGS["social"], **merged.get("social", {})}
    return merged


@public_router.get("/settings/public")
def public_settings(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=120"
    return load_settings(db)


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _staff: User = Depends(require_any_staff)):
    return load_settings(db)


@router.put("/settings")
def save_settings(payload: Settings, db: Session = Depends(get_db), _manager: User = Depends(require_manager)):
    row = db.get(SiteSetting, "site")
    if row is None:
        row = SiteSetting(key="site", value={})
        db.add(row)
    row.value = payload.model_dump()
    db.commit()
    return load_settings(db)
