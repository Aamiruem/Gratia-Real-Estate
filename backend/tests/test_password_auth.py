import pytest

from app import ratelimit
from app.database import SessionLocal
from app.models import PasswordResetChallenge, User

OWNER = "owner@example.com"
STRONG = "Gurgaon-Homes-2026!"


@pytest.fixture(autouse=True)
def fresh_state(client):
    ratelimit.reset()
    client.headers.update({"X-Requested-With": "fetch"})  # our frontend's CSRF header
    with SessionLocal() as db:
        for user in db.query(User).all():
            user.password_set_at = None
            user.failed_logins = 0
            user.locked_until = None
        db.query(PasswordResetChallenge).delete()
        db.commit()
    yield
    client.cookies.clear()


def otp_sign_in(client, outbox):
    reply = client.post("/auth/login", json={"otp_channel": "email", "email": OWNER})
    assert reply.status_code == 200, reply.text
    code = outbox[-1][2]
    verified = client.post("/auth/login/verify", json={"challenge_id": reply.json()["challenge_id"], "code": code})
    assert verified.status_code == 200, verified.text


def set_first_password(client, outbox, password=STRONG):
    otp_sign_in(client, outbox)
    reply = client.post("/auth/password/set", json={"new_password": password})
    assert reply.status_code == 200, reply.text
    client.cookies.clear()


def login(client, password=STRONG, email=OWNER, remember=True):
    return client.post("/auth/password/login", json={"email": email, "password": password, "remember": remember})


def test_password_cannot_be_used_before_it_is_set(client):
    reply = login(client)
    assert reply.status_code == 401
    assert "one-time code" in reply.json()["detail"]


def test_weak_passwords_are_rejected(client, outbox):
    otp_sign_in(client, outbox)
    for weak in ["short1A!", "aaaaaaaaaaaa", "alllowercaseletters", "owner-Password-123"]:
        reply = client.post("/auth/password/set", json={"new_password": weak})
        assert reply.status_code == 422, weak


def test_set_password_then_sign_in(client, outbox):
    set_first_password(client, outbox)
    assert client.get("/auth/me").status_code == 401

    assert login(client, "Wrong-Password-99").status_code == 401
    assert login(client, email="nobody@example.com").status_code == 401
    reply = login(client)
    assert reply.status_code == 200, reply.text
    assert reply.json()["is_video_admin"] is True
    assert client.get("/auth/me").status_code == 200
    assert client.get("/auth/password/status").json()["password_set"] is True

    # Changing it requires the current password.
    assert client.post("/auth/password/set", json={"new_password": "Another-Strong-Pass-7"}).status_code == 400
    changed = client.post(
        "/auth/password/set", json={"current_password": STRONG, "new_password": "Another-Strong-Pass-7"}
    )
    assert changed.status_code == 200
    assert client.get("/auth/me").status_code == 200  # this device stays signed in


def test_lockout_after_repeated_failures(client, outbox):
    set_first_password(client, outbox)
    for _ in range(5):
        assert login(client, "Wrong-Password-99").status_code == 401
    locked = login(client)  # even the right password is refused while locked
    assert locked.status_code == 423
    assert "one-time code" in locked.json()["detail"]


def test_forgot_and_reset_password_revokes_sessions(client, outbox):
    set_first_password(client, outbox)
    assert login(client).status_code == 200
    old_session = dict(client.cookies)

    # Unknown emails get an identical-looking reply.
    unknown = client.post("/auth/password/forgot", json={"email": "nobody@example.com"})
    assert unknown.status_code == 200 and "challenge_id" in unknown.json()

    forgot = client.post("/auth/password/forgot", json={"email": OWNER})
    assert forgot.status_code == 200
    challenge = forgot.json()["challenge_id"]
    channel, to, code = outbox[-1]
    assert (channel, to) == ("email", OWNER)

    wrong = "000000" if code != "000000" else "111111"
    assert client.post("/auth/password/reset", json={"challenge_id": challenge, "code": wrong, "new_password": "Brand-New-Pass-42"}).status_code == 400
    assert client.post("/auth/password/reset", json={"challenge_id": challenge, "code": code, "new_password": "weak"}).status_code == 422
    reset = client.post("/auth/password/reset", json={"challenge_id": challenge, "code": code, "new_password": "Brand-New-Pass-42"})
    assert reset.status_code == 200, reset.text

    # The old session no longer works, and the code can't be reused.
    client.cookies.clear()
    client.cookies.update(old_session)
    assert client.get("/auth/me").status_code == 401
    assert client.post("/auth/refresh").status_code == 401
    assert client.post("/auth/password/reset", json={"challenge_id": challenge, "code": code, "new_password": "Brand-New-Pass-43"}).status_code == 400

    client.cookies.clear()
    assert login(client, STRONG).status_code == 401
    assert login(client, "Brand-New-Pass-42").status_code == 200


def test_logout_everywhere(client, outbox):
    set_first_password(client, outbox)
    assert login(client).status_code == 200
    stolen = dict(client.cookies)
    assert client.post("/auth/logout-all").status_code == 200
    client.cookies.update(stolen)
    assert client.get("/auth/me").status_code == 401


def test_remember_me_controls_cookie_lifetime(client, outbox):
    set_first_password(client, outbox)
    remembered = login(client, remember=True)
    assert any("refresh_token" in c and "Max-Age" in c for c in remembered.headers.get_list("set-cookie"))
    client.cookies.clear()
    session_only = login(client, remember=False)
    refresh_cookie = [c for c in session_only.headers.get_list("set-cookie") if c.startswith("refresh_token")][0]
    assert "Max-Age" not in refresh_cookie
    # Refresh keeps the "not remembered" choice.
    refreshed = client.post("/auth/refresh")
    assert refreshed.status_code == 200
    assert "Max-Age" not in [c for c in refreshed.headers.get_list("set-cookie") if c.startswith("refresh_token")][0]
