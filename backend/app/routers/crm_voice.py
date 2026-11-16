"""Staff CRM assistant and Retell phone-call integration."""

import hashlib
import hmac
import json
import logging
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request as HttpRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit, config, ratelimit
from ..database import get_db
from ..models import FollowUp, Lead, Property, User, VoiceCall
from ..permissions import require_any_staff, staff_role

router = APIRouter(prefix="/admin/crm/voice", tags=["CRM voice"])
webhook_router = APIRouter(prefix="/webhooks/retell", tags=["Retell webhooks"])
logger = logging.getLogger("gratia.crm_voice")

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
RETELL_CALL_URL = "https://api.retellai.com/v2/create-phone-call"
ACTIVE_CALL_STATUSES = ("registered", "ongoing", "in_progress")


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1000)


class AssistantRequest(BaseModel):
    messages: list[AssistantMessage] = Field(min_length=1, max_length=10)


class FollowUpProposal(BaseModel):
    lead_reference: str = Field(min_length=5, max_length=20)
    note: str = Field(min_length=2, max_length=3000)
    next_action_at: datetime


class FollowUpConfirmation(FollowUpProposal):
    confirmed: bool


class VoiceCallRequest(BaseModel):
    lead_reference: str = Field(min_length=5, max_length=20)
    confirmed: bool


def _retell_configured() -> bool:
    return all(
        config.env(name)
        for name in ("RETELL_API_KEY", "RETELL_AGENT_ID", "RETELL_PHONE_NUMBER")
    )


def _assistant_enabled(db: Session) -> bool:
    from .admin import load_settings

    return bool(config.env("OPENAI_API_KEY")) and load_settings(db).get("ai_assistant_enabled", True)


@router.get("/status")
def voice_status(
    db: Session = Depends(get_db),
    _staff: User = Depends(require_any_staff),
):
    return {
        "assistant_enabled": _assistant_enabled(db),
        "phone_enabled": _retell_configured(),
    }


def _crm_context(db: Session) -> str:
    now = datetime.now(timezone.utc)
    total = db.scalar(select(func.count()).select_from(Lead)) or 0
    due = db.scalar(
        select(func.count()).select_from(Lead).where(
            Lead.follow_up_at.is_not(None),
            Lead.follow_up_at <= now,
            Lead.status.not_in(("converted", "closed", "lost", "not_interested", "cancelled")),
        )
    ) or 0
    active_leads = db.scalars(
        select(Lead)
        .where(Lead.status.not_in(("converted", "closed", "lost", "not_interested", "cancelled")))
        .order_by(Lead.created_at.desc())
        .limit(30)
    ).all()
    due_leads = db.scalars(
        select(Lead)
        .where(Lead.follow_up_at.is_not(None), Lead.follow_up_at <= now)
        .order_by(Lead.follow_up_at.asc())
        .limit(15)
    ).all()
    properties = db.scalars(
        select(Property)
        .where(Property.published.is_(True))
        .order_by(Property.sort_order)
        .limit(30)
    ).all()

    lead_lines = [
        " | ".join(
            value for value in (
                f"reference={lead.reference}",
                f"status={lead.status}",
                f"property={lead.property_name or 'unspecified'}",
                f"location={lead.location or 'unspecified'}",
                f"budget={lead.budget or 'unspecified'}",
                f"follow_up={lead.follow_up_at.isoformat() if lead.follow_up_at else 'none'}",
            )
        )
        for lead in active_leads
    ]
    due_lines = [
        f"{lead.reference} | {lead.status} | follow-up={lead.follow_up_at.isoformat()}"
        for lead in due_leads
    ]
    property_lines = [
        " | ".join(value for value in (prop.name, prop.location, prop.type, prop.price, prop.status))
        for prop in properties
    ]
    return (
        f"CRM totals: {total} leads; {due} overdue follow-ups.\n"
        "Active leads (PII intentionally omitted):\n"
        + ("\n".join(lead_lines) or "- none")
        + "\nOverdue follow-ups:\n"
        + ("\n".join(due_lines) or "- none")
        + "\nPublished properties:\n"
        + ("\n".join(property_lines) or "- none")
    )


