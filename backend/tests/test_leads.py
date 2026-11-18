from datetime import date, timedelta

import pytest

from app import ratelimit
from app.database import SessionLocal
from app.models import AutomatedCallJob, Lead, Notification, VoiceCall


@pytest.fixture(autouse=True)
def clean_state(client):
    ratelimit.reset()
    with SessionLocal() as db:
        db.query(AutomatedCallJob).delete()
        db.query(VoiceCall).delete()
        db.query(Lead).delete()
        db.query(Notification).delete()
        db.commit()
    yield


def sign_in_owner(client, outbox):
    reply = client.post("/auth/login", json={"otp_channel": "email", "email": "owner@example.com"})
    code = outbox[-1][2]
    verified = client.post("/auth/login/verify", json={"challenge_id": reply.json()["challenge_id"], "code": code})
    assert verified.status_code == 200, verified.text


def visit(**overrides):
    body = {
        "kind": "visit",
        "name": "Riya Sharma",
        "phone": "98765 43210",
        "email": "riya@example.com",
        "property_slug": "sobha-city-gurgaon",
        "property_name": "Sobha City",
        "visit_date": (date.today() + timedelta(days=2)).isoformat(),
        "visit_time": "Morning (10 AM - 12 PM)",
    }
    body.update(overrides)
    return body


def test_lead_is_saved_with_reference_and_owner_notification(client, outbox):
    reply = client.post("/api/leads", json=visit())
    assert reply.status_code == 201, reply.text
    data = reply.json()
    assert data["reference"].startswith("GE-") and data["status"] == "requested"

    # Visitors cannot read leads or owner notifications.
    assert client.get("/leads").status_code == 401
    assert client.get("/notifications").status_code == 401
    assert client.get("/notifications/public").json()["items"] == []

    sign_in_owner(client, outbox)
    leads = client.get("/leads?kind=appointments").json()
    assert leads["total"] == 1 and leads["items"][0]["phone"] == "+919876543210"
    feed = client.get("/notifications").json()
    assert feed["unread"] == 1 and feed["items"][0]["title"] == "New property viewing request"
    assert feed["items"][0]["lead_reference"] == data["reference"]


def test_duplicate_submission_returns_same_reference(client):
    first = client.post("/leads", json=visit())
    second = client.post("/leads", json=visit(phone="+91 98765-43210"))
    assert second.status_code == 200 and second.json()["duplicate"] is True
    assert second.json()["reference"] == first.json()["reference"]
    with SessionLocal() as db:
        assert db.query(Lead).count() == 1


def test_call_consent_is_optional_and_duplicate_opt_in_queues_once(client):
    first = client.post("/leads", json=visit())
    assert first.status_code == 201
    with SessionLocal() as db:
        assert db.query(AutomatedCallJob).count() == 0

    opted_in = client.post("/leads", json=visit(call_consent=True))
    repeated = client.post("/leads", json=visit(call_consent=True))

    assert opted_in.status_code == 200 and opted_in.json()["duplicate"] is True
    assert repeated.status_code == 200 and repeated.json()["reference"] == first.json()["reference"]
    with SessionLocal() as db:
        lead = db.query(Lead).one()
        assert lead.call_consent is True
        assert lead.call_consent_at is not None
        assert db.query(AutomatedCallJob).count() == 1


@pytest.mark.parametrize(
    "overrides",
    [
        {"phone": "12345"},
        {"phone": "5876543210"},  # Indian mobiles start with 6-9
        {"name": "1"},
        {"email": "not-an-email"},
        {"visit_date": None},
        {"visit_date": (date.today() + timedelta(days=400)).isoformat()},
        {"kind": "spam"},
    ],
)
def test_invalid_leads_are_rejected(client, overrides):
    assert client.post("/leads", json=visit(**overrides)).status_code == 422


def test_honeypot_is_not_stored(client):
    reply = client.post("/leads", json=visit(website="http://spam.example"))
    assert reply.status_code == 201
    with SessionLocal() as db:
        assert db.query(Lead).count() == 0


def test_rate_limit(client):
    statuses = [
        client.post("/leads", json={"kind": "callback", "name": "Test Person", "phone": f"98765{i:05d}"}).status_code
        for i in range(7)
    ]
    assert statuses[:6] == [201] * 6 and statuses[6] == 429


def test_owner_manages_leads_and_notifications(client, outbox):
    reference = client.post("/leads", json={"kind": "callback", "name": "Aman", "phone": "9123456789"}).json()["reference"]
    sign_in_owner(client, outbox)

    assert client.patch(f"/leads/{reference}", json={"status": "requested"}).status_code == 422
    updated = client.patch(f"/leads/{reference}", json={"status": "contacted", "owner_notes": "Called back"})
    assert updated.json()["status"] == "contacted"
    assert client.get("/leads/stats").json()["by_kind"] == {"callback": 1}
    csv = client.get("/leads/export.csv")
    assert csv.status_code == 200 and reference in csv.text

    item = client.get("/notifications").json()["items"][0]
    assert client.patch(f"/notifications/{item['id']}", json={"is_read": True}).json()["is_read"] is True
    assert client.post("/notifications/read-all").status_code == 204
    assert client.get("/notifications").json()["unread"] == 0
    assert client.delete(f"/notifications/{item['id']}").status_code == 204
    assert client.get("/notifications").json()["items"] == []


def test_announcements_and_new_videos_are_public(client, outbox):
    assert client.post("/notifications/announce", json={"title": "New property added"}).status_code == 401
    sign_in_owner(client, outbox)
    made = client.post(
        "/notifications/announce",
        json={"title": "New property added: Sobha City", "link": "/projects/sobha-city-gurgaon"},
    )
    assert made.status_code == 201, made.text
    assert client.post("/notifications/announce", json={"title": "Bad link", "link": "https://evil.example"}).status_code == 422

    video = {"id": "test-video-1", "title": "Walkthrough", "url": "https://www.youtube.com/watch?v=mH9yBnohESM"}
    assert client.put("/videos/test-video-1", json=video).status_code == 200
    assert client.put("/videos/test-video-1", json=video).status_code == 200  # an edit is not "new"
    client.delete("/videos/test-video-1")

    titles = [n["title"] for n in client.get("/notifications/public").json()["items"]]
    assert titles == ["New video: Walkthrough", "New property added: Sobha City"]
