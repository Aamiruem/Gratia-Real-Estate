"""Email + password sign-in for staff (owner, admin, agent), alongside the
existing one-time-code sign-in.

  POST /auth/password/login     email + password (+ remember me)
  GET  /auth/password/status    has the signed-in user set a password?
  POST /auth/password/set       set or change the password (signed in)
  POST /auth/password/forgot    email a reset code (always answers the same way)
  POST /auth/password/reset     code + new password -> signs out every session
  POST /auth/logout-all         sign out on every device

Security: Argon2 hashing (pwdlib), generic error messages, a per-account
lockout after repeated failures, per-IP rate limits, hashed single-use reset
codes that expire, and session revocation through User.token_version.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .. import notifications, otp, ratelimit
from ..database import get_db
from ..dependencies import get_current_user
from ..models import PasswordResetChallenge, User
from ..permissions import staff_role
from ..schemas import AuthResponse
from ..security import hash_password, verify_password
from .auth import clear_auth_cookies, is_video_admin, issue_session

router = APIRouter(prefix="/auth", tags=["Authentication: password"])
logger = logging.getLogger("gratia.password")

MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15
RESET_CODE_TTL_MINUTES = 15
RESET_MAX_ATTEMPTS = 5
MIN_PASSWORD_LENGTH = 10

INVALID_LOGIN = (
    "Email or password is incorrect. If you haven't set a password yet, sign in with a one-time code "
    "and set one in Admin → My account."
)
# Spend the same time hashing when the account doesn't exist, so response
# times don't reveal which emails are registered.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def check_password_strength(password: str, email: str = "") -> None:
    problems = []
    if len(password) < MIN_PASSWORD_LENGTH:
        problems.append(f"at least {MIN_PASSWORD_LENGTH} characters")
    if len(password) > 128:
        problems.append("at most 128 characters")
    if len(set(password)) < 5:
        problems.append("more variety (not the same few characters repeated)")
    kinds = sum(bool(any(test(c) for c in password)) for test in (str.islower, str.isupper, str.isdigit, lambda c: not c.isalnum()))
    if kinds < 3:
        problems.append("three of: lowercase, uppercase, numbers, symbols")
    local = email.split("@")[0].lower()
    if local and len(local) >= 4 and local in password.lower():
        problems.append("not containing your email name")
    if problems:
        raise HTTPException(status_code=422, detail="Choose a stronger password: " + "; ".join(problems) + ".")


def _staff_by_email(db: Session, email: str) -> User | None:
    user = db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
    if user is None or not user.is_active or staff_role(user) is None:
        return None
    return user


def _security_alert(db: Session, title: str, body: str) -> None:
    notifications.create(db, audience="owner", kind="security", title=title, body=body, link="/admin")


# ---------------- sign in ----------------


class PasswordLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    remember: bool = True


@router.post("/password/login", response_model=AuthResponse)
def password_login(
    payload: PasswordLogin,
    request: Request,
    response: Response,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    ip = ratelimit.client_ip(request)
    ratelimit.hit(f"pw-login-ip:{ip}", limit=20, window_seconds=900)

    user = _staff_by_email(db, str(payload.email))
    if user is None or user.password_set_at is None:
        verify_password(payload.password, _DUMMY_HASH)
        raise HTTPException(status_code=401, detail=INVALID_LOGIN)

    locked_until = _aware(user.locked_until)
    if locked_until and locked_until > _now():
        minutes = int((locked_until - _now()).total_seconds() // 60) + 1
        raise HTTPException(
            status_code=423,
            detail=f"Too many failed attempts. Password sign-in is locked for {minutes} more minute(s). "
            "You can still sign in with a one-time code, or reset your password.",
        )

    if not verify_password(payload.password, user.password_hash):
        user.failed_logins = (user.failed_logins or 0) + 1
        if user.failed_logins >= MAX_FAILED_LOGINS:
            user.locked_until = _now() + timedelta(minutes=LOCKOUT_MINUTES)
            user.failed_logins = 0
            _security_alert(
                db,
                f"Password sign-in locked for {user.name}",
                f"{MAX_FAILED_LOGINS} wrong passwords in a row for {user.email}. Locked for {LOCKOUT_MINUTES} minutes.",
            )
            db.commit()
            notifications.dispatch(background, [])
        else:
            db.commit()
        raise HTTPException(status_code=401, detail=INVALID_LOGIN)

    user.failed_logins = 0
    user.locked_until = None
    db.commit()
    issue_session(user, response, request, remember=payload.remember)
    return AuthResponse(message="Login successful", user=user, is_video_admin=is_video_admin(user))


# ---------------- set / change while signed in ----------------


class PasswordStatus(BaseModel):
    password_set: bool
    password_set_at: datetime | None


@router.get("/password/status", response_model=PasswordStatus)
def password_status(current_user: User = Depends(get_current_user)):
    return PasswordStatus(password_set=current_user.password_set_at is not None, password_set_at=current_user.password_set_at)


class PasswordSet(BaseModel):
    new_password: str = Field(min_length=1, max_length=128)
    current_password: str | None = Field(default=None, max_length=128)
    sign_out_other_devices: bool = True


@router.post("/password/set", response_model=AuthResponse)
def set_password(
    payload: PasswordSet,
    request: Request,
    response: Response,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if staff_role(current_user) is None:
        raise HTTPException(status_code=403, detail="Only staff accounts can use password sign-in.")
    ratelimit.hit(f"pw-set:{current_user.id}", limit=10, window_seconds=3600)
    # Changing an existing password needs the current one; the very first one
    # is set right after signing in with a one-time code.
    if current_user.password_set_at is not None:
        if not payload.current_password or not verify_password(payload.current_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="Your current password is incorrect.")
    check_password_strength(payload.new_password, current_user.email)

    first_time = current_user.password_set_at is None
    current_user.password_hash = hash_password(payload.new_password)
    current_user.password_set_at = _now()
    current_user.failed_logins = 0
    current_user.locked_until = None
    if payload.sign_out_other_devices:
        current_user.token_version = (current_user.token_version or 0) + 1
    _security_alert(
        db,
        f"Password {'set' if first_time else 'changed'} for {current_user.name}",
        f"{current_user.email} can now sign in with a password." if first_time else f"{current_user.email} changed their password.",
    )
    db.commit()
    db.refresh(current_user)
    notifications.dispatch(background, [])
    issue_session(current_user, response, request)  # this device stays signed in
    return AuthResponse(message="Password saved", user=current_user, is_video_admin=is_video_admin(current_user))


# ---------------- forgot / reset ----------------


class ForgotRequest(BaseModel):
    email: EmailStr


FORGOT_REPLY = {
    "message": "If this email belongs to a Gratia Estates staff account, a reset code has been sent. "
    f"It expires in {RESET_CODE_TTL_MINUTES} minutes.",
}


@router.post("/password/forgot")
def forgot_password(payload: ForgotRequest, request: Request, db: Session = Depends(get_db)):
    ip = ratelimit.client_ip(request)
    ratelimit.hit(f"pw-forgot-ip:{ip}", limit=5, window_seconds=900)
    email = str(payload.email).lower()
    ratelimit.hit(f"pw-forgot-email:{email}", limit=3, window_seconds=900)

    user = _staff_by_email(db, email)
    if user is None:
        # Identical reply (including a challenge id that simply won't verify),
        # so the response never reveals which emails are registered.
        return {**FORGOT_REPLY, "challenge_id": "reset_" + secrets.token_urlsafe(32)}

    db.execute(delete(PasswordResetChallenge).where(PasswordResetChallenge.user_id == user.id))
    challenge_id = "reset_" + secrets.token_urlsafe(32)
    code = otp.new_code()
    db.add(
        PasswordResetChallenge(
            id=challenge_id,
            user_id=user.id,
            code_hash=otp.hash_code(challenge_id, code),
            expires_at=_now() + timedelta(minutes=RESET_CODE_TTL_MINUTES),
        )
    )
    db.flush()
    try:
        otp.send_code(user.email, code, "password reset")
    except Exception:  # noqa: BLE001 - never reveal delivery details to an unauthenticated caller
        logger.exception("Could not send the password reset code")
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="We couldn't send the reset email right now. Please try again shortly, or sign in with a one-time code.",
        )
    db.commit()
    return {**FORGOT_REPLY, "challenge_id": challenge_id}


class ResetRequest(BaseModel):
    challenge_id: str = Field(min_length=10, max_length=64)
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(min_length=1, max_length=128)


@router.post("/password/reset")
def reset_password(payload: ResetRequest, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    ip = ratelimit.client_ip(request)
    ratelimit.hit(f"pw-reset-ip:{ip}", limit=15, window_seconds=900)
    invalid = HTTPException(status_code=400, detail="This reset code is invalid or has expired. Request a new one.")

    challenge = db.get(PasswordResetChallenge, payload.challenge_id)
    if challenge is None or _aware(challenge.expires_at) < _now():
        raise invalid
    if challenge.attempts >= RESET_MAX_ATTEMPTS:
        db.delete(challenge)
        db.commit()
        raise invalid
    if not otp.codes_match(challenge.code_hash, challenge.id, payload.code):
        challenge.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="That code is not correct. Check the email and try again.")

    user = db.get(User, challenge.user_id)
    if user is None or not user.is_active or staff_role(user) is None:
        raise invalid
    check_password_strength(payload.new_password, user.email)

    user.password_hash = hash_password(payload.new_password)
    user.password_set_at = _now()
    user.failed_logins = 0
    user.locked_until = None
    user.token_version = (user.token_version or 0) + 1  # sign out every existing session
    db.delete(challenge)
    _security_alert(db, f"Password reset for {user.name}", f"{user.email} reset their password; all sessions were signed out.")
    db.commit()
    notifications.dispatch(background, [])
    return {"message": "Your password has been reset. Sign in with your new password."}


# ---------------- sign out everywhere ----------------


@router.post("/logout-all")
def logout_all(response: Response, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.token_version = (current_user.token_version or 0) + 1
    db.commit()
    clear_auth_cookies(response)
    return {"message": "Signed out on every device."}
