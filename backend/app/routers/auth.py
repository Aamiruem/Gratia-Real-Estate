import logging
import os
import re
import secrets
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jwt import InvalidTokenError as JWTError
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import config  # noqa: F401
from .. import otp
from ..database import get_db
from ..delivery.sms import to_e164
from ..dependencies import ACCESS_COOKIE, REFRESH_COOKIE, get_current_user
from ..models import (
    CustomerOtpRateLimit,
    CustomerSignupChallenge,
    EmailChangeChallenge,
    LoginChallenge,
    User,
)
from ..permissions import staff_role
from ..schemas import AuthResponse, LoginRequest, UserResponse
from ..security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_claims,
    hash_password,
    JWT_SECRET_KEY,
    token_is_current,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger("gratia.auth")

COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")
VIDEO_ADMIN_EMAIL = os.getenv("VIDEO_ADMIN_EMAIL", "").strip().lower()
GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
# Path the browser sees in front of the API, e.g. "/api" when the frontend host
# proxies /api/* to this backend. The refresh cookie must be scoped to it.
API_PATH_PREFIX = os.getenv("API_PATH_PREFIX", "").strip().rstrip("/")


def refresh_cookie_path(request: Request | None) -> str:
    """The refresh cookie is only sent to the refresh endpoint, at the path the
    browser uses: /api/auth/refresh behind a proxy, /auth/refresh when direct."""
    prefix = getattr(request.state, "api_prefix", "") if request is not None else ""
    return f"{prefix or API_PATH_PREFIX}/auth/refresh"


def is_video_admin(user: User) -> bool:
    return user.role == "video_admin" or bool(
        VIDEO_ADMIN_EMAIL and user.email.lower() == VIDEO_ADMIN_EMAIL
    )


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    request: Request | None = None,
    remember: bool = True,
):
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=60 * ACCESS_TOKEN_EXPIRE_MINUTES,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        # Not remembered: a browser-session cookie, gone when the browser closes.
        max_age=60 * 60 * 24 * REFRESH_TOKEN_EXPIRE_DAYS if remember else None,
        path=refresh_cookie_path(request),
    )


def issue_session(user: User, response: Response, request: Request | None, remember: bool = True) -> None:
    """Sets fresh access + refresh cookies carrying the user's current token version."""
    version = user.token_version or 0
    set_auth_cookies(
        response,
        create_access_token(user.id, version),
        create_refresh_token(user.id, version, remember),
        request,
        remember,
    )


def clear_auth_cookies(response: Response):
    response.delete_cookie(key=ACCESS_COOKIE, path="/")
    for path in {"/auth/refresh", "/api/auth/refresh", f"{API_PATH_PREFIX}/auth/refresh"}:
        response.delete_cookie(key=REFRESH_COOKIE, path=path)


PHONE_PREFIX = "phone_"
WHATSAPP_PREFIX = "wa_"


def _issue_challenge(
    user: User,
    db: Session,
    channel: str = "email",
    show_code: bool = False,
) -> dict:
    """Creates a one-time code for the user, sends it and returns the challenge info."""
    db.execute(delete(LoginChallenge).where(LoginChallenge.user_id == user.id))
    prefix = {"phone": PHONE_PREFIX, "whatsapp": WHATSAPP_PREFIX}.get(channel, "")
    challenge_id = prefix + secrets.token_urlsafe(32)
    code = otp.new_code()
    db.add(
        LoginChallenge(
            id=challenge_id,
            user_id=user.id,
            code_hash=otp.hash_code(challenge_id, code),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=otp.CODE_TTL_MINUTES),
        )
    )
    db.flush()
    recipient = user.email
    delivered_via = channel
    try:
        if channel == "phone":
            phone = user.phone_number if user.role == "user" else otp.owner_phone()
            if not phone:
                raise HTTPException(status_code=400, detail="A mobile number is not registered for this account.")
            delivered_via = otp.send_sms_code(phone, code, "sign-in")
            recipient = otp.mask_phone(phone)
        elif channel == "whatsapp":
            phone = otp.owner_phone()
            delivered_via = otp.send_whatsapp_code(phone, code)
            recipient = otp.mask_phone(phone)
        else:
            delivered_via = otp.send_code(user.email, code, "sign-in")
    except Exception as error:
        logger.exception("Could not send the owner verification code")
        db.rollback()
        reason = str(error) if isinstance(error, otp.DeliveryError) else "The delivery service failed."
        raise HTTPException(
            status_code=502,
            detail=f"We couldn't send your verification code. {reason} Please try again shortly.",
        )
    db.commit()
    reply = {
        "otp_required": True,
        "challenge_id": challenge_id,
        "sent_to": otp.mask_email(recipient) if channel == "email" else recipient,
        "channel": channel,
        "delivered_via": delivered_via,
        "expires_in_minutes": otp.CODE_TTL_MINUTES,
        "resend_after_seconds": otp.RESEND_AFTER_SECONDS,
    }
    # Local test mode only: no real email/SMS was sent and the request comes from
    # this computer, so showing the code is no weaker than the local code file.
    if show_code and delivered_via == "log":
        reply["local_code"] = code
    return reply


LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}


def _is_local_request(request: Request) -> bool:
    """Dev only: the browser is on this computer (directly or via the Vite proxy)."""
    if not otp.console_fallback_enabled():
        return False
    host = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for", "")
    origin = forwarded.split(",")[0].strip() if forwarded else host
    return host in LOCAL_HOSTS and origin in LOCAL_HOSTS


def _enforce_cooldown(user: User, db: Session) -> None:
    """Stops repeated "Send OTP" clicks from spamming the owner's inbox or phone."""
    previous = db.scalar(
        select(LoginChallenge)
        .where(LoginChallenge.user_id == user.id)
        .order_by(LoginChallenge.sent_at.desc())
    )
    if previous is None:
        return
    sent_at = previous.sent_at if previous.sent_at.tzinfo else previous.sent_at.replace(tzinfo=timezone.utc)
    wait = otp.RESEND_AFTER_SECONDS - (datetime.now(timezone.utc) - sent_at).total_seconds()
    if wait > 0:
        raise HTTPException(
            status_code=429,
            detail=f"A code was just sent. Please wait {int(wait) + 1} seconds before requesting another.",
        )


def _complete_login(user: User, response: Response, request: Request) -> AuthResponse:
    issue_session(user, response, request)
    return AuthResponse(message="Login successful", user=user, is_video_admin=is_video_admin(user))


def _find_owner(db: Session) -> User | None:
    """Returns the video owner, creating it from VIDEO_ADMIN_EMAIL on first use."""
    owner = db.scalar(select(User).where(User.role == "video_admin").order_by(User.id))
    if owner is None and VIDEO_ADMIN_EMAIL:
        owner = db.scalar(select(User).where(func.lower(User.email) == VIDEO_ADMIN_EMAIL))
        if owner is None:
            # Sign-in is OTP-only, so this password is random and never used.
            owner = User(
                name="Owner",
                email=VIDEO_ADMIN_EMAIL,
                password_hash=hash_password(secrets.token_urlsafe(32)),
                role="video_admin",
            )
            db.add(owner)
            db.commit()
            db.refresh(owner)
    return owner


@router.post("/login")
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Step 1: send a one-time code to the owner's email or mobile number."""
    owner = _find_owner(db)
    if owner is None:
        raise HTTPException(status_code=503, detail="No owner account is configured. Set VIDEO_ADMIN_EMAIL in the backend settings.")
    if data.otp_channel in ("phone", "whatsapp"):
        available = otp.whatsapp_otp_available() if data.otp_channel == "whatsapp" else otp.phone_otp_available()
        if not available:
            label = "WhatsApp" if data.otp_channel == "whatsapp" else "Mobile"
            raise HTTPException(status_code=503, detail=f"{label} OTP is not configured.")
        if not otp.same_phone(data.phone, otp.owner_phone()):
            raise HTTPException(status_code=401, detail="This mobile number is not registered as the owner.")
    else:
        email = (data.email or "").lower().strip()
        if not email:
            raise HTTPException(status_code=422, detail="Enter your owner email address.")
        if not otp.email_otp_available():
            raise HTTPException(status_code=503, detail="Email OTP is not configured.")
        if owner.email.lower() != email:
            # Team members added in the admin panel (Users) sign in by email code.
            member = db.scalar(
                select(User).where(func.lower(User.email) == email, User.role.in_(("admin", "agent")))
            )
            if member is None:
                raise HTTPException(status_code=401, detail="This email is not registered for sign-in.")
            owner = member

    if not owner.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")
    _enforce_cooldown(owner, db)
    return _issue_challenge(owner, db, channel=data.otp_channel, show_code=_is_local_request(request))


class CustomerPhoneRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=24)


class CustomerPhoneSignupRequest(CustomerPhoneRequest):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr


class GoogleSignInRequest(BaseModel):
    credential: str = Field(min_length=20, max_length=8192)


def _normalized_phone(raw_phone: str) -> str:
    phone = to_e164(raw_phone)
    if not re.fullmatch(r"\+[1-9]\d{7,14}", phone):
        raise HTTPException(status_code=422, detail="Enter a valid phone number with its country code.")
    return phone


def _require_customer_sms() -> None:
    if not otp.phone_delivery_available():
        raise HTTPException(status_code=503, detail="Phone OTP sign-in is not configured.")


def _phone_digest(phone: str) -> str:
    return hmac.new(
        JWT_SECRET_KEY.encode(),
        f"customer-otp:{phone}".encode(),
        hashlib.sha256,
    ).hexdigest()


def _consume_customer_sms_budget(db: Session, phone: str) -> None:
    now = datetime.now(timezone.utc)
    hour_ago = now - timedelta(hours=1)
    db.execute(delete(CustomerOtpRateLimit).where(CustomerOtpRateLimit.requested_at < now - timedelta(days=1)))
    phone_hash = _phone_digest(phone)
    phone_count = db.scalar(
        select(func.count(CustomerOtpRateLimit.id)).where(
            CustomerOtpRateLimit.phone_hash == phone_hash,
            CustomerOtpRateLimit.requested_at >= hour_ago,
        )
    ) or 0
    global_count = db.scalar(
        select(func.count(CustomerOtpRateLimit.id)).where(CustomerOtpRateLimit.requested_at >= hour_ago)
    ) or 0
    if phone_count >= 3:
        db.rollback()
        raise HTTPException(status_code=429, detail="Too many codes requested for this number. Try again later.")
    if global_count >= 100:
        db.rollback()
        raise HTTPException(status_code=429, detail="Phone sign-in is temporarily busy. Please try again later.")
    db.add(CustomerOtpRateLimit(phone_hash=phone_hash))
    db.commit()


def _send_customer_signup_code(
    name: str,
    email: str,
    phone: str,
    request: Request,
    db: Session,
) -> dict:
    _consume_customer_sms_budget(db, phone)
    challenge_id = "signup_" + secrets.token_urlsafe(32)
    code = otp.new_code()
    now = datetime.now(timezone.utc)
    challenge = CustomerSignupChallenge(
        id=challenge_id,
        name=name,
        email=email,
        phone_number=phone,
        code_hash=otp.hash_code(challenge_id, code),
        expires_at=now + timedelta(minutes=otp.CODE_TTL_MINUTES),
        sent_at=now,
    )
    db.add(challenge)
    db.flush()
    try:
        delivered_via = otp.send_sms_code(phone, code, "sign-up")
    except Exception as error:
        logger.exception("Could not send the customer verification code")
        db.rollback()
        reason = str(error) if isinstance(error, otp.DeliveryError) else "The delivery service failed."
        raise HTTPException(
            status_code=502,
            detail=f"We couldn't send your verification code. {reason} Please try again shortly.",
        )
    db.commit()
    reply = {
        "otp_required": True,
        "challenge_id": challenge_id,
        "sent_to": otp.mask_phone(phone),
        "channel": "phone",
        "delivered_via": delivered_via,
        "expires_in_minutes": otp.CODE_TTL_MINUTES,
        "resend_after_seconds": otp.RESEND_AFTER_SECONDS,
    }
    if _is_local_request(request) and delivered_via == "log":
        reply["local_code"] = code
    return reply


