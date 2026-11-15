"""WhatsApp delivery for one-time codes through the official Meta WhatsApp
Cloud API (WhatsApp Business Platform). No unofficial/WhatsApp-Web automation.

Required (Meta Business Manager → WhatsApp → API setup):
    WHATSAPP_PHONE_NUMBER_ID   the business phone number's ID
    WHATSAPP_ACCESS_TOKEN      a System User permanent token with whatsapp_business_messaging
    WHATSAPP_OTP_TEMPLATE      name of an APPROVED template in the "Authentication" category
Optional:
    WHATSAPP_TEMPLATE_LANG     template language code (default "en")
    WHATSAPP_TEMPLATE_BUTTON   "true" (default) when the template has the standard
                               copy-code / one-tap button, which needs the code too
    WHATSAPP_API_VERSION       Graph API version (default "v21.0")
"""

from .. import config
from . import DeliveryError
from .http import post_json


def configured() -> bool:
    return bool(
        config.env("WHATSAPP_PHONE_NUMBER_ID")
        and config.env("WHATSAPP_ACCESS_TOKEN")
        and config.env("WHATSAPP_OTP_TEMPLATE")
    )


def build_payload(e164: str, code: str) -> dict:
    components = [{"type": "body", "parameters": [{"type": "text", "text": code}]}]
    if config.env_bool("WHATSAPP_TEMPLATE_BUTTON", default=True):
        components.append(
            {"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text": code}]}
        )
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": e164.lstrip("+"),
        "type": "template",
        "template": {
            "name": config.env("WHATSAPP_OTP_TEMPLATE"),
            "language": {"code": config.env("WHATSAPP_TEMPLATE_LANG", "en")},
            "components": components,
        },
    }


def send(e164: str, code: str) -> str:
    """Sends the code; returns Meta's message id (delivery is confirmed later by webhook)."""
    version = config.env("WHATSAPP_API_VERSION", "v21.0")
    reply = post_json(
        f"https://graph.facebook.com/{version}/{config.env('WHATSAPP_PHONE_NUMBER_ID')}/messages",
        build_payload(e164, code),
        headers={"Authorization": f"Bearer {config.env('WHATSAPP_ACCESS_TOKEN')}"},
        provider="WhatsApp",
    )
    messages = reply.get("messages") or []
    if not messages:
        raise DeliveryError("WhatsApp did not accept the message.")
    return messages[0].get("id", "")
