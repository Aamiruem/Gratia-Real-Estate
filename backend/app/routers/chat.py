"""AI property assistant for the website chat (OpenAI / ChatGPT API).

Enabled when OPENAI_API_KEY is set and the assistant is switched on in
Admin → Settings. Answers only from the website's published listings and
contact details; the chat widget falls back to its built-in answers otherwise.
"""

import json
import logging
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request as HttpRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config, ratelimit
from ..database import get_db
from ..models import Property
from .admin import load_settings

router = APIRouter(prefix="/chat", tags=["AI assistant"])
logger = logging.getLogger("gratia.chat")

CONTACT = (
    "Phone/WhatsApp: +91 91097 76155. Email: purwarmanish@gmail.com. "
    "Office: Iworkk Coworking Office Space, 90 IDC, Gurgaon. "
    "Pages: /projects (all listings), /book-visit (book a site visit), /contact (enquiry form), "
    "/residential, /commercial, /services."
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=12)


def _listing_lines(db: Session) -> str:
    rows = db.scalars(select(Property).where(Property.published.is_(True)).order_by(Property.sort_order)).all()
    lines = []
    for p in rows:
        parts = [p.name, p.developer, p.location, p.category, p.type, p.status, p.price]
        if p.configuration:
            parts.append(p.configuration)
        if p.offer:
            parts.append(f"Offer: {p.offer}")
        if p.availability != "available":
            parts.append(p.availability.replace("_", " "))
        lines.append(f"- {' | '.join(x for x in parts if x)} | page: /projects/{p.slug}")
    return "\n".join(lines) or "- (no published listings right now)"


def _system_prompt(db: Session) -> str:
    return (
        "You are the AI website assistant for Gratia Estates (Gratia Real Estates Advisory Pvt. Ltd.). "
        "a Gurgaon (Gurugram) real estate advisory founded in 2013 that helps people buy, sell, rent and invest "
        "in residential and commercial property.\n"
        "Rules:\n"
        "- Be transparent that you are an AI assistant; never imply that you are a human advisor.\n"
        "- Answer briefly (under 120 words), warmly and in the visitor's language.\n"
        "- Only state facts about properties from the listing data below. Never invent prices, sizes, "
        "availability, approvals or offers; if something isn't listed, say an advisor will confirm it.\n"
        "- Do not give legal, tax or guaranteed-return advice; suggest speaking to an advisor.\n"
        "- When useful, point to a page path (e.g. /projects/slug) or suggest booking a visit or a callback.\n"
        "- Never ask for or repeat sensitive data (ID numbers, bank details). For contact, suggest the "
        "enquiry form, phone or WhatsApp.\n\n"
        f"Contact: {CONTACT}\n\nPublished listings:\n{_listing_lines(db)}"
    )


@router.get("/status")
def chat_status(db: Session = Depends(get_db)):
    enabled = bool(config.env("OPENAI_API_KEY")) and load_settings(db).get("ai_assistant_enabled", True)
    return {"enabled": enabled}


@router.post("")
def chat(payload: ChatIn, request: Request, db: Session = Depends(get_db)):
    api_key = config.env("OPENAI_API_KEY")
    if not api_key or not load_settings(db).get("ai_assistant_enabled", True):
        raise HTTPException(status_code=503, detail="The AI assistant is not available right now.")
    ip = ratelimit.client_ip(request)
    ratelimit.hit(f"chat-10m:{ip}", limit=20, window_seconds=600)
    ratelimit.hit(f"chat-day:{ip}", limit=100, window_seconds=86_400)

    body = {
        "model": config.env("OPENAI_MODEL", "gpt-4.1-mini"),
        "messages": [{"role": "system", "content": _system_prompt(db)}]
        + [m.model_dump() for m in payload.messages[-10:]],
        "max_tokens": 400,
        "temperature": 0.3,
    }
    request_out = HttpRequest(
        config.env("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request_out, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
        reply = data["choices"][0]["message"]["content"].strip()
    except HTTPError as error:
        logger.error("AI provider error %s: %s", error.code, error.read()[:300])
        raise HTTPException(status_code=502, detail="The assistant couldn't answer just now. Please try again.")
    except (URLError, KeyError, IndexError, ValueError, TimeoutError):
        logger.exception("AI assistant request failed")
        raise HTTPException(status_code=502, detail="The assistant couldn't answer just now. Please try again.")
    return {"reply": reply[:2000]}