@router.post("/customer/phone/login")
def customer_phone_login(
    data: CustomerPhoneRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Send an OTP to an existing customer's phone number."""
    _require_customer_sms()
    phone = _normalized_phone(data.phone)
    user = db.scalar(select(User).where(User.phone_number == phone, User.role == "user"))
    if user is None:
        raise HTTPException(status_code=404, detail="No account found for this number. Please sign up first.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive.")
    _consume_customer_sms_budget(db, phone)
    _enforce_cooldown(user, db)
    return _issue_challenge(user, db, channel="phone", show_code=_is_local_request(request))


@router.post("/customer/phone/signup")
def customer_phone_signup(
    data: CustomerPhoneSignupRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Verify signup details by SMS before creating a public customer account."""
    _require_customer_sms()
    phone = _normalized_phone(data.phone)
    email = str(data.email).strip().lower()
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Enter your name.")
    if db.scalar(select(User.id).where(User.phone_number == phone)):
        raise HTTPException(status_code=409, detail="This phone number is already registered. Please sign in.")
    if db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise HTTPException(status_code=409, detail="This email is already registered. Please sign in.")
    now = datetime.now(timezone.utc)
    db.execute(delete(CustomerSignupChallenge).where(CustomerSignupChallenge.expires_at <= now))
    pending_signup = db.scalar(
        select(CustomerSignupChallenge).where(
            or_(CustomerSignupChallenge.phone_number == phone, func.lower(CustomerSignupChallenge.email) == email)
        )
    )
    if pending_signup:
        db.rollback()
        raise HTTPException(status_code=409, detail="A sign-up verification is already pending for these details.")
    db.commit()
    return _send_customer_signup_code(name, email, phone, request, db)


class CustomerSignupVerifyRequest(BaseModel):
    challenge_id: str = Field(min_length=10, max_length=64)
    code: str = Field(pattern=r"^\d{6}$")


def _get_customer_signup_challenge(challenge_id: str, db: Session) -> CustomerSignupChallenge:
    challenge = db.get(CustomerSignupChallenge, challenge_id)
    if challenge is None:
        raise HTTPException(status_code=400, detail="This sign-up code has expired. Please start again.")
    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        db.delete(challenge)
        db.commit()
        raise HTTPException(status_code=400, detail="This sign-up code has expired. Please start again.")
    return challenge


@router.post("/customer/phone/verify", response_model=AuthResponse)
def customer_phone_signup_verify(
    data: CustomerSignupVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    challenge = _get_customer_signup_challenge(data.challenge_id, db)
    if not otp.codes_match(challenge.code_hash, challenge.id, data.code):
        challenge.attempts += 1
        if challenge.attempts >= otp.MAX_ATTEMPTS:
            db.delete(challenge)
            db.commit()
            raise HTTPException(status_code=429, detail="Too many incorrect codes. Please sign up again.")
        db.commit()
        remaining = otp.MAX_ATTEMPTS - challenge.attempts
        raise HTTPException(
            status_code=401,
            detail=f"That code isn't right. {remaining} {'try' if remaining == 1 else 'tries'} left.",
        )

    if db.scalar(select(User.id).where(or_(User.phone_number == challenge.phone_number, func.lower(User.email) == challenge.email))):
        db.delete(challenge)
        db.commit()
        raise HTTPException(status_code=409, detail="An account already exists with these details. Please sign in.")
    user = User(
        name=challenge.name,
        email=challenge.email,
        phone_number=challenge.phone_number,
        password_hash=hash_password(secrets.token_urlsafe(32)),
        role="user",
    )
    db.add(user)
    db.delete(challenge)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account already exists with these details. Please sign in.")
    db.refresh(user)
    return _complete_login(user, response, request)


@router.post("/customer/phone/resend")
def customer_phone_signup_resend(
    data: OtpResendRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    _require_customer_sms()
    challenge = _get_customer_signup_challenge(data.challenge_id, db)
    sent_at = challenge.sent_at if challenge.sent_at.tzinfo else challenge.sent_at.replace(tzinfo=timezone.utc)
    wait = otp.RESEND_AFTER_SECONDS - (datetime.now(timezone.utc) - sent_at).total_seconds()
    if wait > 0:
        raise HTTPException(status_code=429, detail=f"Please wait {int(wait) + 1} seconds before requesting a new code.")
    _consume_customer_sms_budget(db, challenge.phone_number)
    code = otp.new_code()
    challenge.code_hash = otp.hash_code(challenge.id, code)
    challenge.attempts = 0
    challenge.sent_at = datetime.now(timezone.utc)
    challenge.expires_at = challenge.sent_at + timedelta(minutes=otp.CODE_TTL_MINUTES)
    try:
        delivered_via = otp.send_sms_code(challenge.phone_number, code, "sign-up")
    except Exception as error:
        logger.exception("Could not resend the customer verification code")
        db.rollback()
        reason = str(error) if isinstance(error, otp.DeliveryError) else "The delivery service failed."
        raise HTTPException(
            status_code=502,
            detail=f"We couldn't send your verification code. {reason} Please try again shortly.",
        )
    db.commit()
    reply = {
        "otp_required": True,
        "challenge_id": challenge.id,
        "sent_to": otp.mask_phone(challenge.phone_number),
        "channel": "phone",
        "delivered_via": delivered_via,
        "expires_in_minutes": otp.CODE_TTL_MINUTES,
        "resend_after_seconds": otp.RESEND_AFTER_SECONDS,
    }
    if _is_local_request(request) and delivered_via == "log":
        reply["local_code"] = code
    return reply


def _verify_google_credential(credential: str) -> dict:
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(credential, GoogleRequest(), GOOGLE_OAUTH_CLIENT_ID)


@router.post("/customer/google", response_model=AuthResponse)
def customer_google_login(
    data: GoogleSignInRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Verify a Google ID token and sign in or create a public customer account."""
    if not GOOGLE_OAUTH_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured.")
    try:
        claims = _verify_google_credential(data.credential)
    except ValueError:
        raise HTTPException(status_code=401, detail="The Google sign-in credential is invalid or expired.")
    except Exception:
        logger.exception("Google credential verification failed")
        raise HTTPException(status_code=503, detail="Google sign-in is temporarily unavailable.")

    email = str(claims.get("email") or "").strip().lower()
    name = str(claims.get("name") or "").strip()
    if claims.get("email_verified") is not True or not email or not name:
        raise HTTPException(status_code=401, detail="Google must provide a verified email and name.")

    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is not None and user.role != "user":
        raise HTTPException(status_code=403, detail="This email is reserved for staff sign-in.")
    if user is None:
        user = User(
            name=name[:100],
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role="user",
        )
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            user = db.scalar(select(User).where(func.lower(User.email) == email))
            if user is None or user.role != "user":
                raise HTTPException(status_code=409, detail="Could not create this account. Please try again.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive.")
    return _complete_login(user, response, request)


def _owner_exists() -> bool:
    from ..database import SessionLocal

    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.role == "video_admin").limit(1)) is not None


