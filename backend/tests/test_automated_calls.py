from datetime import datetime, timedelta, timezone

import pytest

from app import ratelimit
from app import automated_calls
from app.automated_calls import run_scheduled_calls
from app.database import SessionLocal, create_tables
from app.models import AutomatedCallJob, Lead, VoiceCall
from app.retell import RetellCallError


@pytest.fixture(autouse=True)
def clear_call_state():
    create_tables()
    ratelimit.reset()
    with SessionLocal() as db:
        db.query(AutomatedCallJob).delete()
        db.query(VoiceCall).delete()
        db.query(Lead).delete()
        db.commit()


def create_consented_lead(client, **overrides):
    body = {
        "kind": "callback",
        "name": "Riya Sharma",
        "phone": "98765 43210",
        "call_consent": True,
    }
    body.update(overrides)
    response = client.post("/leads", json=body)
    assert response.status_code == 201, response.text
    with SessionLocal() as db:
        job = db.query(AutomatedCallJob).one()
        job.scheduled_at = datetime(2026, 1, 5, 4, 29, tzinfo=timezone.utc)
        db.commit()
        return job.id


def configure_scheduler(monkeypatch, start_call):
    monkeypatch.setattr(automated_calls.config, "env_bool", lambda name, default=False: True if name == "RETELL_AUTO_CALLS_ENABLED" else default)
    monkeypatch.setattr(automated_calls.config, "env", lambda name, default="": {"RETELL_CALL_START_HOUR": "10", "RETELL_CALL_END_HOUR": "19"}.get(name, default))
    monkeypatch.setattr(automated_calls, "retell_configured", lambda: True)
    monkeypatch.setattr(automated_calls, "create_retell_phone_call", start_call)


def test_scheduler_waits_until_ist_business_hours_and_starts_once(client, monkeypatch):
    ratelimit.reset()
    job_id = create_consented_lead(client)
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


def test_scheduler_honors_requested_contact_window(client, monkeypatch):
    ratelimit.reset()
    create_consented_lead(client, contact_time="Afternoon (12 PM – 4 PM)")
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


def test_scheduler_retries_transient_retell_error_with_same_idempotency_key(client, monkeypatch):
    ratelimit.reset()
    create_consented_lead(client)
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


def test_scheduler_cancels_call_when_consent_is_withdrawn(client, monkeypatch):
    ratelimit.reset()
    job_id = create_consented_lead(client)
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
