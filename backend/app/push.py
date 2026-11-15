"""Web Push (browser notifications that arrive even when the site is closed).

Enabled when VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set. Generate a pair with:
    python -m app.push
Only browsers whose visitors clicked "Turn on alerts" and allowed notifications
are subscribed; expired subscriptions are removed automatically.
"""

import json
import logging

from sqlalchemy import delete, select

from . import config
from .database import SessionLocal
from .models import PushSubscription

logger = logging.getLogger("gratia.push")


def public_key() -> str:
    return config.env("VAPID_PUBLIC_KEY")


def configured() -> bool:
    return bool(config.env("VAPID_PUBLIC_KEY") and config.env("VAPID_PRIVATE_KEY"))


def send(audience: str, title: str, body: str = "", url: str | None = None, tag: str | None = None) -> int:
    """Sends to every subscription of `audience` ("public" or "staff"). Runs as a background task."""
    if not configured():
        return 0
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:  # pragma: no cover - dependency missing
        logger.warning("pywebpush is not installed; push notifications are disabled")
        return 0

    payload = json.dumps({"title": title, "body": body, "url": url or "/notifications", "tag": tag})
    private_key = config.env("VAPID_PRIVATE_KEY")
    claims = {"sub": config.env("VAPID_SUBJECT", "mailto:admin@gratiaestates.com")}
    sent, expired = 0, []
    with SessionLocal() as db:
        subscriptions = db.scalars(select(PushSubscription).where(PushSubscription.audience == audience)).all()
        for sub in subscriptions:
            try:
                webpush(
                    subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    data=payload,
                    vapid_private_key=private_key,
                    vapid_claims=dict(claims),
                    ttl=86_400,
                    timeout=10,
                )
                sent += 1
            except WebPushException as error:
                status_code = getattr(error.response, "status_code", None)
                if status_code in (404, 410):
                    expired.append(sub.id)
                else:
                    logger.warning("Push failed (%s): %s", status_code, error)
            except Exception:  # noqa: BLE001 - one bad endpoint must not stop the rest
                logger.exception("Push failed")
        if expired:
            db.execute(delete(PushSubscription).where(PushSubscription.id.in_(expired)))
            db.commit()
    return sent


if __name__ == "__main__":
    # Prints a new VAPID key pair for backend/.env.
    import base64

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    private_raw = key.private_numbers().private_value.to_bytes(32, "big")
    public_raw = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    b64 = lambda raw: base64.urlsafe_b64encode(raw).decode().rstrip("=")  # noqa: E731
    print(f"VAPID_PUBLIC_KEY={b64(public_raw)}")
    print(f"VAPID_PRIVATE_KEY={b64(private_raw)}")
    print("VAPID_SUBJECT=mailto:you@yourdomain.com")