@router.get("/otp/options")
def otp_options():
    configured_phone = otp.owner_phone()
    local_hint = "Local test mode · code shown on this computer; no external message is sent"
    return {
        "owner_configured": bool(VIDEO_ADMIN_EMAIL) or _owner_exists(),
        "email": otp.email_otp_available(),
        "email_hint": (
            None if otp.smtp_configured() else local_hint if otp.console_fallback_enabled()
            else "Email provider is not configured"
        ),
        "whatsapp": otp.whatsapp_otp_available(),
        "whatsapp_hint": None if otp.whatsapp_otp_available() else "WhatsApp delivery is not set up yet",
        "phone": otp.phone_otp_available(),
        "phone_hint": (
            None if otp.twilio_configured()
            else "Owner mobile number is not configured" if not configured_phone
            else local_hint if otp.console_fallback_enabled()
            else "SMS provider is not configured"
        ),
    }


class OtpVerifyRequest(BaseModel):
    challenge_id: str = Field(min_length=10, max_length=64)
    code: str = Field(pattern=r"^\d{6}$")


class OtpResendRequest(BaseModel):
    challenge_id: str = Field(min_length=10, max_length=64)


class EmailChangeStartRequest(BaseModel):
    email: EmailStr


class EmailChangeVerifyRequest(BaseModel):
    challenge_id: str = Field(min_length=10, max_length=64)
    code: str = Field(pattern=r"^\d{6}$")


