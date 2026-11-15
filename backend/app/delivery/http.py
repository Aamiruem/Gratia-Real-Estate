import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from . import DeliveryError

logger = logging.getLogger("gratia.delivery")


def post(url: str, *, data: bytes, headers: dict, provider: str, timeout: int = 15) -> dict:
    """POSTs to a provider API and returns the JSON reply (or {}). Raises DeliveryError."""
    request = Request(url, data=data, headers={"User-Agent": "GratiaEstates/1.0", **headers}, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", "replace")
    except HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        logger.error("%s rejected the message (HTTP %s): %s", provider, error.code, detail)
        raise DeliveryError(f"{provider} rejected the message (HTTP {error.code}).") from error
    except URLError as error:
        logger.error("Could not reach %s: %s", provider, error.reason)
        raise DeliveryError(f"Could not reach {provider}.") from error
    try:
        return json.loads(body) if body else {}
    except ValueError:
        return {}


def post_json(url: str, payload: dict, *, headers: dict, provider: str) -> dict:
    return post(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json", **headers},
        provider=provider,
    )
