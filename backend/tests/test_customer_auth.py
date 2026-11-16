from app import otp
from app.routers import auth


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

    verified = client.post(
        "/auth/login/verify",
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
