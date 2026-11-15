"""WhatsApp OTP through the Meta WhatsApp Cloud API (provider calls are mocked;
real delivery needs an approved authentication template)."""

import pytest

from app import otp
from app.delivery import DeliveryError, sms, whatsapp


@pytest.fixture()
def whatsapp_env(monkeypatch):
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "1234567890")
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("WHATSAPP_OTP_TEMPLATE", "gratia_login_code")
    sent = []

    def fake_post_json(url, payload, *, headers, provider):
        sent.append((url, payload, headers))
        return {"messages": [{"id": "wamid.TEST"}]}

    monkeypatch.setattr(whatsapp, "post_json", fake_post_json)
    return sent


def test_payload_uses_approved_authentication_template(whatsapp_env):
    assert whatsapp.send("+919876543210", "482913") == "wamid.TEST"
    url, payload, headers = whatsapp_env[0]
    assert url == "https://graph.facebook.com/v21.0/1234567890/messages"
    assert headers["Authorization"] == "Bearer test-token"
    assert payload["to"] == "919876543210" and payload["type"] == "template"
    assert payload["template"]["name"] == "gratia_login_code"
    body, button = payload["template"]["components"]
    assert body["parameters"][0]["text"] == "482913"
    assert button["sub_type"] == "url" and button["parameters"][0]["text"] == "482913"


def test_not_available_without_configuration(monkeypatch):
    for name in ("WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_OTP_TEMPLATE"):
        monkeypatch.delenv(name, raising=False)
    assert otp.whatsapp_otp_available() is False
    with pytest.raises(DeliveryError):
        otp.send_whatsapp_code("+919876543210", "123456")


def test_failure_never_falls_back_to_sms(monkeypatch, whatsapp_env):
    def broken(*args, **kwargs):
        raise DeliveryError("WhatsApp rejected the message (HTTP 400).")

    texted = []
    monkeypatch.setattr(whatsapp, "post_json", broken)
    monkeypatch.setattr(sms, "send", lambda *a, **k: texted.append(a))
    with pytest.raises(DeliveryError):
        otp.send_whatsapp_code("+919876543210", "123456")
    assert texted == []


def test_owner_signs_in_with_whatsapp_code(client, whatsapp_env):
    client.headers.update({"X-Requested-With": "fetch"})
    assert client.get("/auth/otp/options").json()["whatsapp"] is True
    assert client.post("/auth/login", json={"otp_channel": "whatsapp", "phone": "+91 99999 00000"}).status_code == 401

    reply = client.post("/auth/login", json={"otp_channel": "whatsapp", "phone": "98765 43210"})
    assert reply.status_code == 200, reply.text
    data = reply.json()
    assert data["delivered_via"] == "whatsapp" and data["challenge_id"].startswith("wa_")
    assert data["sent_to"] == "******3210" and "local_code" not in data
    code = whatsapp_env[-1][1]["template"]["components"][0]["parameters"][0]["text"]
    verified = client.post("/auth/login/verify", json={"challenge_id": data["challenge_id"], "code": code})
    assert verified.status_code == 200 and verified.json()["is_video_admin"] is True
