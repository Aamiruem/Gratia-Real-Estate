from app.delivery import sms


def login(client, **body):
    return client.post("/auth/login", json=body)


def test_health_and_api_prefix(client):
    assert client.get("/health").json()["database"] == "ok"
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/videos").status_code == 200


def test_email_otp_sign_in(client, outbox):
    reply = login(client, otp_channel="email", email="Owner@Example.com")
    assert reply.status_code == 200, reply.text
    data = reply.json()
    assert data["delivered_via"] == "email" and "local_code" not in data
    channel, to, code = outbox[-1]
    assert (channel, to) == ("email", "owner@example.com")

    verified = client.post("/auth/login/verify", json={"challenge_id": data["challenge_id"], "code": code})
    assert verified.status_code == 200 and verified.json()["is_video_admin"] is True
    assert client.get("/auth/me").status_code == 200


def test_mobile_otp_accepts_local_formats(client, outbox):
    reply = login(client, otp_channel="phone", phone="09876543210")
    assert reply.status_code == 200, reply.text
    assert reply.json()["sent_to"] == "******3210"
    assert outbox[-1][0] == "sms"


def test_unknown_owner_is_rejected(client, outbox):
    assert login(client, otp_channel="email", email="someone@else.com").status_code == 401
    assert login(client, otp_channel="phone", phone="+91 99999 00000").status_code == 401
    assert outbox == []


def test_cooldown_blocks_repeated_sends(client, outbox):
    assert login(client, otp_channel="email", email="owner@example.com").status_code == 200
    assert login(client, otp_channel="email", email="owner@example.com").status_code == 429
    assert len(outbox) == 1


def test_wrong_code_is_limited(client, outbox):
    challenge = login(client, otp_channel="email", email="owner@example.com").json()["challenge_id"]
    real = outbox[-1][2]
    wrong = "111111" if real != "111111" else "222222"
    for _ in range(4):
        assert client.post("/auth/login/verify", json={"challenge_id": challenge, "code": wrong}).status_code == 401
    assert client.post("/auth/login/verify", json={"challenge_id": challenge, "code": wrong}).status_code == 429
    # The challenge is gone, so even the right code no longer works.
    assert client.post("/auth/login/verify", json={"challenge_id": challenge, "code": real}).status_code == 400


def test_dev_mode_without_provider_logs_code_but_hides_it_from_remote_clients(client):
    reply = login(client, otp_channel="email", email="owner@example.com").json()
    assert reply["delivered_via"] == "log"
    assert "local_code" not in reply  # TestClient is not 127.0.0.1


def test_refresh_cookie_follows_api_prefix(client, outbox):
    challenge = client.post("/api/auth/login", json={"otp_channel": "email", "email": "owner@example.com"}).json()
    response = client.post("/api/auth/login/verify", json={"challenge_id": challenge["challenge_id"], "code": outbox[-1][2]})
    cookies = response.headers.get_list("set-cookie")
    assert any("refresh_token" in c and "Path=/api/auth/refresh" in c for c in cookies)


def test_phone_normalisation():
    assert sms.to_e164("98765 43210") == "+919876543210"
    assert sms.to_e164("09876543210") == "+919876543210"
    assert sms.to_e164("+44 7700 900123") == "+447700900123"
