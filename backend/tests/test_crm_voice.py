from app import ratelimit
from app.routers import admin, crm_voice


def enable_assistant_settings(monkeypatch):
    monkeypatch.setattr(admin, "load_settings", lambda _db: {"ai_assistant_enabled": True})


def sign_in_owner(client, outbox):
    reply = client.post("/auth/login", json={"otp_channel": "email", "email": "owner@example.com"})
    assert reply.status_code == 200, reply.text
    verified = client.post(
        "/auth/login/verify",
        json={"challenge_id": reply.json()["challenge_id"], "code": outbox[-1][2]},
    )
    assert verified.status_code == 200, verified.text


def test_voice_status_reports_safe_test_mode_and_missing_provider_keys(client, outbox, monkeypatch):
    monkeypatch.setattr(crm_voice.config, "env", lambda name, default="": default)
    enable_assistant_settings(monkeypatch)
    sign_in_owner(client, outbox)

    status = client.get("/admin/crm/voice/status")

    assert status.status_code == 200
    assert status.json() == {
        "assistant_enabled": False,
        "assistant_test_mode": True,
        "phone_enabled": False,
        "phone_missing_settings": ["RETELL_API_KEY", "RETELL_AGENT_ID", "RETELL_PHONE_NUMBER"],
        "price_prediction_enabled": True,
    }


def test_voice_assistant_works_without_provider_in_safe_test_mode(client, outbox, monkeypatch):
    ratelimit.reset()
    monkeypatch.setattr(crm_voice.config, "env", lambda name, default="": default)
    enable_assistant_settings(monkeypatch)
    monkeypatch.setattr(crm_voice, "urlopen", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("External provider must not be called in test mode")))
    sign_in_owner(client, outbox)

    response = client.post(
        "/admin/crm/voice/assistant",
        json={"messages": [{"role": "user", "content": "Show CRM call test status"}]},
    )

    assert response.status_code == 200, response.text
    assert response.json()["mode"] == "test"
    assert "no OpenAI request was made" in response.json()["reply"]
    assert "CRM totals:" in response.json()["reply"]


def test_voice_assistant_can_call_read_only_price_estimator(client, outbox, monkeypatch):
    import json

    monkeypatch.setattr(
        crm_voice.config,
        "env",
        lambda name, default="": "test-openai-key" if name == "OPENAI_API_KEY" else default,
    )
    enable_assistant_settings(monkeypatch)
    sign_in_owner(client, outbox)
    tool_result = {
        "choices": [{
            "message": {
                "tool_calls": [{
                    "function": {
                        "name": "estimate_property_price",
                        "arguments": json.dumps({
                            "location": "Gurgaon",
                            "locality": "Golf Course Road",
                            "property_type": "Apartment",
                            "area": 1800,
                            "bedrooms": 3,
                            "bathrooms": 3,
                        }),
                    },
                }],
            },
        }],
    }

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return json.dumps(tool_result).encode()

    monkeypatch.setattr(crm_voice, "urlopen", lambda *_args, **_kwargs: FakeResponse())
    response = client.post(
        "/admin/crm/voice/assistant",
        json={"messages": [{"role": "user", "content": "Estimate this property's price"}]},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mode"] == "live"
    assert body["price_estimate"]["predicted_price"] > 0
    assert body["property_data"]["locality"] == "Golf Course Road"


def test_live_call_is_blocked_without_retell_credentials(client, outbox, monkeypatch):
    monkeypatch.setattr(crm_voice.config, "env", lambda name, default="": default)
    enable_assistant_settings(monkeypatch)
    monkeypatch.setattr(crm_voice, "urlopen", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("No outbound call may be attempted")))
    sign_in_owner(client, outbox)

    response = client.post(
        "/admin/crm/voice/calls",
        json={"lead_reference": "LEAD-TEST", "confirmed": True},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Retell phone calling is not configured."