@router.post("/email/change/start")
def start_email_change(
    data: EmailChangeStartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if staff_role(current_user) is None:
        raise HTTPException(status_code=403, detail="Only staff accounts can change their sign-in email.")

    new_email = data.email.lower().strip()
    if new_email == current_user.email.lower():
        raise HTTPException(status_code=400, detail="Enter a different email address.")
    existing = db.scalar(select(User).where(func.lower(User.email) == new_email))
    if existing and existing.id != current_user.id:
        raise HTTPException(status_code=409, detail="An account already uses that email address.")

    previous_challenge = db.scalar(
        select(EmailChangeChallenge)
        .where(EmailChangeChallenge.user_id == current_user.id)
        .order_by(EmailChangeChallenge.sent_at.desc())
    )
    if previous_challenge:
        sent_at = previous_challenge.sent_at
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
        wait = otp.RESEND_AFTER_SECONDS - (
            datetime.now(timezone.utc) - sent_at
        ).total_seconds()
        if wait > 0:
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {int(wait) + 1} seconds before requesting another code.",
            )
        db.delete(previous_challenge)

    challenge_id = secrets.token_urlsafe(32)
    code = otp.new_code()
    challenge = EmailChangeChallenge(
        id=challenge_id,
        user_id=current_user.id,
        new_email=new_email,
        code_hash=otp.hash_code(challenge_id, code),
        expires_at=datetime.now(timezone.utc)
        + timedelta(minutes=otp.CODE_TTL_MINUTES),
    )
    db.add(challenge)
    db.commit()
    try:
        otp.send_code(new_email, code, "email change")
    except Exception:
        logger.exception("Could not send the owner email-change code")
        db.delete(challenge)
        db.commit()
        raise HTTPException(
            status_code=502,
            detail="We couldn't send a verification code to that address. Please try again shortly.",
        )

    return {
        "challenge_id": challenge_id,
        "sent_to": otp.mask_email(new_email),
        "expires_in_minutes": otp.CODE_TTL_MINUTES,
        "resend_after_seconds": otp.RESEND_AFTER_SECONDS,
    }


