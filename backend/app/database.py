from sqlalchemy import Index, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from . import config

# PostgreSQL in production. For quick local development without PostgreSQL,
# leave DATABASE_URL empty and a SQLite file (backend/gratia.db) is used.
DATABASE_URL = config.env("DATABASE_URL")
if not DATABASE_URL:
    if config.IS_PRODUCTION:
        raise RuntimeError("DATABASE_URL is missing. Set it in the hosting environment.")
    DATABASE_URL = f"sqlite:///{(config.BACKEND_DIR / 'gratia.db').as_posix()}"
    config.logger.warning("DATABASE_URL not set; using local SQLite database backend/gratia.db")

IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    from .models import (  # noqa: F401
        AnalyticsEvent,
        CustomerOtpRateLimit,
        CustomerSignupChallenge,
        AuditLog,
        EmailChangeChallenge,
        FollowUp,
        Property,
        PushSubscription,
        SiteSetting,
        Lead,
        LoginChallenge,
        Notification,
        OwnerRecoveryChallenge,
        OwnerSetupState,
        PasswordResetChallenge,
        User,
        Video,
        VideoReaction,
        VoiceCall,
    )

    Base.metadata.create_all(bind=engine)
    from .migrate import add_missing_columns

    add_missing_columns(engine, Base.metadata)
    Index("ix_users_phone_number", User.phone_number, unique=True).create(bind=engine, checkfirst=True)
