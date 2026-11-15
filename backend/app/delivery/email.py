"""Email delivery: SMTP (Gmail, Zoho, Hostinger...) or the Resend HTTPS API.

EMAIL_PROVIDER=smtp | resend   (auto-detected when empty)

SMTP (Gmail example; needs a Google "App Password", not your normal password):
    SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_USER=you@gmail.com
    SMTP_PASSWORD=xxxx xxxx xxxx xxxx  SMTP_FROM=Gratia Estates <you@gmail.com>
    Port 465 uses implicit SSL, any other port uses STARTTLS.

Resend (works on hosts that block SMTP ports, e.g. Render/Railway free tiers):
    RESEND_API_KEY=re_...  EMAIL_FROM=Gratia Estates <otp@yourdomain.com>
"""

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import parseaddr

from .. import config
from . import DeliveryError
from .http import post_json


def provider() -> str:
    chosen = config.env("EMAIL_PROVIDER").lower()
    if chosen:
        return chosen
    if config.env("RESEND_API_KEY"):
        return "resend"
    if config.env("SMTP_HOST") and config.env("SMTP_USER") and config.env("SMTP_PASSWORD"):
        return "smtp"
    return ""


def configured() -> bool:
    name = provider()
    if name == "resend":
        return bool(config.env("RESEND_API_KEY") and _sender())
    if name == "smtp":
        try:
            port = int(config.env("SMTP_PORT", "587"))
        except ValueError:
            return False
        return bool(config.env("SMTP_HOST") and config.env("SMTP_USER") and config.env("SMTP_PASSWORD") and 0 < port < 65536)
    return False


def _sender() -> str:
    return config.env("EMAIL_FROM") or config.env("SMTP_FROM") or config.env("SMTP_USER")


def build_message(to: str, code: str, purpose: str, ttl_minutes: int) -> tuple[str, str, str]:
    warning = {
        "sign-in": "If you didn't try to sign in, someone may know your owner email. No action is needed unless this repeats.",
        "email change": "If you didn't request an email change, secure your account immediately.",
    }.get(purpose, "If you didn't request this code, you can ignore this email.")
    subject = f"{code} is your Gratia Estates {purpose} code"
    text = f"Your Gratia Estates owner {purpose} code is: {code}\n\nIt expires in {ttl_minutes} minutes. {warning}"
    html = f"""<div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;padding:24px;border:1px solid #e7e2d8;border-radius:16px">
<p style="color:#80602b;font-size:12px;letter-spacing:2px;font-weight:bold;margin:0">GRATIA ESTATES</p>
<h2 style="color:#142536;margin:8px 0 16px">Your {purpose} code</h2>
<p style="font-size:34px;letter-spacing:10px;font-weight:bold;color:#142536;background:#f7f4ed;border-radius:12px;padding:14px;text-align:center;margin:0">{code}</p>
<p style="color:#5e6872;font-size:14px;margin-top:16px">This code expires in {ttl_minutes} minutes. {warning}</p>
</div>"""
    return subject, text, html


def send(to: str, code: str, purpose: str, ttl_minutes: int) -> None:
    subject, text, html = build_message(to, code, purpose, ttl_minutes)
    name = provider()
    if name == "resend":
        post_json(
            "https://api.resend.com/emails",
            {"from": _sender(), "to": [to], "subject": subject, "text": text, "html": html},
            headers={"Authorization": f"Bearer {config.env('RESEND_API_KEY')}"},
            provider="Resend",
        )
        return
    if name == "smtp":
        _send_smtp(to, subject, text, html)
        return
    raise DeliveryError(f"Unknown EMAIL_PROVIDER '{name}'.")


def _send_smtp(to: str, subject: str, text: str, html: str) -> None:
    host = config.env("SMTP_HOST")
    port = int(config.env("SMTP_PORT", "587"))
    user = config.env("SMTP_USER")
    password = config.env("SMTP_PASSWORD").replace(" ", "")  # Gmail app passwords are shown with spaces
    sender = _sender()
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    context = ssl.create_default_context()
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=15, context=context) as smtp:
                smtp.login(user, password)
                smtp.send_message(message, from_addr=parseaddr(sender)[1] or user)
        else:
            with smtplib.SMTP(host, port, timeout=15) as smtp:
                smtp.starttls(context=context)
                smtp.login(user, password)
                smtp.send_message(message, from_addr=parseaddr(sender)[1] or user)
    except smtplib.SMTPAuthenticationError as error:
        raise DeliveryError("SMTP login failed. For Gmail, use a 16-character App Password.") from error
    except (OSError, smtplib.SMTPException) as error:
        raise DeliveryError(f"Could not send email through {host}:{port}.") from error
