import json
from datetime import datetime, timedelta, timezone

import pytest

from app import ratelimit
from app.database import SessionLocal
from app.models import AnalyticsEvent, AuditLog, FollowUp, Lead, Notification, Property, SiteSetting, User


@pytest.fixture(autouse=True)
def clean_state(client):
    ratelimit.reset()
    with SessionLocal() as db:
        for model in (FollowUp, Lead, Notification, AnalyticsEvent, SiteSetting):
            db.query(model).delete()
        db.query(User).filter(User.role.in_(("admin", "agent"))).delete()
        db.commit()
    yield


def sign_in(client, outbox, email="owner@example.com"):
    client.cookies.clear()
    reply = client.post("/auth/login", json={"otp_channel": "email", "email": email})
    assert reply.status_code == 200, reply.text
    verified = client.post("/auth/login/verify", json={"challenge_id": reply.json()["challenge_id"], "code": outbox[-1][2]})
    assert verified.status_code == 200, verified.text
    return verified.json()


def property_body(**overrides):
    body = {
        "slug": "test-towers",
        "name": "Test Towers",
        "developer": "Example Developer",
        "location": "Sector 99, Gurgaon",
        "category": "residential",
        "type": "Luxury Residential",
        "configuration": "3, 4 BHK",
        "status": "Launched",
        "price": "₹3.10 Cr* onwards",
        "price_min_cr": 3.1,
        "image": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab",
        "published": True,
    }
    body.update(overrides)
    return body


def test_seeded_properties_are_public(client):
    listings = client.get("/api/properties").json()
    assert len(listings) >= 1 and all(p["published"] for p in listings)
    assert client.get(f"/properties/{listings[0]['slug']}").status_code == 200
    assert client.get("/properties/does-not-exist").status_code == 404


def test_property_crud_creates_real_notifications(client, outbox):
    assert client.post("/admin/properties", json=property_body()).status_code == 401
    assert sign_in(client, outbox)["role"] == "owner"

    created = client.post("/admin/properties", json=property_body())
    assert created.status_code == 201, created.text
    pid = created.json()["id"]
    assert client.post("/admin/properties", json=property_body()).status_code == 409
    assert client.post("/admin/properties", json=property_body(slug="Bad Slug!")).status_code == 422

    client.put(f"/admin/properties/{pid}", json=property_body(price="₹3.40 Cr* onwards", offer="No pre-EMI till possession"))
    client.put(f"/admin/properties/{pid}", json=property_body(price="₹3.40 Cr* onwards", offer="No pre-EMI till possession", availability="limited"))
    titles = [n["title"] for n in client.get("/notifications/public").json()["items"]]
    assert "New property listed: Test Towers" in titles
    assert "Price update: Test Towers" in titles
    assert "New offer: Test Towers" in titles
    assert "Availability update: Test Towers" in titles

    client.put(f"/admin/properties/{pid}", json=property_body(published=False))
    assert all(p["slug"] != "test-towers" for p in client.get("/properties").json())
    assert any(p["slug"] == "test-towers" for p in client.get("/admin/properties").json())
    assert client.delete(f"/admin/properties/{pid}").status_code == 204


