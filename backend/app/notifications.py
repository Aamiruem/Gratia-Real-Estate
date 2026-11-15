"""Creates website notifications and tells live listeners about them.

Every notification comes from a real event (a saved enquiry, a new video, an
owner announcement); nothing here invents activity.
"""

import json
import logging
import threading
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from . import config
from .models import Notification

logger = logging.getLogger("gratia.notifications")

# Bumped whenever a notification changes in this process, so the SSE stream
# can react immediately instead of waiting for its periodic database check.
_version_lock = threading.Lock()
_version = 0


def version() -> int:
    return _version


def bump() -> None:
    global _version
    with _version_lock:
        _version += 1


def create(
    db: Session,
    *,
    audience: str,
    kind: str,
    title: str,
    body: str = "",
    link: str | None = None,
    lead_reference: str | None = None,
    recipient: str | None = None,
) -> Notification:
    """Adds a notification to the session; the caller commits, then calls dispatch()."""
    item = Notification(
        audience=audience,
        kind=kind,
        title=title[:150],
        body=body[:500],
        link=link,
        lead_reference=lead_reference,
        recipient=recipient,
    )
    db.add(item)
    return item


def dispatch(background, items: list[Notification]) -> None:
    """Call after commit: wakes live listeners and queues Web Push for each item."""
    from . import push

    bump()
    if background is None or not push.configured():
        return
    for item in items:
        if item.audience == "visitor":
            continue  # shown in that visitor's bell; no broadcast push
        audience = "public" if item.audience == "public" else "staff"
        background.add_task(push.send, audience, item.title, item.body, item.link, f"gratia-{item.id}")


def device_hash(token: str | None) -> str | None:
    """Device keys are random 32+ character secrets created in the browser."""
    import hashlib
    import re

    if not token or not re.fullmatch(r"[A-Za-z0-9_-]{32,80}", token):
        return None
    return hashlib.sha256(token.encode()).hexdigest()


def push_to_owner_phone(title: str, body: str, link: str | None = None) -> None:
    """Optional phone alert through ntfy (the same NTFY_TOPIC used for sign-in
    codes). Runs as a background task; failures are only logged."""
    topic = config.env("NTFY_TOPIC")
    if not topic:
        return
    server = config.env("NTFY_SERVER", "https://ntfy.sh").rstrip("/")
    # JSON publishing keeps names with non-ASCII characters intact.
    payload = {"topic": topic, "title": title, "message": body or title, "tags": ["house"], "priority": 4}
    site = config.env("PUBLIC_SITE_URL").rstrip("/")
    if site and link:
        payload["click"] = f"{site}{link}"
    request = Request(
        server,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "GratiaEstates/1.0"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10):
            pass
    except (HTTPError, URLError, ValueError):
        logger.exception("Could not send the owner lead alert")
