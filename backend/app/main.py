if __package__ in (None, ""):
    import sys
    from pathlib import Path

    backend_dir = Path(__file__).resolve().parent.parent
    backend_python = backend_dir / ".venv" / "Scripts" / "python.exe"
    if (
        __name__ == "__main__"
        and backend_python.is_file()
        and Path(sys.executable).resolve() != backend_python.resolve()
    ):
        import os

        os.execv(
            str(backend_python),
            [str(backend_python), str(Path(__file__).resolve()), *sys.argv[1:]],
        )

    sys.path.insert(0, str(backend_dir))
    __package__ = "app"

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from . import config  # noqa: F401
from . import otp
from .database import create_tables, engine
from .routers.auth import router as auth_router
from .routers.leads import router as leads_router
from .routers.notifications import router as notifications_router
from .routers.reactions import router as reactions_router
from .routers.users import router as users_router
from .routers.videos import router as videos_router
from .seed import seed_sample_videos


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    seed_sample_videos()
    yield


app = FastAPI(
    title="Gratia Estates API",
    version="1.1.0",
    description="Owner OTP sign-in, project videos, reactions, leads and notifications for gratiaestates.com",
    lifespan=lifespan,
)

frontend_origins = {
    origin.strip()
    for origin in (
        "http://localhost:5173,http://127.0.0.1:5173,"
        + os.getenv("FRONTEND_ORIGINS", "")
        + ","
        + os.getenv("FRONTEND_ORIGIN", "")
    ).split(",")
    if origin.strip()
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(frontend_origins),
    allow_origin_regex=(
        r"https?://(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|"
        r"172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|"
        r"192\.168(?:\.\d{1,3}){2}):\d+"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def strip_api_prefix(request: Request, call_next):
    """Accept both /videos and /api/videos, so the backend works the same behind
    the Vite dev proxy, Caddy, the Vercel proxy function or when called directly."""
    path = request.scope["path"]
    if path == "/api" or path.startswith("/api/"):
        request.scope["path"] = path[4:] or "/"
        request.state.api_prefix = "/api"  # cookies must be scoped to what the browser sees
    return await call_next(request)


@app.get("/health")
def health():
    database = "ok"
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 - report, don't crash the health check
        database = "unreachable"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "database": database,
        "otp": {
            "email": "provider" if otp.smtp_configured() else ("dev-console" if otp.email_otp_available() else "off"),
            "sms": "provider" if otp.twilio_configured() else ("dev-console" if otp.phone_otp_available() else "off"),
        },
    }


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(videos_router)
app.include_router(reactions_router)
app.include_router(leads_router)
app.include_router(notifications_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
