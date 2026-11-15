"""SMS OTP setup: provider choice, phone formats, and SMS-only delivery once configured."""

import pytest

from app import configure_otp, otp
from app.delivery import DeliveryError, email, sms


def answers(monkeypatch, inputs, secrets=()):
    inputs, secrets = iter(inputs), iter(secrets)
    monkeypatch.setattr("builtins.input", lambda prompt="": next(inputs))
    monkeypatch.setattr(configure_otp.getpass, "getpass", lambda prompt="": next(secrets))


@pytest.mark.parametrize(
    "typed, expected",
    [
        ("98765 43210", "+919876543210"),
        ("098765-43210", "+919876543210"),
        ("+91 98765 43210", "+919876543210"),
        ("919876543210", "+919876543210"),
        ("+44 7700 900123", "+447700900123"),
    ],
)
def test_owner_phone_formats(monkeypatch, typed, expected):
    answers(monkeypatch, [typed])
    assert configure_otp._owner_phone({}) == expected


def test_invalid_phone_is_rejected(monkeypatch):
    answers(monkeypatch, ["12345"])
    with pytest.raises(ValueError):
        configure_otp._owner_phone({})


def test_fast2sms_setup_sets_provider_and_key(monkeypatch):
    answers(monkeypatch, ["1", "98765 43210"], secrets=["key-123"])
    assert configure_otp._configure_sms({}) == {
        "OWNER_PHONE_NUMBER": "+919876543210",
        "SMS_PROVIDER": "fast2sms",
        "FAST2SMS_API_KEY": "key-123",
    }


def test_fast2sms_refuses_non_indian_numbers(monkeypatch):
    answers(monkeypatch, ["1", "+44 7700 900123"])
    with pytest.raises(ValueError, match="Indian"):
        configure_otp._configure_sms({})


def test_configured_sms_is_used_instead_of_ntfy(monkeypatch):
    """With a provider set, mobile codes go by SMS only, never to the ntfy app."""
    monkeypatch.setenv("SMS_PROVIDER", "fast2sms")
    monkeypatch.setenv("FAST2SMS_API_KEY", "key-123")
    monkeypatch.setenv("NTFY_TOPIC", "some-topic")
    sent, pushed = [], []
    monkeypatch.setattr(sms, "_fast2sms", lambda e164, code: sent.append((e164, code)))
    monkeypatch.setattr(otp, "send_push_code", lambda code, purpose: pushed.append(code) or True)

    assert otp.send_sms_code("98765 43210", "123456") == "sms"
    assert sent == [("+919876543210", "123456")]
    assert pushed == []


def test_ntfy_is_not_reported_or_used_as_normal_email_or_sms_otp(client, monkeypatch):
    monkeypatch.setattr(email, "configured", lambda: False)
    monkeypatch.setattr(sms, "configured", lambda: False)
    monkeypatch.setattr(otp, "console_fallback_enabled", lambda: False)
    monkeypatch.setattr(otp, "push_configured", lambda: True)
    pushed = []
    monkeypatch.setattr(otp, "send_push_code", lambda *args: pushed.append(args) or True)

    options = client.get("/auth/otp/options").json()
    assert options["email"] is False
    assert options["phone"] is False
    assert options["email_hint"] == "Email provider is not configured"
    assert options["phone_hint"] == "SMS provider is not configured"
    with pytest.raises(DeliveryError, match="real email or SMS provider"):
        otp.send_sms_code("+919876543210", "123456")
    assert pushed == []

    response = client.post("/auth/login", json={"otp_channel": "phone", "phone": "+91 98765 43210"})
    assert response.status_code == 503