@router.post("/assistant")
def crm_assistant(
    payload: AssistantRequest,
    request: Request,
    db: Session = Depends(get_db),
    staff: User = Depends(require_any_staff),
):
    if not _assistant_enabled(db):
        raise HTTPException(status_code=503, detail="The CRM voice assistant is not configured.")
    ratelimit.hit(f"crm-voice:{staff.id}", limit=30, window_seconds=600)

    system = (
        "You are the Gratia Estates staff-only CRM assistant. Use only the CRM context below; "
        "do not invent customer, property, revenue, or deal information. The context intentionally "
        "contains no customer names, phone numbers, emails, private notes, or transcripts. "
        "Answer concisely in the user's language. You may help staff schedule a follow-up by proposing "
        "the propose_follow_up tool when they explicitly request it and give a lead reference, a short note, "
        "and a future date/time. The tool only creates a proposal; never claim it was saved. The staff member "
        "must review and confirm the proposal before it is written to the CRM.\n\n"
        f"{_crm_context(db)}"
    )
    body = {
        "model": config.env("OPENAI_MODEL", "gpt-4.1-mini"),
        "messages": [{"role": "system", "content": system}]
        + [message.model_dump() for message in payload.messages[-10:]],
        "tools": [{
            "type": "function",
            "function": {
                "name": "propose_follow_up",
                "description": "Propose a follow-up for a CRM lead. The staff member must confirm it before saving.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "lead_reference": {"type": "string"},
                        "note": {"type": "string"},
                        "next_action_at": {"type": "string", "description": "ISO 8601 date/time with timezone"},
                    },
                    "required": ["lead_reference", "note", "next_action_at"],
                    "additionalProperties": False,
                },
            },
        }],
        "tool_choice": "auto",
        "max_tokens": 500,
        "temperature": 0.2,
    }
    outbound = HttpRequest(
        config.env("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config.env('OPENAI_API_KEY')}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(outbound, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
        message = result["choices"][0]["message"]
        calls = message.get("tool_calls") or []
        if calls:
            tool = calls[0].get("function", {})
            if tool.get("name") != "propose_follow_up":
                raise ValueError("Unexpected assistant action.")
            proposal = FollowUpProposal.model_validate_json(tool.get("arguments", "{}"))
            lead = db.scalar(select(Lead).where(Lead.reference == proposal.lead_reference.upper()))
            if lead is None:
                raise HTTPException(status_code=404, detail="The assistant proposed a lead that does not exist.")
            next_action_at = proposal.next_action_at
            if next_action_at.tzinfo is None:
                next_action_at = next_action_at.replace(tzinfo=timezone.utc)
            if next_action_at <= datetime.now(timezone.utc):
                raise HTTPException(status_code=422, detail="Follow-up time must be in the future.")
            return {
                "reply": "Please review this follow-up and confirm before I save it.",
                "proposal": {
                    "lead_reference": lead.reference,
                    "lead_name": lead.name,
                    "note": proposal.note,
                    "next_action_at": next_action_at.isoformat(),
                },
            }
        reply = (message.get("content") or "").strip()
        if not reply:
            raise ValueError("Assistant response was empty.")
        return {"reply": reply[:2000], "proposal": None}
    except HTTPException:
        raise
    except HTTPError as error:
        logger.error("CRM assistant provider returned HTTP %s", error.code)
        raise HTTPException(status_code=502, detail="The CRM assistant could not answer right now.") from error
    except (URLError, KeyError, IndexError, TypeError, ValueError, TimeoutError):
        logger.exception("CRM assistant request failed")
        raise HTTPException(status_code=502, detail="The CRM assistant could not answer right now.")


@router.post("/assistant/follow-up")
def confirm_follow_up(
    payload: FollowUpConfirmation,
    db: Session = Depends(get_db),
    staff: User = Depends(require_any_staff),
):
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Explicit confirmation is required to save this follow-up.")
    lead = db.scalar(select(Lead).where(Lead.reference == payload.lead_reference.upper()))
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found.")
    next_action_at = payload.next_action_at
    if next_action_at.tzinfo is None:
        next_action_at = next_action_at.replace(tzinfo=timezone.utc)
    if next_action_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Follow-up time must be in the future.")

    entry = FollowUp(
        lead_id=lead.id,
        author_id=staff.id,
        author_name=staff.name,
        note=payload.note.strip(),
        next_action_at=next_action_at,
    )
    lead.follow_up_at = next_action_at
    db.add(entry)
    audit.record(db, staff, "follow_up", "lead", lead.reference, f"AI assistant follow-up scheduled: {payload.note[:250]}")
    db.commit()
    db.refresh(entry)
    return {
        "message": "Follow-up saved.",
        "lead_reference": lead.reference,
        "follow_up_id": entry.id,
        "next_action_at": entry.next_action_at,
    }


@router.post("/calls")
def create_outbound_call(
    payload: VoiceCallRequest,
    db: Session = Depends(get_db),
    staff: User = Depends(require_any_staff),
):
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Explicit confirmation is required before calling.")
    if not _retell_configured():
        raise HTTPException(status_code=503, detail="Retell phone calling is not configured.")
    lead = db.scalar(select(Lead).where(Lead.reference == payload.lead_reference.upper()))
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found.")
    role = staff_role(staff)
    if role == "agent" and lead.assigned_to_id != staff.id:
        raise HTTPException(status_code=403, detail="Agents can only call leads assigned to them.")
    if not lead.call_consent:
        raise HTTPException(status_code=409, detail="Record the customer's consent to AI phone contact before calling.")
    recent_call = db.scalar(
        select(VoiceCall).where(
            VoiceCall.lead_id == lead.id,
            VoiceCall.status.in_(ACTIVE_CALL_STATUSES),
            VoiceCall.created_at >= datetime.now(timezone.utc) - timedelta(minutes=30),
        ).limit(1)
    )
    if recent_call:
        raise HTTPException(status_code=409, detail="A call for this lead is already in progress.")

    idempotency_key = secrets.token_hex(24)
    call_request = {
        "from_number": config.env("RETELL_PHONE_NUMBER"),
        "to_number": lead.phone,
        "override_agent_id": config.env("RETELL_AGENT_ID"),
        "idempotency_key": idempotency_key,
        "honor_internal_dnc": True,
        "metadata": {"lead_reference": lead.reference},
        "retell_llm_dynamic_variables": {
            "customer_name": lead.name,
            "property_name": lead.property_name or "not specified",
            "lead_reference": lead.reference,
        },
    }
    outbound = HttpRequest(
        RETELL_CALL_URL,
        data=json.dumps(call_request).encode("utf-8"),
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
        raise HTTPException(status_code=502, detail=f"Retell did not accept the call (HTTP {error.code}).") from error
    except (URLError, KeyError, TypeError, ValueError, TimeoutError):
        logger.exception("Retell call creation failed")
        raise HTTPException(status_code=502, detail="Could not connect to Retell to start the call.")

    call_id = result.get("call_id")
    if not isinstance(call_id, str) or not call_id:
        raise HTTPException(status_code=502, detail="Retell did not return a call ID; the call status is unknown.")
    call = VoiceCall(
        call_id=call_id,
        lead_id=lead.id,
        initiated_by_id=staff.id,
        direction="outbound",
        status=str(result.get("call_status") or "registered")[:40],
        from_number=call_request["from_number"],
        to_number=call_request["to_number"],
    )
    db.add(call)
    audit.record(db, staff, "voice_call", "lead", lead.reference, f"Retell AI outbound call started ({call_id})")
    db.commit()
    return {"call_id": call_id, "status": call.status, "lead_reference": lead.reference}


@router.get("/calls")
def list_voice_calls(
    lead_reference: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
    staff: User = Depends(require_any_staff),
):
    query = select(VoiceCall, Lead.reference).outerjoin(Lead, VoiceCall.lead_id == Lead.id)
    if lead_reference:
        lead = db.scalar(select(Lead).where(Lead.reference == lead_reference.upper()))
        if lead is None:
            raise HTTPException(status_code=404, detail="Lead not found.")
        query = query.where(VoiceCall.lead_id == lead.id)
    if staff_role(staff) == "agent":
        query = query.where(
            VoiceCall.lead_id.in_(select(Lead.id).where(Lead.assigned_to_id == staff.id))
        )
    rows = db.execute(query.order_by(VoiceCall.created_at.desc()).limit(max(1, min(limit, 100)))).all()
    return {
        "items": [
            {
                "call_id": call.call_id,
                "lead_reference": reference,
                "direction": call.direction,
                "status": call.status,
                "summary": call.summary,
                "started_at": call.started_at,
                "ended_at": call.ended_at,
                "created_at": call.created_at,
            }
            for call, reference in rows
        ]
    }


def _verify_retell_signature(raw_body: bytes, signature: str, api_key: str, now_ms: int | None = None) -> bool:
    parts = dict(re.findall(r"([a-z])=([^,]+)", signature))
    timestamp = parts.get("v", "")
    digest = parts.get("d", "")
    if not timestamp.isdigit() or not re.fullmatch(r"[a-fA-F0-9]{64}", digest):
        return False
    current = now_ms if now_ms is not None else int(time.time() * 1000)
    if abs(current - int(timestamp)) > 5 * 60 * 1000:
        return False
    expected = hmac.new(api_key.encode(), raw_body + timestamp.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, digest.lower())


def _timestamp(value) -> datetime | None:
    if not isinstance(value, (int, float)):
        return None
    try:
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def _lead_for_webhook(db: Session, call: dict) -> Lead | None:
    metadata = call.get("metadata") or {}
    reference = metadata.get("lead_reference")
    if isinstance(reference, str) and reference:
        lead = db.scalar(select(Lead).where(Lead.reference == reference.upper()))
        if lead:
            return lead
    if call.get("direction") != "inbound":
        return None
    phone = call.get("from_number", "")
    digits = "".join(character for character in phone if character.isdigit())
    if len(digits) < 10:
        return None
    matches = db.scalars(select(Lead).where(Lead.phone.endswith(digits[-10:])).limit(2)).all()
    return matches[0] if len(matches) == 1 else None


@webhook_router.post("")
async def retell_webhook(request: Request, db: Session = Depends(get_db)):
    api_key = config.env("RETELL_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Retell webhook verification is not configured.")
    raw_body = await request.body()
    if len(raw_body) > 1_000_000:
        raise HTTPException(status_code=413, detail="Webhook payload is too large.")
    if not _verify_retell_signature(raw_body, request.headers.get("x-retell-signature", ""), api_key):
        raise HTTPException(status_code=401, detail="Invalid Retell webhook signature.")
    try:
        payload = json.loads(raw_body)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=400, detail="Invalid webhook JSON.") from error

    event = payload.get("event")
    call_data = payload.get("call")
    if event not in {"call_started", "call_ended", "call_analyzed"} or not isinstance(call_data, dict):
        return {"received": True}
    call_id = call_data.get("call_id")
    if not isinstance(call_id, str) or not call_id:
        raise HTTPException(status_code=400, detail="Webhook call ID is missing.")
    agent_id = config.env("RETELL_AGENT_ID")
    if agent_id and call_data.get("agent_id") != agent_id:
        raise HTTPException(status_code=403, detail="Webhook agent does not match the configured CRM agent.")

    call = db.get(VoiceCall, call_id)
    lead = _lead_for_webhook(db, call_data)
    if call is None:
        direction = call_data.get("direction") if call_data.get("direction") in ("inbound", "outbound") else "inbound"
        call = VoiceCall(
            call_id=call_id,
            lead_id=lead.id if lead else None,
            direction=direction,
            status="registered",
            from_number=str(call_data.get("from_number") or "")[:30],
            to_number=str(call_data.get("to_number") or "")[:30],
        )
        db.add(call)
    elif lead and call.lead_id is None:
        call.lead_id = lead.id

    if event == "call_started":
        call.status = str(call_data.get("call_status") or "ongoing")[:40]
        call.started_at = _timestamp(call_data.get("start_timestamp")) or call.started_at
    elif event == "call_ended":
        call.status = str(call_data.get("call_status") or "ended")[:40]
        call.started_at = _timestamp(call_data.get("start_timestamp")) or call.started_at
        call.ended_at = _timestamp(call_data.get("end_timestamp")) or call.ended_at
    elif event == "call_analyzed":
        call.status = str(call_data.get("call_status") or "ended")[:40]
        call.started_at = _timestamp(call_data.get("start_timestamp")) or call.started_at
        call.ended_at = _timestamp(call_data.get("end_timestamp")) or call.ended_at
        analysis = call_data.get("call_analysis") or {}
        summary = analysis.get("call_summary")
        if isinstance(summary, str):
            call.summary = summary[:4000]

    db.commit()
    return {"received": True}
