from datetime import datetime, timezone

from app import otp
from app.routers import auth
from app.database import SessionLocal
from app.models import CustomerOtpRateLimit, CustomerSignupChallenge, User


def test_phone_signup_and_login_are_optional_customer_auth(client, outbox, monkeypatch):
    monkeypatch.setattr(otp, "phone_delivery_available", lambda: True)
    details = {
        "name": "Property Visitor",
        "email": "visitor@example.com",
        "phone": "98765 43210",
    }

    signup = client.post("/auth/customer/phone/signup", json=details)
    assert signup.status_code == 200, signup.text
    assert signup.json()["sent_to"] == "******3210"
    assert outbox[-1][:2] == ("sms", "+919876543210")
    with SessionLocal() as db:
        assert db.query(User).filter_by(email=details["email"]).first() is None

    verified = client.post(
        "/auth/customer/phone/verify",
        json={"challenge_id": signup.json()["challenge_id"], "code": outbox[-1][2]},
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["user"]["role"] == "user"
    assert verified.json()["is_video_admin"] is False
    assert client.get("/auth/me").status_code == 200

    client.post("/auth/logout")
    login = client.post("/auth/customer/phone/login", json={"phone": details["phone"]})
    assert login.status_code == 200, login.text
    assert outbox[-1][:2] == ("sms", "+919876543210")


def test_expired_unverified_signup_does_not_reserve_customer_details(client, outbox, monkeypatch):
    from datetime import datetime, timedelta, timezone

    monkeypatch.setattr(otp, "phone_delivery_available", lambda: True)
    details = {
        "name": "Temporary Visitor",
        "email": "temporary@example.com",
        "phone": "+91 90000 00002",
    }
    first = client.post("/auth/customer/phone/signup", json=details)
    assert first.status_code == 200, first.text
    repeated = client.post("/auth/customer/phone/signup", json=details)
    assert repeated.status_code == 200
    assert repeated.json()["challenge_id"] == first.json()["challenge_id"]
    with SessionLocal() as db:
        challenge = db.get(CustomerSignupChallenge, first.json()["challenge_id"])
        challenge.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()

    retry = client.post("/auth/customer/phone/signup", json=details)
    assert retry.status_code == 200, retry.text


def test_customer_sms_budget_limits_repeated_phone_requests(client, outbox, monkeypatch):
    monkeypatch.setattr(otp, "phone_delivery_available", lambda: True)
    phone = "+91 90000 00003"
    phone_hash = auth._phone_digest("+919000000003")
    with SessionLocal() as db:
        db.add_all(
            [
                CustomerOtpRateLimit(phone_hash=phone_hash, requested_at=datetime.now(timezone.utc))
                for _ in range(3)
            ]
        )
        db.commit()

    response = client.post(
        "/auth/customer/phone/signup",
        json={"name": "Visitor", "email": "rate-limit@example.com", "phone": phone},
    )
    assert response.status_code == 429
    assert outbox == []


def test_customer_sms_budget_caps_requests_across_distinct_numbers(client, outbox, monkeypatch):
    monkeypatch.setattr(otp, "phone_delivery_available", lambda: True)
    with SessionLocal() as db:
        db.add_all(
            [
                CustomerOtpRateLimit(
                    phone_hash=f"test-phone-{index}",
                    requested_at=datetime.now(timezone.utc),
                )
                for index in range(100)
            ]
        )
        db.commit()

    response = client.post(
        "/auth/customer/phone/signup",
        json={
            "name": "Visitor",
            "email": "global-limit@example.com",
            "phone": "+91 90000 00004",
        },
    )
    assert response.status_code == 429
    assert outbox == []


def test_phone_login_requires_an_existing_customer_account(client, monkeypatch):
    monkeypatch.setattr(otp, "phone_delivery_available", lambda: True)
    response = client.post("/auth/customer/phone/login", json={"phone": "+91 90000 00001"})
    assert response.status_code == 404


def test_google_sign_in_creates_a_customer_account(client, monkeypatch):
    monkeypatch.setattr(auth, "GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(
        auth,
        "_verify_google_credential",
        lambda credential: {
            "email": "google.customer@example.com",
            "email_verified": True,
            "name": "Google Customer",
        },
    )

    response = client.post("/auth/customer/google", json={"credential": "test-google-credential"})
    assert response.status_code == 200, response.text
    assert response.json()["user"]["role"] == "user"
    assert response.json()["user"]["email"] == "google.customer@example.com"


def test_google_sign_in_rejects_an_unverified_email(client, monkeypatch):
    monkeypatch.setattr(auth, "GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(
        auth,
        "_verify_google_credential",
        lambda credential: {
            "email": "unverified@example.com",
            "email_verified": False,
            "name": "Unverified",
        },
    )

    response = client.post("/auth/customer/google", json={"credential": "test-google-credential"})
    assert response.status_code == 401
