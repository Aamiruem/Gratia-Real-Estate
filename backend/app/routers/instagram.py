import json
import logging
import re
import time
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException, Query, status

from .. import config  # noqa: F401
from ..config import env

router = APIRouter(prefix="/instagram", tags=["Instagram"])
logger = logging.getLogger("gratia.instagram")

PAGE_SIZE = 50
CACHE_SECONDS = 300
_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_cache_lock = Lock()


def _configured_credentials() -> tuple[str, str, str, str] | None:
    token = env("INSTAGRAM_ACCESS_TOKEN")
    user_id = env("INSTAGRAM_USER_ID")
    if not token and not user_id:
        return None
    if not token or not re.fullmatch(r"\d+", user_id):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Instagram feed credentials are incomplete.",
        )

    host = env("INSTAGRAM_API_HOST", "graph.facebook.com").lower()
    if host not in {"graph.facebook.com", "graph.instagram.com"}:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Instagram API host configuration is invalid.",
        )

    version = env("INSTAGRAM_API_VERSION", "v27.0")
    if not re.fullmatch(r"v\d+\.\d+", version):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Instagram API version configuration is invalid.",
        )

    return token, user_id, host, version


def _fetch_page(token: str, user_id: str, host: str, version: str, after: str | None) -> dict:
    params = {
        "fields": "id,caption,media_type,permalink,thumbnail_url,timestamp,children{media_type}",
        "limit": str(PAGE_SIZE),
    }
    if after:
        params["after"] = after

    request = Request(
        f"https://{host}/{version}/{user_id}/media?{urlencode(params)}",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read())
    except HTTPError as exc:
        logger.warning("Instagram Graph API returned HTTP %s", exc.code)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Instagram videos could not be loaded right now.",
        ) from exc
    except (TimeoutError, URLError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        logger.warning("Instagram Graph API request failed (%s)", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Instagram videos could not be loaded right now.",
        ) from exc

    if not isinstance(payload, dict) or "error" in payload or not isinstance(payload.get("data"), list):
        logger.warning("Instagram Graph API returned an invalid media response")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Instagram videos could not be loaded right now.",
        )
    return payload


def _video_items(payload: dict) -> list[dict]:
    videos = []
    for item in payload["data"]:
        if not isinstance(item, dict):
            continue
        is_video = item.get("media_type") == "VIDEO"
        if item.get("media_type") == "CAROUSEL_ALBUM":
            children = item.get("children")
            child_items = children.get("data", []) if isinstance(children, dict) else []
            is_video = any(
                isinstance(child, dict) and child.get("media_type") == "VIDEO"
                for child in child_items
            )
        if not is_video:
            continue

        permalink = item.get("permalink")
        if not isinstance(permalink, str):
            continue
        parsed_url = urlparse(permalink)
        if (
            not isinstance(item.get("id"), str)
            or not item["id"]
            or parsed_url.scheme != "https"
            or parsed_url.hostname not in {"instagram.com", "www.instagram.com"}
        ):
            continue

        caption = item.get("caption")
        caption = caption if isinstance(caption, str) else ""
        title = next((line.strip() for line in caption.splitlines() if line.strip()), "Instagram video")
        if len(title) > 140:
            title = f"{title[:137].rstrip()}..."
        videos.append(
            {
                "id": f"instagram-{item['id']}",
                "title": title,
                "url": permalink,
                "description": caption,
                "source": "instagram",
                "channel": "Instagram",
                "thumbnail_url": item.get("thumbnail_url", "") if isinstance(item.get("thumbnail_url"), str) else "",
                "timestamp": item.get("timestamp", ""),
            }
        )
    return videos


@router.get("/videos")
def list_instagram_videos(after: str | None = Query(default=None, max_length=512)):
    credentials = _configured_credentials()
    if credentials is None:
        return {"configured": False, "videos": [], "next_cursor": ""}

    token, user_id, host, version = credentials
    cache_key = (user_id, after or "")
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and now - cached[0] < CACHE_SECONDS:
            return cached[1]
        expired_keys = [
            key for key, (created, _) in _cache.items()
            if now - created >= CACHE_SECONDS
        ]
        for key in expired_keys:
            _cache.pop(key, None)

    payload = _fetch_page(token, user_id, host, version, after)
    paging = payload.get("paging")
    cursors = paging.get("cursors") if isinstance(paging, dict) else None
    next_cursor = cursors.get("after", "") if isinstance(cursors, dict) else ""
    if not isinstance(next_cursor, str):
        next_cursor = ""
    if paging and paging.get("next") and not next_cursor:
        logger.warning("Instagram Graph API omitted the cursor for a paginated response")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Instagram videos could not be loaded right now.",
        )

    result = {
        "configured": True,
        "videos": _video_items(payload),
        "next_cursor": next_cursor if paging and paging.get("next") else "",
    }
    with _cache_lock:
        _cache[cache_key] = (now, result)
    return result
