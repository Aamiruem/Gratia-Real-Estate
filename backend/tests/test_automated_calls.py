from datetime import datetime, timedelta, timezone

import pytest

from app import ratelimit
from app import automated_calls
from app.automated_calls import enqueue_automated_call, run_scheduled_calls
from app.database import SessionLocal, create_tables
from app.models import AutomatedCallJob, Lead, Property, VoiceCall
from app.retell import RetellCallError
from app import retell


@pytest.fixture(autouse=True)
def clear_call_state():
    create_tables()
    ratelimit.reset()
    with SessionLocal() as db:
        db.query(AutomatedCallJob).delete()
        db.query(VoiceCall).delete()
        db.query(Lead).delete()
        db.commit()


def create_consented_lead(**overrides):
    fields = {
        "kind": "callback",
        "status": "new",
        "reference": "GE-261105-VOICE",
        "name": "Riya Sharma",
        "phone": "+919876543210",
        "call_consent": True,
        "call_consent_at": datetime(2026, 1, 5, 4, 29, tzinfo=timezone.utc),
        "contact_time": None,
    }
    fields.update(overrides)
    with SessionLocal() as db:
        lead = Lead(**fields)
        db.add(lead)
        db.flush()
        job = enqueue_automated_call(db, lead)
        assert job is not None
        job.scheduled_at = datetime(2026, 1, 5, 4, 29, tzinfo=timezone.utc)
        db.commit()
        return job.id


def test_enqueue_reuses_job_for_same_consent_timestamp():
    with SessionLocal() as db:
        lead = Lead(
            kind="callback",
            status="new",
            reference="GE-261105-VOICE",
            name="Riya Sharma",
            phone="+919876543210",
            call_consent=True,
            call_consent_at=datetime(2026, 1, 5, 4, 29, tzinfo=timezone.utc),
        )
        db.add(lead)
        db.flush()
        first = enqueue_automated_call(db, lead)
        second = enqueue_automated_call(db, lead)

        assert first is not None and second is not None
        assert first.id == second.id
        assert db.query(AutomatedCallJob).count() == 1


def configure_scheduler(monkeypatch, start_call):
    monkeypatch.setattr(automated_calls.config, "env_bool", lambda name, default=False: True if name == "RETELL_AUTO_CALLS_ENABLED" else default)
    monkeypatch.setattr(automated_calls.config, "env", lambda name, default="": {"RETELL_CALL_START_HOUR": "10", "RETELL_CALL_END_HOUR": "19"}.get(name, default))
    monkeypatch.setattr(automated_calls, "retell_configured", lambda: True)
    monkeypatch.setattr(automated_calls, "create_retell_phone_call", start_call)


def test_scheduler_waits_until_ist_business_hours_and_starts_once(monkeypatch):
    ratelimit.reset()
    job_id = create_consented_lead()
    calls = []

    def fake_start(_db, lead, *, idempotency_key, automated):
        calls.append((lead.id, idempotency_key, automated))
        return {
            "call_id": "retell-call-1",
            "call_status": "registered",
            "from_number": "+911111111111",
            "to_number": lead.phone,
        }

    configure_scheduler(monkeypatch, fake_start)
    before_open = datetime(2026, 1, 5, 4, 29, tzinfo=timezone.utc)
    open_time = datetime(2026, 1, 5, 4, 30, tzinfo=timezone.utc)
    with SessionLocal() as db:
        assert run_scheduled_calls(db, before_open) == 0
        assert calls == []
        assert run_scheduled_calls(db, open_time) == 1
        assert run_scheduled_calls(db, open_time + timedelta(minutes=5)) == 0
        job = db.get(AutomatedCallJob, job_id)
        assert job is not None and job.status == "started"
        assert job.attempt_count == 1
        assert db.query(VoiceCall).count() == 1
    assert len(calls) == 1 and calls[0][2] is True


def test_scheduler_honors_requested_contact_window(monkeypatch):
    ratelimit.reset()
    create_consented_lead(contact_time="Afternoon (12 PM – 4 PM)")
    calls = []

    def fake_start(_db, lead, **_kwargs):
        calls.append(lead.id)
        return {
            "call_id": "retell-call-2",
            "call_status": "registered",
            "from_number": "+911111111111",
            "to_number": lead.phone,
        }

    configure_scheduler(monkeypatch, fake_start)
    with SessionLocal() as db:
        assert run_scheduled_calls(db, datetime(2026, 1, 5, 4, 30, tzinfo=timezone.utc)) == 0
        assert calls == []
        assert run_scheduled_calls(db, datetime(2026, 1, 5, 6, 30, tzinfo=timezone.utc)) == 1
    assert len(calls) == 1