def test_team_members_roles_and_assignment(client, outbox):
    sign_in(client, outbox)
    agent = client.post("/admin/team", json={"name": "Asha Agent", "email": "asha@example.com", "role": "agent"})
    assert agent.status_code == 201, agent.text
    agent_id = agent.json()["id"]
    reference = client.post("/leads", json={"kind": "callback", "name": "Ravi Kumar", "phone": "9876500001"}).json()["reference"]
    assigned = client.patch(f"/leads/{reference}", json={"assigned_to_id": agent_id})
    assert assigned.json()["assigned_to_id"] == agent_id

    # The agent signs in by email code and can work leads but not manage properties, team or settings.
    assert sign_in(client, outbox, "asha@example.com")["role"] == "agent"
    assert client.get("/leads").status_code == 200
    assert client.post("/admin/properties", json=property_body(slug="agent-try")).status_code == 403
    assert client.post("/admin/team", json={"name": "X Y", "email": "x@example.com"}).status_code == 403
    assert client.put("/admin/settings", json={}).status_code == 403

    note = client.post(
        f"/leads/{reference}/follow-ups",
        json={"note": "Called, wants a Saturday visit", "status": "contacted",
              "next_action_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()},
    )
    assert note.status_code == 201, note.text
    assert client.get(f"/leads/{reference}/follow-ups").json()[0]["author_name"] == "Asha Agent"
    assert client.get("/leads/follow-ups/due?scope=overdue").json()["total"] == 1
    titles = [n["title"] for n in client.get("/notifications").json()["items"]]
    assert "Follow-up due: Ravi Kumar" in titles

    # Deactivated members lose access.
    sign_in(client, outbox)
    client.patch(f"/admin/team/{agent_id}", json={"is_active": False})
    assert client.post("/auth/login", json={"otp_channel": "email", "email": "asha@example.com"}).status_code in (401, 403)


def test_unknown_email_still_rejected(client, outbox):
    assert client.post("/auth/login", json={"otp_channel": "email", "email": "nobody@example.com"}).status_code == 401


def test_csrf_header_required_for_signed_in_writes(client, outbox):
    sign_in(client, outbox)
    blocked = client.post("/notifications/read-all", headers={"X-Requested-With": ""})
    assert blocked.status_code == 403
    assert client.post("/notifications/read-all").status_code == 204


def test_analytics_collect_and_summary(client, outbox):
    batch = {
        "visitor_id": "visitor_abc123",
        "session_id": "session_abc123",
        "source": "organic",
        "referrer_host": "www.google.com",
        "device": "mobile",
        "events": [
            {"name": "page_view", "path": "/projects/sobha-city-gurgaon?phone=98765"},
            {"name": "property_view", "path": "/projects/sobha-city-gurgaon", "property_slug": "sobha-city-gurgaon"},
            {"name": "whatsapp_click", "path": "/"},
            {"name": "not_allowed", "path": "/"},
        ],
    }
    # sendBeacon style: text/plain body, no custom header.
    sent = client.post("/api/analytics/events", content=json.dumps(batch), headers={"Content-Type": "text/plain"})
    assert sent.status_code == 204, sent.text
    assert client.post("/analytics/events", json={**batch, "visitor_id": "x"}).status_code == 422
    assert client.get("/admin/analytics").status_code == 401

    sign_in(client, outbox)
    data = client.get("/admin/analytics?days=7").json()
    assert data["totals"]["visitors"] == 1 and data["totals"]["page_views"] == 1
    assert data["top_pages"][0]["path"] == "/projects/sobha-city-gurgaon"  # query string dropped
    assert data["top_properties"][0]["slug"] == "sobha-city-gurgaon"
    assert data["interactions"]["whatsapp_click"] == 1 and "not_allowed" not in data["interactions"]
    assert data["sources"][0]["source"] == "organic"


def test_overview_customers_reports_settings(client, outbox):
    for phone, kind in (("9876500011", "callback"), ("9876500011", "contact"), ("9876500012", "contact")):
        client.post("/leads", json={"kind": kind, "name": "Meera Shah", "phone": phone, "requirement": "buy", "source": "organic"})
    sign_in(client, outbox)
    overview = client.get("/admin/overview").json()
    assert overview["leads"]["total"] == 3 and overview["unassigned"] == 3
    customers = client.get("/admin/customers").json()
    assert customers["total"] == 2 and customers["items"][0]["enquiries"] in (1, 2)
    report = client.get("/admin/reports").json()
    assert report["total"] == 3 and report["by_requirement"][0] == {"key": "buy", "count": 3}

    bad = client.put("/admin/settings", json={"social": {"instagram": "http://insecure"}})
    assert bad.status_code == 422
    saved = client.put("/admin/settings", json={"social": {"instagram": "https://instagram.com/gratia"}, "business_hours": "Mon–Sat"})
    assert saved.status_code == 200
    assert client.get("/settings/public").json()["social"]["instagram"] == "https://instagram.com/gratia"


def test_crm_summary_uses_real_leads_and_pipeline_updates_are_audited(client, outbox):
    lead = client.post(
        "/leads",
        json={
            "kind": "property_enquiry",
            "name": "Aarav Sharma",
            "phone": "9876500081",
            "property_name": "Test Towers",
            "source": "referral",
        },
    ).json()
    assert client.get("/admin/crm/summary").status_code == 401
    sign_in(client, outbox)

    summary = client.get("/admin/crm/summary?period=month")
    assert summary.status_code == 200, summary.text
    data = summary.json()
    assert data["leads"]["total"] == 1
    assert data["leads"]["new"] == 1
    assert data["customers"] == 1
    assert data["by_source"] == [{"label": "referral", "value": 1}]
    assert data["property_demand"] == [{"label": "Test Towers", "value": 1}]

    moved = client.patch(f"/leads/{lead['reference']}", json={"status": "booking"})
    assert moved.status_code == 200, moved.text
    persisted = client.get(f"/leads/{lead['reference']}").json()
    assert persisted["status"] == "booking"
    with SessionLocal() as db:
        assert db.query(AuditLog).filter_by(
            target_type="lead",
            target_id=lead["reference"],
            action="updated",
        ).count() == 1

    updated_summary = client.get("/admin/crm/summary?period=month").json()
    assert {"label": "booking", "value": 1} in updated_summary["by_status"]
    assert client.get(
        "/admin/crm/summary?period=custom&start_date=2026-11-02&end_date=2026-11-01"
    ).status_code == 422


def test_chat_and_push_degrade_gracefully_without_keys(client):
    assert client.get("/chat/status").json() == {"enabled": False}
    assert client.post("/chat", json={"messages": [{"role": "user", "content": "Hi"}]}).status_code == 503
    assert client.get("/push/config").json()["enabled"] is False


def test_visitor_notifications_are_saved_per_device(client, outbox):
    device = "device_key_" + "a" * 32
    other = "device_key_" + "b" * 32
    visit_date = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
    reference = client.post(
        "/leads",
        json={"kind": "visit", "name": "Kabir Rao", "phone": "9876500021", "visit_date": visit_date, "device_token": device},
    ).json()["reference"]

    mine = client.get("/notifications/mine", headers={"X-Device-Token": device}).json()
    assert mine["unread"] == 1 and mine["items"][0]["title"] == "We received your site visit request"
    assert reference in mine["items"][0]["body"]
    assert client.get("/notifications/mine", headers={"X-Device-Token": other}).json()["items"] == []
    assert client.get("/notifications/mine").status_code == 400
    # Visitor messages never appear in the public feed.
    assert client.get("/notifications/public").json()["items"] == []

    sign_in(client, outbox)
    client.patch(f"/leads/{reference}", json={"status": "confirmed"})
    owner_titles = [n["title"] for n in client.get("/notifications").json()["items"]]
    assert "Your visit is confirmed" not in owner_titles
    client.cookies.clear()

    mine = client.get("/notifications/mine", headers={"X-Device-Token": device}).json()
    assert [n["title"] for n in mine["items"]][0] == "Your visit is confirmed"
    first = mine["items"][0]["id"]
    assert client.patch(f"/notifications/mine/{first}", json={"is_read": True}, headers={"X-Device-Token": other}).status_code == 404
    assert client.patch(f"/notifications/mine/{first}", json={"is_read": True}, headers={"X-Device-Token": device}).json()["is_read"]
    assert client.post("/notifications/mine/read-all", headers={"X-Device-Token": device}).status_code == 204
    assert client.delete(f"/notifications/mine/{first}", headers={"X-Device-Token": device}).status_code == 204
    assert len(client.get("/notifications/mine", headers={"X-Device-Token": device}).json()["items"]) == 1


def test_duplicate_from_another_device_still_gets_confirmation(client):
    body = {"kind": "callback", "name": "Nisha Jain", "phone": "9876500031"}
    first = client.post("/leads", json={**body, "device_token": "device_one_" + "c" * 32}).json()
    second = client.post("/leads", json={**body, "device_token": "device_two_" + "d" * 32}).json()
    assert second["duplicate"] and second["reference"] == first["reference"]
    for device in ("device_one_" + "c" * 32, "device_two_" + "d" * 32):
        items = client.get("/notifications/mine", headers={"X-Device-Token": device}).json()["items"]
        assert len(items) == 1 and first["reference"] in items[0]["body"]
