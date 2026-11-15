"""Loads backend settings from environment files.

Order (first value wins, real environment variables always win):
  1. Process environment (hosting provider secrets, docker env_file)
  2. %LOCALAPPDATA%/GratiaEstates/backend.env  (optional private copy on Windows)
  3. backend/.env                         (your local settings, git-ignored)

In local development, missing JWT secrets are generated once and saved to
backend/.env so the server can always start.
"""

import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv, set_key

logger = logging.getLogger("gratia.config")

BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BACKEND_DIR / ".env"
LOCAL_CONFIG_DIR = Path(
    os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")
) / "GratiaEstates"
LOCAL_CONFIG_FILE = LOCAL_CONFIG_DIR / "backend.env"

if LOCAL_CONFIG_FILE.is_file():
    load_dotenv(LOCAL_CONFIG_FILE)
load_dotenv(ENV_FILE)


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def env_bool(name: str, default: bool = False) -> bool:
    return env(name, "true" if default else "false").lower() in {"1", "true", "yes", "on"}


# Production = served over HTTPS. Controls secure cookies and disables dev fallbacks.
IS_PRODUCTION = env_bool("COOKIE_SECURE")


def _ensure_dev_secret(name: str) -> None:
    if env(name):
        return
    if IS_PRODUCTION:
        raise RuntimeError(f"{name} is missing. Set it in the hosting environment.")
    value = secrets.token_hex(32)
    os.environ[name] = value
    try:
        ENV_FILE.touch(exist_ok=True)
        set_key(str(ENV_FILE), name, value, quote_mode="never")
        logger.warning("Generated %s for local development and saved it to backend/.env", name)
    except OSError:
        logger.warning("Generated a temporary %s (could not save it to backend/.env)", name)


_ensure_dev_secret("JWT_SECRET_KEY")
_ensure_dev_secret("JWT_REFRESH_SECRET_KEY")