def test_scheduler_retries_transient_retell_error_with_same_idempotency_key(monkeypatch):
    ratelimit.reset()
    create_consented_lead()
    keys = []

    def fail_once(_db, _lead, *, idempotency_key, **_kwargs):
        keys.append(idempotency_key)
        if len(keys) == 1:
            raise RetellCallError("Retell returned HTTP 503.", status_code=503, retryable=True)
        return {
            "call_id": "retell-call-3",
            "call_status": "registered",
            "from_number": "+911111111111",
            "to_number": "+919876543210",
        }

    configure_scheduler(monkeypatch, fail_once)
    first_try = datetime(2026, 1, 5, 4, 30, tzinfo=timezone.utc)
    with SessionLocal() as db:
        assert run_scheduled_calls(db, first_try) == 0
        job = db.query(AutomatedCallJob).one()
        assert job.status == "queued" and job.attempt_count == 1
        assert job.scheduled_at.replace(tzinfo=timezone.utc) == first_try + timedelta(minutes=15)
        assert run_scheduled_calls(db, first_try + timedelta(minutes=15)) == 1
        assert db.query(VoiceCall).count() == 1
    assert len(keys) == 2 and keys[0] == keys[1]


def test_scheduler_cancels_call_when_consent_is_withdrawn(monkeypatch):
    ratelimit.reset()
    job_id = create_consented_lead()
    calls = []

    def fake_start(*_args, **_kwargs):
        calls.append(True)
        raise AssertionError("A withdrawn consent must never start a call.")

    configure_scheduler(monkeypatch, fake_start)
    with SessionLocal() as db:
        job = db.get(AutomatedCallJob, job_id)
        assert job is not None
        lead = db.get(Lead, job.lead_id)
        assert lead is not None
        lead.call_consent = False
        lead.call_consent_at = None
        db.commit()
        assert run_scheduled_calls(db, datetime(2026, 1, 5, 4, 30, tzinfo=timezone.utc)) == 0
        assert job.status == "cancelled"
    assert calls == []


def test_scheduler_recovers_recent_stale_claim_with_same_idempotency_key(monkeypatch):
    ratelimit.reset()
    job_id = create_consented_lead()
    with SessionLocal() as db:
        job = db.get(AutomatedCallJob, job_id)
        assert job is not None
        job.status = "processing"
        job.attempt_count = 1
        job.claimed_at = datetime(2026, 1, 5, 4, 30, tzinfo=timezone.utc)
        original_key = job.idempotency_key
        db.commit()

    calls = []

    def fake_start(_db, lead, *, idempotency_key, automated):
        calls.append((idempotency_key, automated))
        return {
            "call_id": "retell-recovered-call",
            "call_status": "registered",
            "from_number": "+911111111111",
            "to_number": lead.phone,
        }

    configure_scheduler(monkeypatch, fake_start)
    with SessionLocal() as db:
        assert run_scheduled_calls(db, datetime(2026, 1, 5, 4, 45, tzinfo=timezone.utc)) == 1
        job = db.get(AutomatedCallJob, job_id)
        assert job is not None and job.status == "started"
        assert job.idempotency_key == original_key
        assert job.attempt_count == 2
    assert calls == [(original_key, True)]


def test_scheduler_does_not_retry_stale_claim_after_idempotency_window(monkeypatch):
    ratelimit.reset()
    job_id = create_consented_lead()
    with SessionLocal() as db:
        job = db.get(AutomatedCallJob, job_id)
        assert job is not None
        job.status = "processing"
        job.attempt_count = 1
        job.claimed_at = datetime(2026, 1, 5, 4, 30, tzinfo=timezone.utc)
        db.commit()

    calls = []

    def fake_start(*_args, **_kwargs):
        calls.append(True)
        raise AssertionError("An uncertain call must not be retried after idempotency expires.")

    configure_scheduler(monkeypatch, fake_start)
    with SessionLocal() as db:
        assert run_scheduled_calls(db, datetime(2026, 1, 5, 5, 30, tzinfo=timezone.utc)) == 0
        job = db.get(AutomatedCallJob, job_id)
        assert job is not None and job.status == "failed"
        assert "review it before retrying" in job.last_error
    assert calls == []


def test_retell_context_contains_published_properties_only(monkeypatch):
    settings = {
        "RETELL_AGENT_ID": "test-agent",
        "RETELL_PHONE_NUMBER": "+911111111111",
        "OWNER_PHONE_NUMBER": "+919876543210",
    }
    monkeypatch.setattr(retell.config, "env", lambda name, default="": settings.get(name, default))
    with SessionLocal() as db:
        lead = Lead(
            reference="GE-261105-VOICE",
            kind="callback",
            status="new",
            name="Riya Sharma",
            phone="+919876543210",
        )
        db.add_all(
            [
                lead,
                Property(slug="published-test-home", name="Published Test Home", location="Sector 1"),
                Property(
                    slug="unpublished-test-home",
                    name="Unpublished Test Home",
                    location="Sector 2",
                    published=False,
                ),
            ]
        )
        db.flush()
        payload = retell.build_call_payload(db, lead, idempotency_key="test-key", automated=True)

        assert payload["to_number"] == lead.phone
        assert payload["metadata"]["automated_follow_up"] is True
        variables = payload["retell_llm_dynamic_variables"]
        assert "Published Test Home" in variables["published_properties"]
        assert "Unpublished Test Home" not in variables["published_properties"]
        assert variables["human_handoff_number"] == "+919876543210"
        db.rollback()
