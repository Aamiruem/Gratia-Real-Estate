"""One-time owner verification codes: generation, hashing and delivery.

Delivery channels (configure in backend/.env, see .env.example):
  * Email  -> app/delivery/email.py  (SMTP or Resend)
  * Mobile -> app/delivery/sms.py    (Twilio, MSG91 or Fast2SMS)
  * ntfy push notification as an optional backup (NTFY_TOPIC)

Local development (COOKIE_SECURE=false) without a provider: the code is
printed in the backend terminal and shown on the sign-in page for requests
from this computer, so sign-in always works while developing.
"""

import hashlib
import hmac
import logging
import secrets
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from . import config
from .delivery import DeliveryError
from .delivery import email as email_delivery
from .delivery import sms as sms_delivery
from .security import JWT_SECRET_KEY

logger = logging.getLogger("gratia.otp")

CODE_TTL_MINUTES = 10
MAX_ATTEMPTS = 5
RESEND_AFTER_SECONDS = 30

__all__ = ["DeliveryError"]


# ---------------------------------------------------------------- availability
def smtp_configured() -> bool:
    """True when a real email provider is configured (name kept for compatibility)."""
    return email_delivery.configured()


def twilio_configured() -> bool:
    """True when a real SMS provider is configured (name kept for compatibility)."""
    return sms_delivery.configured()


def push_configured() -> bool:
    return bool(config.env("NTFY_TOPIC"))


def console_fallback_enabled() -> bool:
    """Development only: show codes in the terminal when no provider is set."""
    return config.env_bool("OTP_CONSOLE_FALLBACK", default=not config.IS_PRODUCTION)


def owner_phone() -> str:
    return config.env("OWNER_PHONE_NUMBER")


def email_otp_available() -> bool:
    return email_delivery.configured() or push_configured() or console_fallback_enabled()


def phone_otp_available() -> bool:
    return bool(owner_phone()) and (
        sms_delivery.configured() or push_configured() or console_fallback_enabled()
    )


# ----------------------------------------------------------------------- codes
def new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(challenge_id: str, code: str) -> str:
    # Keyed hash: a leaked database row cannot be brute-forced offline.
    message = f"{challenge_id}:{code}".encode()
    return hmac.new(JWT_SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def codes_match(stored_hash: str, challenge_id: str, code: str) -> bool:
    return hmac.compare_digest(stored_hash, hash_code(challenge_id, code))


def mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    visible = name[:2] if len(name) > 2 else name[:1]
    return f"{visible}{'*' * max(len(name) - len(visible), 2)}@{domain}"


def mask_phone(phone: str) -> str:
    digits = sms_delivery.digits(phone)
    return f"******{digits[-4:]}" if digits else "configured phone"


def same_phone(a: str | None, b: str | None) -> bool:
    """Compares the last 10 digits so '+91 98xxxxxxxx' and '98xxxxxxxx' match."""
    left, right = sms_delivery.digits(a or "")[-10:], sms_delivery.digits(b or "")[-10:]
    return len(left) == 10 and hmac.compare_digest(left, right)


# -------------------------------------------------------------------- delivery
def send_code(email: str, code: str, purpose: str = "sign-in") -> str:
    """Emails the code. Returns how it was delivered: "email", "push" or "log"."""
    if email_delivery.configured():
        email_delivery.send(email, code, purpose, CODE_TTL_MINUTES)
        return "email"
    return _deliver_without_provider(email, code, purpose)


def send_sms_code(phone: str, code: str, purpose: str = "sign-in") -> str:
    """Texts the code. Returns how it was delivered: "sms", "push" or "log"."""
    if sms_delivery.configured():
        sms_delivery.send(phone, code, purpose, CODE_TTL_MINUTES)
        return "sms"
    return _deliver_without_provider(mask_phone(phone), code, purpose)


def _deliver_without_provider(recipient: str, code: str, purpose: str) -> str:
    if console_fallback_enabled():
        return _log_code(recipient, code, purpose)
    if send_push_code(code, purpose):
        return "push"
    raise DeliveryError("No verification delivery (email, SMS or ntfy) is configured.")


def send_push_code(code: str, purpose: str) -> bool:
    """Sends the code as a phone notification through ntfy (https://ntfy.sh).
    The topic name is a long random secret; the owner subscribes in the ntfy app."""
    topic = config.env("NTFY_TOPIC")
    if not topic:
        return False
    server = config.env("NTFY_SERVER", "https://ntfy.sh").rstrip("/")
    request = Request(
        f"{server}/{topic}",
        data=f"{code} is your Gratia Estates {purpose} code. It expires in {CODE_TTL_MINUTES} minutes.".encode(),
        headers={"Title": f"Gratia Estates {purpose} code", "Priority": "high", "Tags": "lock"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            return response.status < 300
    except (HTTPError, URLError):
        logger.exception("Could not send the owner code notification")
        return False


def _log_code(recipient: str, code: str, purpose: str) -> str:
    pushed = send_push_code(code, purpose)
    try:
        code_file = config.LOCAL_CONFIG_DIR / "latest_otp.txt"
        code_file.parent.mkdir(parents=True, exist_ok=True)
        code_file.write_text(f"{purpose} code for {recipient}: {code} (valid {CODE_TTL_MINUTES} min)\n")
    except OSError:
        pass
    print(
        f"\n*** [DEV] Gratia owner {purpose} code for {recipient}: {code} (valid {CODE_TTL_MINUTES} min) ***\n",
        flush=True,
    )
    return "push" if pushed else "log"
