"""Message delivery for one-time codes.

Each module exposes `configured()` and `send(...)`. Adding a provider means
adding one function to email.py or sms.py and a value for EMAIL_PROVIDER /
SMS_PROVIDER; nothing else in the app needs to change.
"""


class DeliveryError(RuntimeError):
    """A provider is configured but could not deliver the message."""
