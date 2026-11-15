"""Website notifications.

Public (every visitor):  GET /notifications/public
Owner only:              GET /notifications, PATCH /notifications/{id},
                         POST /notifications/read-all, DELETE /notifications/{id},
                         POST /notifications/announce  (e.g. "New property added")
Live updates:            GET /notifications/stream  (Server-Sent Events; clients
                         fall back to polling when a proxy buffers the stream)
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from jose import JWTError
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from .. import notifications
from ..database import SessionLocal, get_db
from ..dependencies import ACCESS_COOKIE
from ..models import Notification, User
from ..security import decode_claims, token_is_current
from ..permissions import require_any_staff, require_manager, staff_role

router = APIRouter(prefix="/notifications", tags=["Notifications"])

PUBLIC_MAX_AGE = timedelta(days=60)


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    audience: str
    kind: str
    title: str
    body: str
    link: Optional[str]
    lead_reference: Optional[str]
    is_read: bool
    created_at: datetime


class NotificationList(BaseModel):
    items: list[NotificationResponse]
    unread: int
    latest_id: int


class ReadChange(BaseModel):
    is_read: bool = True


class Announcement(BaseModel):
    kind: str = Field(
        default="announcement",
        pattern=r"^(property\.added|property\.price|property\.availability|property\.offer|announcement)$",
    )
    title: str = Field(min_length=3, max_length=150)
    body: str = Field(default="", max_length=500)
    link: Optional[str] = Field(default=None, max_length=300)

    @field_validator("link")
    @classmethod
    def site_path(cls, value: Optional[str]) -> Optional[str]:
        if value and not (value.startswith("/") and not value.startswith("//")):
            raise ValueError("Link must be a path on this website, e.g. /projects/my-project")
        return value or None


def _latest_id(db: Session, audiences: tuple[str, ...]) -> int:
    return db.scalar(select(func.max(Notification.id)).where(Notification.audience.in_(audiences))) or 0


@router.get("/public", response_model=NotificationList)
def public_notifications(response: Response, db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - PUBLIC_MAX_AGE
    items = db.scalars(
        select(Notification)
        .where(Notification.audience == "public", Notification.created_at >= since)
        .order_by(Notification.id.desc())
        .limit(30)
    ).all()
    response.headers["Cache-Control"] = "no-store"
    # Public read state is kept in each visitor's browser.
    return NotificationList(items=items, unread=0, latest_id=items[0].id if items else 0)


# ---------- a visitor's own notifications (saved in the database per device) ----------


def _recipient(request: Request) -> str:
    recipient = notifications.device_hash(request.headers.get("x-device-token"))
    if recipient is None:
        raise HTTPException(status_code=400, detail="Missing device key")
    return recipient


@router.get("/mine", response_model=NotificationList)
def my_notifications(request: Request, response: Response, db: Session = Depends(get_db)):
    recipient = _recipient(request)
    items = db.scalars(
        select(Notification)
        .where(Notification.audience == "visitor", Notification.recipient == recipient)
        .order_by(Notification.id.desc())
        .limit(50)
    ).all()
    response.headers["Cache-Control"] = "no-store"
    unread = sum(1 for item in items if not item.is_read)
    return NotificationList(items=items, unread=unread, latest_id=items[0].id if items else 0)


def _mine(notification_id: int, request: Request, db: Session) -> Notification:
    item = db.get(Notification, notification_id)
    if item is None or item.audience != "visitor" or item.recipient != _recipient(request):
        raise HTTPException(status_code=404, detail="Notification not found")
    return item


@router.post("/mine/read-all", status_code=status.HTTP_204_NO_CONTENT)
def my_read_all(request: Request, db: Session = Depends(get_db)):
    db.execute(
        update(Notification)
        .where(Notification.audience == "visitor", Notification.recipient == _recipient(request))
        .values(is_read=True)
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/mine/{notification_id}", response_model=NotificationResponse)
def my_set_read(notification_id: int, change: ReadChange, request: Request, db: Session = Depends(get_db)):
    item = _mine(notification_id, request, db)
    item.is_read = change.is_read
    db.commit()
    db.refresh(item)
    return item


@router.delete("/mine/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def my_delete(notification_id: int, request: Request, db: Session = Depends(get_db)):
    db.delete(_mine(notification_id, request, db))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("", response_model=NotificationList)
def owner_notifications(
    background: BackgroundTasks,
    limit: int = 50,
    db: Session = Depends(get_db),
    _owner: User = Depends(require_any_staff),
):
    from .leads import create_due_follow_up_notifications

    due = create_due_follow_up_notifications(db)
    if due:
        notifications.dispatch(background, due)
    limit = max(1, min(limit, 200))
    items = db.scalars(
        select(Notification)
        .where(Notification.audience.in_(("owner", "public")))
        .order_by(Notification.id.desc())
        .limit(limit)
    ).all()
    unread = db.scalar(
        select(func.count()).where(Notification.audience == "owner", Notification.is_read.is_(False))
    ) or 0
    return NotificationList(items=items, unread=unread, latest_id=_latest_id(db, ("owner", "public")))


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(db: Session = Depends(get_db), _owner: User = Depends(require_any_staff)):
    db.execute(
        update(Notification)
        .where(Notification.audience == "owner", Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    notifications.bump()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _owned(notification_id: int, db: Session) -> Notification:
    item = db.get(Notification, notification_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return item


@router.patch("/{notification_id}", response_model=NotificationResponse)
def set_read(
    notification_id: int,
    change: ReadChange,
    db: Session = Depends(get_db),
    _owner: User = Depends(require_any_staff),
):
    item = _owned(notification_id, db)
    item.is_read = change.is_read
    db.commit()
    db.refresh(item)
    notifications.bump()
    return item


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    _owner: User = Depends(require_any_staff),
):
    db.execute(delete(Notification).where(Notification.id == _owned(notification_id, db).id))
    db.commit()
    notifications.bump()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/announce", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
def announce(
    payload: Announcement,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    _owner: User = Depends(require_manager),
):
    item = notifications.create(
        db, audience="public", kind=payload.kind, title=payload.title.strip(), body=payload.body.strip(), link=payload.link
    )
    db.commit()
    db.refresh(item)
    notifications.dispatch(background, [item])
    return item


def _owner_from_cookie(request: Request) -> bool:
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        return False
    try:
        claims = decode_claims(token, "access")
    except (JWTError, ValueError, TypeError):
        return False
    with SessionLocal() as db:
        user = db.get(User, int(claims["sub"]))
        return bool(user and user.is_active and token_is_current(claims, user) and staff_role(user))


def _latest_for(audiences: tuple[str, ...]) -> int:
    with SessionLocal() as db:
        return _latest_id(db, audiences)


@router.get("/stream")
async def stream(request: Request):
    """Sends `event: changed` whenever notifications change. The browser then
    re-fetches the list it is allowed to see. Each connection lasts up to
    ten minutes; EventSource reconnects automatically."""
    is_owner = await run_in_threadpool(_owner_from_cookie, request)
    audiences = ("owner", "public") if is_owner else ("public",)

    async def events():
        seen_version = notifications.version()
        latest = await run_in_threadpool(_latest_for, audiences)
        yield f"retry: 5000\nevent: ready\ndata: {json.dumps({'latest_id': latest, 'owner': is_owner})}\n\n"
        loop = asyncio.get_running_loop()
        started = last_db_check = last_beat = loop.time()
        while loop.time() - started < 600:
            await asyncio.sleep(1.5)
            if await request.is_disconnected():
                return
            now = loop.time()
            changed = notifications.version() != seen_version
            # Other server processes cannot bump our counter: check the DB too.
            if changed or now - last_db_check > 20:
                seen_version = notifications.version()
                last_db_check = now
                current = await run_in_threadpool(_latest_for, audiences)
                if changed or current != latest:
                    latest = current
                    last_beat = now
                    yield f"event: changed\ndata: {json.dumps({'latest_id': latest})}\n\n"
                    continue
            if now - last_beat > 25:
                last_beat = now
                yield ": keep-alive\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
