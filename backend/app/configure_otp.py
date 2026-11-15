"""Configure private SMTP and Twilio settings for owner OTP delivery."""

import base64
import getpass
import re
import smtplib
import ssl
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import dotenv_values, set_key

from .config import LOCAL_CONFIG_FILE


def _test_smtp(host: str, port: int, username: str, password: str) -> None:
    try:
        if port == 465:
            with smtplib.SMTP_SSL(
                host, port, timeout=15, context=ssl.create_default_context()
            ) as smtp:
                smtp.login(username, password)
        else:
            with smtplib.SMTP(host, port, timeout=15) as smtp:
                smtp.ehlo()
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
                smtp.login(username, password)
    except (OSError, smtplib.SMTPException) as error:
        raise ValueError(
            "SMTP connection or login failed. Check the host, port, username, "
            "password/app password, and provider security settings."
        ) from error


def _test_twilio(account_sid: str, auth_token: str) -> None:
    credentials = base64.b64encode(
        f"{account_sid}:{auth_token}".encode("ascii")
    ).decode("ascii")
    request = Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}.json",
        headers={"Authorization": f"Basic {credentials}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=15) as response:
            if response.status != 200:
                raise ValueError(
                    f"Twilio credential check returned HTTP {response.status}."
                )
    except HTTPError as error:
        raise ValueError(
            f"Twilio credential check failed (HTTP {error.code}). Check the Account SID and Auth Token."
        ) from error
    except URLError as error:
        raise ValueError(
            "Could not reach Twilio. Check the network connection and try again."
        ) from error


def _setting(prompt: str, current: str | None = None) -> str:
    while True:
        suffix = " [configured]" if current else ""
        value = input(f"{prompt}{suffix}: ").strip()
        if value:
            return value
        if current:
            return current
        print("This value is required.")


def _secret(prompt: str, current: str | None = None) -> str:
    while True:
        suffix = " [press Enter to keep configured value]" if current else ""
        value = getpass.getpass(f"{prompt}{suffix}: ").strip()
        if value:
            return value
        if current:
            return current
        print("This value is required.")


def _save_values(config_file: Path, values: dict[str, str]) -> None:
    config_file.parent.mkdir(parents=True, exist_ok=True)
    config_file.touch(exist_ok=True)
    for key, value in values.items():
        set_key(str(config_file), key, value, quote_mode="always")


def gmail_password_only() -> None:
    """Shortcut: SMTP settings are already saved, only the Gmail App Password is asked for."""
    current = dotenv_values(LOCAL_CONFIG_FILE)
    user = current.get("SMTP_USER")
    if not user:
        raise ValueError("No Gmail address is saved yet. Run: python -m app.configure_otp")
    print(f"Gmail account: {user}")
    print("Create an App Password at https://myaccount.google.com/apppasswords")
    password = _secret("Paste the 16-character Gmail App Password").replace(" ", "")
    _test_smtp(current.get("SMTP_HOST") or "smtp.gmail.com", int(current.get("SMTP_PORT") or 587), user, password)
    _save_values(LOCAL_CONFIG_FILE, {"SMTP_PASSWORD": password})
    print("Gmail login verified and saved. Restart the backend; codes will now arrive by email.")


def main() -> None:
    current = dotenv_values(LOCAL_CONFIG_FILE)
    print("Configure OTP delivery in the private backend settings.")
    print("Values are saved locally and secrets are not displayed.")
    print(f"Config file: {LOCAL_CONFIG_FILE}")
    values: dict[str, str] = {}
    configure_email = input("\nConfigure email OTP (Gmail) now? [y/N]: ").strip().lower()
    if configure_email in {"y", "yes"}:
        print("\nEmail (SMTP)")
        smtp_host = _setting(
            "SMTP host (press Enter for Gmail, smtp.gmail.com)",
            current.get("SMTP_HOST") or "smtp.gmail.com",
        )
        smtp_port = _setting("SMTP port", current.get("SMTP_PORT") or "587")
        if not smtp_port.isdigit() or not 1 <= int(smtp_port) <= 65535:
            raise ValueError("SMTP port must be a number between 1 and 65535.")
        smtp_user = _setting("SMTP account email / username", current.get("SMTP_USER"))
        smtp_password = _secret("SMTP password or email app password", current.get("SMTP_PASSWORD"))
        smtp_from = _setting("From address", current.get("SMTP_FROM") or smtp_user)
        _test_smtp(smtp_host, int(smtp_port), smtp_user, smtp_password)
        print("SMTP login verified.")
        values.update(
            {
                "SMTP_HOST": smtp_host,
                "SMTP_PORT": smtp_port,
                "SMTP_USER": smtp_user,
                "SMTP_PASSWORD": smtp_password,
                "SMTP_FROM": smtp_from,
            }
        )
    configure_sms = input("\nConfigure mobile SMS OTP (codes by normal SMS, no app needed) now? [y/N]: ").strip().lower()
    if configure_sms in {"y", "yes"}:
        values.update(_configure_sms(current))
        configure_sms = "y"

    if not values:
        print("\nNothing was configured. Run this setup again when you are ready.")
        return
    _save_values(LOCAL_CONFIG_FILE, values)
    print("\nSaved:", ", ".join(
        name for name, chosen in (("email OTP", configure_email), ("mobile SMS OTP", configure_sms))
        if chosen in {"y", "yes"}
    ))
    if configure_sms in {"y", "yes"}:
        if input("\nSend a test SMS to the owner's phone now? [Y/n]: ").strip().lower() in {"", "y", "yes"}:
            send_test_sms(values)
    print("Restart the backend (start-backend.bat) to load the new settings, then refresh the sign-in page.")


def _owner_phone(current: dict) -> str:
    """Accepts 98765 43210, 098765 43210, +91 98765 43210 or any +<country> number."""
    raw = _setting(
        "Owner mobile number (10-digit Indian number, or +<country code> for others)",
        current.get("OWNER_PHONE_NUMBER"),
    )
    digits = re.sub(r"\D", "", raw)
    if raw.strip().startswith("+"):
        phone = "+" + digits
    elif len(digits) == 10 and digits[0] in "6789":
        phone = "+91" + digits
    elif len(digits) == 11 and digits.startswith("0"):
        phone = "+91" + digits[1:]
    elif len(digits) == 12 and digits.startswith("91"):
        phone = "+" + digits
    else:
        phone = ""
    if not re.fullmatch(r"\+[1-9]\d{7,14}", phone):
        raise ValueError("Enter a valid mobile number, e.g. 98765 43210 or +91 98765 43210.")
    return phone


SMS_CHOICES = {
    "1": "fast2sms",
    "2": "msg91",
    "3": "twilio",
}


def _configure_sms(current: dict) -> dict[str, str]:
    print("\nChoose an SMS provider:")
    print("  1) Fast2SMS  - India only, quickest to start (fast2sms.com → Dev API → API key)")
    print("  2) MSG91     - India, needs a DLT-approved OTP template (msg91.com)")
    print("  3) Twilio    - worldwide (twilio.com); trial accounts can only text verified numbers")
    choice = SMS_CHOICES.get(input("Provider [1]: ").strip() or "1")
    if choice is None:
        raise ValueError("Please choose 1, 2 or 3.")
    owner_phone = _owner_phone(current)
    values = {"OWNER_PHONE_NUMBER": owner_phone, "SMS_PROVIDER": choice}

    if choice == "fast2sms":
        if not owner_phone.startswith("+91"):
            raise ValueError("Fast2SMS only delivers to Indian (+91) numbers. Choose Twilio for other countries.")
        values["FAST2SMS_API_KEY"] = _secret("Fast2SMS API key (Dev API → API Key)", current.get("FAST2SMS_API_KEY"))
        return values

    if choice == "msg91":
        values["MSG91_AUTH_KEY"] = _secret("MSG91 Auth Key", current.get("MSG91_AUTH_KEY"))
        values["MSG91_TEMPLATE_ID"] = _setting("MSG91 OTP template ID (DLT approved)", current.get("MSG91_TEMPLATE_ID"))
        values["MSG91_OTP_VAR"] = _setting("Template variable name for the code", current.get("MSG91_OTP_VAR") or "otp")
        return values

    print("\nSMS (Twilio)")
    account_sid = _setting("Twilio Account SID", current.get("TWILIO_ACCOUNT_SID"))
    if not re.fullmatch(r"AC[0-9a-fA-F]{32}", account_sid):
        raise ValueError("Twilio Account SID must start with AC and contain 32 hexadecimal characters.")
    auth_token = _secret("Twilio Auth Token", current.get("TWILIO_AUTH_TOKEN"))
    existing_sender = current.get("TWILIO_MESSAGING_SERVICE_SID") or current.get("TWILIO_FROM_NUMBER")
    sender = _setting("Twilio sender phone number or Messaging Service SID", existing_sender)
    if sender.startswith("MG"):
        if not re.fullmatch(r"MG[0-9a-fA-F]{32}", sender):
            raise ValueError("Twilio Messaging Service SID must start with MG and contain 32 hexadecimal characters.")
        from_number, messaging_service_sid = "", sender
    else:
        if not re.fullmatch(r"\+[1-9]\d{7,14}", sender):
            raise ValueError("Twilio sender phone must use international E.164 format, e.g. +15557654321.")
        from_number, messaging_service_sid = sender, ""
    _test_twilio(account_sid, auth_token)
    print("Twilio credentials verified.")
    values.update(
        {
            "TWILIO_ACCOUNT_SID": account_sid,
            "TWILIO_AUTH_TOKEN": auth_token,
            "TWILIO_FROM_NUMBER": from_number,
            "TWILIO_MESSAGING_SERVICE_SID": messaging_service_sid,
        }
    )
    return values


def send_test_sms(overrides: dict[str, str] | None = None) -> None:
    """Sends a real SMS to OWNER_PHONE_NUMBER with the saved (or just-entered) settings."""
    import os
    import secrets

    from .delivery import DeliveryError, sms

    for key, value in (overrides or {}).items():
        os.environ[key] = value  # settings typed just now aren't loaded yet
    phone = os.environ.get("OWNER_PHONE_NUMBER", "")
    if not sms.configured():
        raise ValueError("No SMS provider is fully configured. Run: python -m app.configure_otp")
    code = f"{secrets.randbelow(1_000_000):06d}"
    try:
        sms.send(phone, code, "test", 10)
    except DeliveryError as error:
        raise ValueError(f"The test SMS was not accepted: {error}") from error
    masked = phone[:3] + "******" + phone[-4:]
    print(f"Test SMS accepted by {sms.provider()} for {masked} (test code {code}). Check your phone's Messages app.")


if __name__ == "__main__":
    import sys

    try:
        command = sys.argv[1:]
        if command == ["gmail"]:
            gmail_password_only()
        elif command == ["test-sms"]:
            send_test_sms()
        else:
            main()
    except ValueError as error:
        raise SystemExit(str(error)) from error
