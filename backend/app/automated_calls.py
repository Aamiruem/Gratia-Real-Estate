"""Consent-gated Retell follow-up queue and business-hours scheduler."""

import hashlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .models import AutomatedCallJob, Lead, VoiceCall
from .retell import RetellCallError, create_retell_phone_call, retell_configured

logger = logging.getLogger("gratia.automated_calls")
IST = timezone(timedelta(hours=5, minutes=30))
ACTIVE_CALL_STATUSES = ("registered", "ongoing", "in_progress")
MAX_CALLS_PER_RUN = 5
MAX_ATTEMPTS = 3
RETRY_DELAY = timedelta(minutes=15)
STALE_CLAIM_AGE = timedelta(minutes=10)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def enqueue_automated_call(db: Session, lead: Lead) -> AutomatedCallJob | None:
    if not lead.call_consent or lead.call_consent_at is None:
        return None

    consent_at = _utc(lead.call_consent_at)
    existing = db.scalar(
        select(AutomatedCallJob).where(
            AutomatedCallJob.lead_id == lead.id,
            AutomatedCallJob.consent_at == consent_at,
        )
    )
    if existing:
        return existing

    key = hashlib.sha256(f"{lead.reference}:{consent_at.isoformat()}".encode("utf-8")).hexdigest()
    job = AutomatedCallJob(
        lead_id=lead.id,
        consent_at=consent_at,
        scheduled_at=datetime.now(timezone.utc),
        status="queued",
        idempotency_key=key,
    )
    db.add(job)
    return job


def cancel_queued_calls(db: Session, lead_id: int, reason: str) -> None:
    jobs = db.scalars(
        select(AutomatedCallJob).where(
            AutomatedCallJob.lead_id == lead_id,
            AutomatedCallJob.status == "queued",
        )
    ).all()
    for job in jobs:
        job.status = "cancelled"
        job.last_error = reason[:500]


def has_processing_call(db: Session, lead_id: int) -> bool:
    return db.scalar(
        select(AutomatedCallJob.id)
        .where(
            AutomatedCallJob.lead_id == lead_id,
            AutomatedCallJob.status == "processing",
        )
        .limit(1)
    ) is not None


def _call_hours() -> tuple[int, int]:
    try:
        start = int(config.env("RETELL_CALL_START_HOUR", "10"))
        end = int(config.env("RETELL_CALL_END_HOUR", "19"))
    except ValueError as error:
        raise RuntimeError("RETELL_CALL_START_HOUR and RETELL_CALL_END_HOUR must be whole hours.") from error
    if not 0 <= start < end <= 24:
        raise RuntimeError("Retell call hours must satisfy 0 <= start < end <= 24.")
    return start, end


def _matches_contact_time(contact_time: str | None, local: datetime) -> bool:
    if not contact_time:
        return True
    preference = contact_time.lower()
    if "morning" in preference:
        return 10 <= local.hour < 12
    if "afternoon" in preference:
        return 12 <= local.hour < 16
    if "evening" in preference:
        return 16 <= local.hour < 19
    return True


def _has_recent_call(db: Session, lead_id: int, now: datetime) -> bool:
    return db.scalar(
        select(VoiceCall.call_id)
        .where(
            VoiceCall.lead_id == lead_id,
            VoiceCall.status.in_(ACTIVE_CALL_STATUSES),
            VoiceCall.created_at >= now - timedelta(minutes=30),
        )
        .limit(1)
    ) is not None


def _recover_stale_claims(db: Session, now: datetime) -> None:
    stale_before = now - STALE_CLAIM_AGE
    jobs = db.scalars(
        select(AutomatedCallJob).where(
            AutomatedCallJob.status == "processing",
            AutomatedCallJob.claimed_at < stale_before,
        )
    ).all()
    for job in jobs:
        job.status = "queued"
        job.scheduled_at = now
        job.claimed_at = None
        job.last_error = "Recovered an unfinished scheduler attempt; retrying with the same idempotency key."
    if jobs:
        db.commit()


def run_scheduled_calls(db: Session, now: datetime | None = None) -> int:
    if not config.env_bool("RETELL_AUTO_CALLS_ENABLED", False):
        logger.info("Automated Retell calls are disabled.")
        return 0

    current = _utc(now or datetime.now(timezone.utc))
    _recover_stale_claims(db, current)
    start, end = _call_hours()
    local = current.astimezone(IST)
    if local.weekday() >= 6 or not start <= local.hour < end:
        return 0

    candidates = db.scalars(
        select(AutomatedCallJob)
        .where(
            AutomatedCallJob.status == "queued",
            AutomatedCallJob.scheduled_at <= current,
        )
        .order_by(AutomatedCallJob.scheduled_at, AutomatedCallJob.id)
        .limit(100)
        .with_for_update(skip_locked=True)
    ).all()

    eligible: list[AutomatedCallJob] = []
    seen_leads: set[int] = set()
    for job in candidates:
        lead = db.get(Lead, job.lead_id)
        if (
            lead is None
            or not lead.call_consent
            or lead.call_consent_at is None
            or _utc(lead.call_consent_at) != _utc(job.consent_at)
        ):
            job.status = "cancelled"
            job.last_error = "Consent is no longer active."
            continue
        if not _matches_contact_time(lead.contact_time, local):
            job.scheduled_at = current + timedelta(minutes=15)
            continue
        if lead.id in seen_leads:
            continue
        if _has_recent_call(db, lead.id, current):
            job.status = "cancelled"
            job.last_error = "A recent call is already active for this lead."
            continue
        eligible.append(job)
        seen_leads.add(lead.id)
        if len(eligible) >= MAX_CALLS_PER_RUN:
            break

    if not eligible:
        db.commit()
        return 0
    if not retell_configured():
        db.commit()
        raise RuntimeError("Automated calls are queued, but Retell credentials are not configured.")

    for job in eligible:
        job.status = "processing"
        job.attempt_count += 1
        job.claimed_at = current
    db.commit()

    started = 0
    for job_id in [job.id for job in eligible]:
        job = db.get(AutomatedCallJob, job_id)
        if job is None:
            continue
        lead = db.get(Lead, job.lead_id)
        if (
            lead is None
            or not lead.call_consent
            or lead.call_consent_at is None
            or _utc(lead.call_consent_at) != _utc(job.consent_at)
        ):
            job.status = "cancelled"
            job.claimed_at = None
            job.last_error = "Consent was withdrawn before the call started."
            db.commit()
            continue
        if _has_recent_call(db, lead.id, current):
            job.status = "cancelled"
            job.claimed_at = None
            job.last_error = "A recent call is already active for this lead."
            db.commit()
            continue

        try:
            result = create_retell_phone_call(
                db,
                lead,
                idempotency_key=job.idempotency_key,
                automated=True,
            )
        except RetellCallError as error:
            retry = error.retryable and job.attempt_count < MAX_ATTEMPTS
            job.status = "queued" if retry else "failed"
            job.scheduled_at = current + RETRY_DELAY if retry else current
            job.claimed_at = None
            job.last_error = str(error)[:500]
            db.commit()
            continue

        if db.get(VoiceCall, result["call_id"]) is None:
            db.add(
                VoiceCall(
                    call_id=result["call_id"],
                    lead_id=lead.id,
                    direction="outbound",
                    status=result["call_status"],
                    from_number=result["from_number"],
                    to_number=result["to_number"],
                )
            )
        job.status = "started"
        job.call_id = result["call_id"]
        job.claimed_at = None
        job.last_error = ""
        db.commit()
        started += 1

    return started
