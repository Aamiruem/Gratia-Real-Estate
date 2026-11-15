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
) -> Notification:
    """Adds a notification to the session; the caller commits, then calls bump()."""
    item = Notification(
        audience=audience,
        kind=kind,
        title=title[:150],
        body=body[:500],
        link=link,
        lead_reference=lead_reference,
    )
    db.add(item)
    return item


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
