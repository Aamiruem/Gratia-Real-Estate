"""Retell call creation and public-property context shared by CRM and scheduler."""

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request as HttpRequest, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .models import Lead, Property

logger = logging.getLogger("gratia.retell")
RETELL_CALL_URL = "https://api.retellai.com/v2/create-phone-call"


class RetellCallError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, retryable: bool = True):
        super().__init__(message)
        self.status_code = status_code
        self.retryable = retryable


def retell_configured() -> bool:
    return all(config.env(name) for name in ("RETELL_API_KEY", "RETELL_AGENT_ID", "RETELL_PHONE_NUMBER"))


def published_property_context(db: Session) -> str:
    properties = db.scalars(
        select(Property)
        .where(Property.published.is_(True))
        .order_by(Property.sort_order, Property.id)
        .limit(30)
    ).all()
    lines = []
    for property_ in properties:
        parts = [
            property_.name,
            property_.developer,
            property_.location,
            property_.category,
            property_.type,
            property_.status,
            property_.price,
            property_.configuration,
        ]
        if property_.availability != "available":
            parts.append(property_.availability.replace("_", " "))
        lines.append(" | ".join(str(part).strip() for part in parts if part)[:300])
    return "\n".join(lines)[:8000] or "(There are no published properties right now.)"


def build_call_payload(
    db: Session,
    lead: Lead,
    *,
    idempotency_key: str,
    automated: bool,
) -> dict:
    start = config.env("RETELL_CALL_START_HOUR", "10")
    end = config.env("RETELL_CALL_END_HOUR", "19")
    return {
        "from_number": config.env("RETELL_PHONE_NUMBER"),
        "to_number": lead.phone,
        "override_agent_id": config.env("RETELL_AGENT_ID"),
        "idempotency_key": idempotency_key,
        "honor_internal_dnc": True,
        "metadata": {
            "lead_reference": lead.reference,
            "automated_follow_up": automated,
        },
        "retell_llm_dynamic_variables": {
            "customer_name": lead.name,
            "property_name": lead.property_name or "not specified",
            "lead_reference": lead.reference,
            "published_properties": published_property_context(db),
            "business_hours": f"Monday-Saturday, {start}:00-{end}:00 Asia/Kolkata",
            "human_handoff_number": config.env("OWNER_PHONE_NUMBER"),
            "ai_disclosure": "You are an AI assistant. Clearly identify yourself as AI.",
        },
    }


def create_retell_phone_call(db: Session, lead: Lead, *, idempotency_key: str, automated: bool) -> dict:
    if not retell_configured():
        raise RetellCallError("Retell phone calling is not configured.", retryable=False)

    payload = build_call_payload(db, lead, idempotency_key=idempotency_key, automated=automated)
    outbound = HttpRequest(
        RETELL_CALL_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config.env('RETELL_API_KEY')}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(outbound, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        logger.error("Retell call creation returned HTTP %s", error.code)
        raise RetellCallError(
            f"Retell returned HTTP {error.code}.",
            status_code=error.code,
            retryable=error.code == 429 or error.code >= 500,
        ) from error
    except (URLError, TimeoutError, UnicodeDecodeError, ValueError) as error:
        logger.exception("Retell call creation failed")
        raise RetellCallError("Could not confirm the call with Retell.") from error

    if not isinstance(result, dict):
        raise RetellCallError("Retell returned an invalid call response.")
    call_id = result.get("call_id")
    if not isinstance(call_id, str) or not call_id:
        raise RetellCallError("Retell did not return a call ID; the call status is unknown.")
    return {
        "call_id": call_id,
        "call_status": str(result.get("call_status") or "registered")[:40],
        "from_number": payload["from_number"],
        "to_number": payload["to_number"],
    }
