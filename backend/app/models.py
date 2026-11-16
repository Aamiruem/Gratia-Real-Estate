from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(500), nullable=False)
    role: Mapped[str] = mapped_column(String(30), default="user", nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    # Password sign-in (in addition to one-time codes). Accounts created for
    # OTP-only sign-in have a random hash and password_set_at = NULL.
    password_set_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Included in every session token; incrementing it signs out all sessions.
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class PasswordResetChallenge(Base):
    """A pending "forgot password" code (only its hash is stored)."""

    __tablename__ = "password_reset_challenges"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class Video(Base):
    __tablename__ = "project_videos"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    project_slug: Mapped[str | None] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class VideoReaction(Base):
    """Public like/dislike totals per YouTube video ID (shared by all visitors)."""

    __tablename__ = "video_reactions"

    youtube_id: Mapped[str] = mapped_column(String(11), primary_key=True)
    likes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dislikes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class LoginChallenge(Base):
    """A pending one-time sign-in code (only the hash is stored)."""

    __tablename__ = "login_challenges"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class EmailChangeChallenge(Base):
    __tablename__ = "email_change_challenges"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    new_email: Mapped[str] = mapped_column(String(255), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class OwnerRecoveryChallenge(Base):
    __tablename__ = "owner_recovery_challenges"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    new_email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(500), nullable=False)
    channel: Mapped[str] = mapped_column(String(10), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class OwnerSetupState(Base):
    __tablename__ = "owner_setup_state"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    consumed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Lead(Base):
    """An enquiry from a website form: contact, site visit, callback, etc."""

    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reference: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), index=True, default="new", nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    property_slug: Mapped[str | None] = mapped_column(String(150), nullable=True)
    property_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    location: Mapped[str | None] = mapped_column(String(150), nullable=True)
    budget: Mapped[str | None] = mapped_column(String(60), nullable=True)
    property_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    visit_date: Mapped[date | None] = mapped_column(Date, index=True, nullable=True)
    visit_time: Mapped[str | None] = mapped_column(String(60), nullable=True)
    visitors: Mapped[str | None] = mapped_column(String(30), nullable=True)
    contact_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    source_page: Mapped[str | None] = mapped_column(String(200), nullable=True)
    owner_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # Lead management (added later; migrate.py adds these to existing databases)
    requirement: Mapped[str | None] = mapped_column(String(20), nullable=True)  # buy, sell, rent, invest
    contact_time: Mapped[str | None] = mapped_column(String(60), nullable=True)
    source: Mapped[str | None] = mapped_column(String(60), index=True, nullable=True)  # organic, direct, social...
    assigned_to_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    call_consent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    call_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    call_consent_by_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # SHA-256 of the submitting device's key: lets us send the customer updates in their bell.
    device_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )


class Notification(Base):
    """A website notification. audience="owner" is private to the signed-in
    owner (new enquiries, visits...); audience="public" is shown to every
    visitor (new property or video added). Public read state lives in each
    visitor's browser."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audience: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    body: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)
    lead_reference: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # audience="visitor": private to one device (SHA-256 of its random device key).
    recipient: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True, nullable=False)


class FollowUp(Base):
    """A note on a lead's history: a call made, a visit done, the next step."""

    __tablename__ = "lead_follow_ups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), index=True, nullable=False)
    author_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    author_name: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    next_action_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class VoiceCall(Base):
    """CRM call metadata received from Retell; transcripts and recordings are not stored."""

    __tablename__ = "crm_voice_calls"

    call_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    lead_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("leads.id", ondelete="SET NULL"), index=True, nullable=True)
    initiated_by_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="registered", nullable=False)
    from_number: Mapped[str] = mapped_column(String(30), default="", nullable=False)
    to_number: Mapped[str] = mapped_column(String(30), default="", nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class Property(Base):
    """A property listing managed from the admin panel."""

    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    developer: Mapped[str] = mapped_column(String(150), default="", nullable=False)
    location: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(String(20), default="residential", index=True, nullable=False)
    type: Mapped[str] = mapped_column(String(80), default="Residential", nullable=False)
    configuration: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(60), default="Launched", nullable=False)
    availability: Mapped[str] = mapped_column(String(30), default="available", nullable=False)
    price: Mapped[str] = mapped_column(String(80), default="Price on request", nullable=False)
    price_min_cr: Mapped[float | None] = mapped_column(Float, nullable=True)
    offer: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    image: Mapped[str] = mapped_column(Text, default="", nullable=False)
    gallery: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    highlights: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    seo_title: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    seo_description: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class AnalyticsEvent(Base):
    """First-party website analytics, recorded only after the visitor consents.
    Holds no names, phone numbers or emails; visitor/session ids are random."""

    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    path: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    property_slug: Mapped[str | None] = mapped_column(String(150), index=True, nullable=True)
    source: Mapped[str] = mapped_column(String(40), default="direct", index=True, nullable=False)
    referrer_host: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    visitor_id: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    session_id: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    device: Mapped[str] = mapped_column(String(10), default="", nullable=False)
    detail: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True, nullable=False)


class SiteSetting(Base):
    """Editable website settings (social links, business hours, AI assistant...)."""

    __tablename__ = "site_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class PushSubscription(Base):
    """A browser that opted in to push notifications."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(String(200), nullable=False)
    auth: Mapped[str] = mapped_column(String(100), nullable=False)
    audience: Mapped[str] = mapped_column(String(10), default="public", index=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class AuditLog(Base):
    """Who did what in the admin panel (lead edits, deletions, status changes...).
    Never stores passwords, codes or tokens."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_name: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    action: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    target_type: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    target_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    detail: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True, nullable=False)
