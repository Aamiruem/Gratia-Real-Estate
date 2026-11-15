"""Browser push subscriptions (only for visitors who clicked "Turn on alerts")."""

from typing import Literal

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import push, ratelimit
from ..database import get_db
from ..models import PushSubscription
from .notifications import _owner_from_cookie

router = APIRouter(prefix="/push", tags=["Push notifications"])


class Keys(BaseModel):
    p256dh: str = Field(min_length=20, max_length=200)
    auth: str = Field(min_length=8, max_length=100)


class SubscribeIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=1000, pattern=r"^https://")
    keys: Keys
    audience: Literal["public", "staff"] = "public"


class UnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=1000)


@router.get("/config")
def push_config():
    return {"enabled": push.configured(), "public_key": push.public_key() if push.configured() else ""}


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def subscribe(payload: SubscribeIn, request: Request, db: Session = Depends(get_db)):
    ratelimit.hit(f"push:{ratelimit.client_ip(request)}", limit=20, window_seconds=3600)
    # Staff alerts (new leads) only for signed-in team members.
    audience = "staff" if payload.audience == "staff" and _owner_from_cookie(request) else "public"
    item = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if item is None:
        item = PushSubscription(endpoint=payload.endpoint)
        db.add(item)
    item.p256dh = payload.keys.p256dh
    item.auth = payload.keys.auth
    item.audience = audience
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(payload: UnsubscribeIn, db: Session = Depends(get_db)):
    db.execute(delete(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