@router.post("/email/change/verify", response_model=AuthResponse)
def verify_email_change(
    data: EmailChangeVerifyRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if staff_role(current_user) is None:
        raise HTTPException(status_code=403, detail="Only staff accounts can change their sign-in email.")

    challenge = db.get(EmailChangeChallenge, data.challenge_id)
    if challenge is None or challenge.user_id != current_user.id:
        raise HTTPException(status_code=400, detail="This verification code has expired. Start again.")

    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        db.delete(challenge)
        db.commit()
        raise HTTPException(status_code=400, detail="This verification code has expired. Start again.")

    if not otp.codes_match(challenge.code_hash, challenge.id, data.code):
        challenge.attempts += 1
        if challenge.attempts >= otp.MAX_ATTEMPTS:
            db.delete(challenge)
            db.commit()
            raise HTTPException(status_code=429, detail="Too many incorrect codes. Request a new one.")
        db.commit()
        remaining = otp.MAX_ATTEMPTS - challenge.attempts
        raise HTTPException(
            status_code=401,
            detail=f"That code isn't right. {remaining} {'try' if remaining == 1 else 'tries'} left.",
        )

    existing = db.scalar(
        select(User).where(func.lower(User.email) == challenge.new_email)
    )
    if existing and existing.id != current_user.id:
        db.delete(challenge)
        db.commit()
        raise HTTPException(status_code=409, detail="An account already uses that email address.")

    current_user.email = challenge.new_email
    current_user.token_version = (current_user.token_version or 0) + 1
    db.delete(challenge)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account already uses that email address.")
    db.refresh(current_user)
    issue_session(current_user, response, request)
    return AuthResponse(
        message="Sign-in email updated",
        user=current_user,
        is_video_admin=is_video_admin(current_user),
    )


def _get_challenge(challenge_id: str, db: Session) -> LoginChallenge:
    challenge = db.get(LoginChallenge, challenge_id)
    if challenge is None:
        raise HTTPException(status_code=400, detail="This sign-in code has expired. Please sign in again.")
    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        db.delete(challenge)
        db.commit()
        raise HTTPException(status_code=400, detail="This sign-in code has expired. Please sign in again.")
    return challenge


@router.post("/login/verify", response_model=AuthResponse)
def verify_login_code(data: OtpVerifyRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Step 2: check the one-time code and start the session."""
    challenge = _get_challenge(data.challenge_id, db)

    if not otp.codes_match(challenge.code_hash, challenge.id, data.code):
        challenge.attempts += 1
        if challenge.attempts >= otp.MAX_ATTEMPTS:
            db.delete(challenge)
            db.commit()
            raise HTTPException(status_code=429, detail="Too many incorrect codes. Please sign in again.")
        db.commit()
        left = otp.MAX_ATTEMPTS - challenge.attempts
        raise HTTPException(
            status_code=401,
            detail=f"That code isn't right. {left} {'try' if left == 1 else 'tries'} left.",
        )

    user = db.get(User, challenge.user_id)
    db.delete(challenge)
    db.commit()
    if not user or not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")
    return _complete_login(user, response, request)


@router.post("/login/resend")
def resend_login_code(data: OtpResendRequest, request: Request, db: Session = Depends(get_db)):
    challenge = _get_challenge(data.challenge_id, db)
    sent_at = challenge.sent_at if challenge.sent_at.tzinfo else challenge.sent_at.replace(tzinfo=timezone.utc)
    wait = otp.RESEND_AFTER_SECONDS - (datetime.now(timezone.utc) - sent_at).total_seconds()
    if wait > 0:
        raise HTTPException(status_code=429, detail=f"Please wait {int(wait) + 1} seconds before requesting a new code.")
    user = db.get(User, challenge.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Please sign in again.")
    channel = (
        "phone" if challenge.id.startswith(PHONE_PREFIX)
        else "whatsapp" if challenge.id.startswith(WHATSAPP_PREFIX)
        else "email"
    )
    if channel == "phone" and not otp.phone_delivery_available():
        raise HTTPException(status_code=503, detail="Phone verification is not configured.")
    if channel == "whatsapp" and not otp.whatsapp_otp_available():
        raise HTTPException(status_code=503, detail="WhatsApp verification is not configured.")
    return _issue_challenge(user, db, channel, show_code=_is_local_request(request))


@router.post("/refresh", response_model=AuthResponse)
def refresh(response: Response, request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Refresh session not found")

    try:
        claims = decode_claims(token, "refresh")
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh session")

    user = db.get(User, int(claims["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User account is not active")
    if not token_is_current(claims, user):
        clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="This session was signed out. Please sign in again.")

    # Rotate: every refresh issues a new refresh token, keeping "remember me".
    issue_session(user, response, request, remember=bool(claims.get("rem", True)))

    return AuthResponse(
        message="Session refreshed",
        user=user,
        is_video_admin=is_video_admin(user),
    )


@router.post("/logout")
def logout(response: Response):
    clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=AuthResponse)
def me(current_user: User = Depends(get_current_user)):
    return AuthResponse(
        message="Authenticated",
        user=current_user,
        is_video_admin=is_video_admin(current_user),
    )
