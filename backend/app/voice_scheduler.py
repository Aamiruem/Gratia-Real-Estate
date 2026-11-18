"""Render Cron entry point for consented Retell follow-up calls."""

import logging

from .automated_calls import run_scheduled_calls
from .database import SessionLocal, create_tables

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gratia.voice_scheduler")


def main() -> None:
    create_tables()
    with SessionLocal() as db:
        started = run_scheduled_calls(db)
    logger.info("Started %s consented Retell call(s).", started)


if __name__ == "__main__":
    main()
