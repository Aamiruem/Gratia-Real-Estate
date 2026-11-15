"""SMS delivery for mobile OTP.

SMS_PROVIDER=twilio | msg91 | fast2sms   (auto-detected when empty)

Twilio (worldwide):
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID
MSG91 (India, DLT-approved template with one variable, e.g. ##otp##):
    MSG91_AUTH_KEY, MSG91_TEMPLATE_ID   (optional MSG91_OTP_VAR, default "otp")
Fast2SMS (India, OTP route):
    FAST2SMS_API_KEY
"""

import base64
from urllib.parse import urlencode

from .. import config
from . import DeliveryError
from .http import post, post_json


def provider() -> str:
    chosen = config.env("SMS_PROVIDER").lower()
    if chosen:
        return chosen
    if config.env("TWILIO_ACCOUNT_SID"):
        return "twilio"
    if config.env("MSG91_AUTH_KEY"):
        return "msg91"
    if config.env("FAST2SMS_API_KEY"):
        return "fast2sms"
    return ""


def configured() -> bool:
    name = provider()
    if name == "twilio":
        return bool(
            config.env("TWILIO_ACCOUNT_SID")
            and config.env("TWILIO_AUTH_TOKEN")
            and (config.env("TWILIO_FROM_NUMBER") or config.env("TWILIO_MESSAGING_SERVICE_SID"))
        )
    if name == "msg91":
        return bool(config.env("MSG91_AUTH_KEY") and config.env("MSG91_TEMPLATE_ID"))
    if name == "fast2sms":
        return bool(config.env("FAST2SMS_API_KEY"))
    return False


def digits(phone: str) -> str:
    return "".join(character for character in phone or "" if character.isdigit())


def to_e164(phone: str, default_country: str = "91") -> str:
    """'98765 43210' -> '+919876543210'; '+44 7700 900123' stays as is."""
    raw = (phone or "").strip()
    number = digits(raw)
    if raw.startswith("+"):
        return f"+{number}"
    if len(number) == 10:
        return f"+{default_country}{number}"
    if number.startswith("0") and len(number) == 11:
        return f"+{default_country}{number[1:]}"
    return f"+{number}"


def send(phone: str, code: str, purpose: str, ttl_minutes: int) -> None:
    name = provider()
    e164 = to_e164(phone)
    text = f"{code} is your Gratia Estates {purpose} code. It expires in {ttl_minutes} minutes. Do not share it."
    if name == "twilio":
        _twilio(e164, text)
    elif name == "msg91":
        _msg91(e164, code)
    elif name == "fast2sms":
        _fast2sms(e164, code)
    else:
        raise DeliveryError(f"Unknown SMS_PROVIDER '{name}'.")


def _twilio(e164: str, text: str) -> None:
    sid = config.env("TWILIO_ACCOUNT_SID")
    token = config.env("TWILIO_AUTH_TOKEN")
    fields = {"To": e164, "Body": text}
    if config.env("TWILIO_MESSAGING_SERVICE_SID"):
        fields["MessagingServiceSid"] = config.env("TWILIO_MESSAGING_SERVICE_SID")
    else:
        fields["From"] = config.env("TWILIO_FROM_NUMBER")
    credentials = base64.b64encode(f"{sid}:{token}".encode()).decode()
    post(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        data=urlencode(fields).encode(),
        headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/x-www-form-urlencoded"},
        provider="Twilio",
    )


def _msg91(e164: str, code: str) -> None:
    variable = config.env("MSG91_OTP_VAR", "otp")
    reply = post_json(
        "https://control.msg91.com/api/v5/flow",
        {"template_id": config.env("MSG91_TEMPLATE_ID"), "short_url": "0", "recipients": [{"mobiles": e164.lstrip("+"), variable: code}]},
        headers={"authkey": config.env("MSG91_AUTH_KEY")},
        provider="MSG91",
    )
    if str(reply.get("type", "success")).lower() == "error":
        raise DeliveryError(f"MSG91 error: {reply.get('message', 'unknown')}")


def _fast2sms(e164: str, code: str) -> None:
    number = digits(e164)
    if not number.startswith("91") or len(number) != 12:
        raise DeliveryError("Fast2SMS only delivers to Indian (+91) mobile numbers.")
    reply = post_json(
        "https://www.fast2sms.com/dev/bulkV2",
        {"route": "otp", "variables_values": code, "numbers": number[2:]},
        headers={"authorization": config.env("FAST2SMS_API_KEY")},
        provider="Fast2SMS",
    )
    if reply.get("return") is False:
        raise DeliveryError(f"Fast2SMS error: {reply.get('message', 'unknown')}")
