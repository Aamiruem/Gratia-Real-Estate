import os
import sys
import tempfile
from pathlib import Path

import pytest

# Settings must be in place before the app is imported.
_db = Path(tempfile.mkdtemp()) / "test.db"
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{_db.as_posix()}",
        "JWT_SECRET_KEY": "test-access-secret",
        "JWT_REFRESH_SECRET_KEY": "test-refresh-secret",
        "VIDEO_ADMIN_EMAIL": "owner@example.com",
        "OWNER_PHONE_NUMBER": "+91 98765 43210",
        "COOKIE_SECURE": "false",
        "LOCALAPPDATA": str(_db.parent),
    }
)
for name in ("SMTP_HOST", "RESEND_API_KEY", "TWILIO_ACCOUNT_SID", "MSG91_AUTH_KEY", "FAST2SMS_API_KEY", "NTFY_TOPIC"):
    os.environ.pop(name, None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import LoginChallenge  # noqa: E402


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client
    with SessionLocal() as db:
        db.query(LoginChallenge).delete()
        db.commit()


@pytest.fixture()
def outbox(monkeypatch):
    """Captures codes instead of sending them, as if a real provider were set up."""
    from app.delivery import email, sms

    sent = []
    monkeypatch.setattr(email, "configured", lambda: True)
    monkeypatch.setattr(sms, "configured", lambda: True)
    monkeypatch.setattr(email, "send", lambda to, code, purpose, ttl: sent.append(("email", to, code)))
    monkeypatch.setattr(sms, "send", lambda to, code, purpose, ttl: sent.append(("sms", to, code)))
    return sent
