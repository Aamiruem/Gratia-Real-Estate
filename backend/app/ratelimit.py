"""Small in-memory rate limiter for public form endpoints.

Good enough for one backend process (the default deployment). With several
workers each keeps its own counts, so limits become per worker; the duplicate
check in the leads router still works because it reads the database.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    # Behind the Vite/Caddy/Vercel proxy the browser address is the first
    # X-Forwarded-For entry; directly, it is the socket address.
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else "unknown"


def hit(key: str, limit: int, window_seconds: int) -> None:
    """Records one request for `key`; raises 429 when `limit` is exceeded in the window."""
    now = time.monotonic()
    with _lock:
        bucket = _hits[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            retry = int(window_seconds - (now - bucket[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait a few minutes and try again, or call us directly.",
                headers={"Retry-After": str(retry)},
            )
        bucket.append(now)
        # Keep memory bounded on a long-running server.
        if len(_hits) > 50_000:
            for stale in [k for k, b in _hits.items() if not b or now - b[-1] > 86_400][:10_000]:
                _hits.pop(stale, None)


def reset() -> None:
    with _lock:
        _hits.clear()
