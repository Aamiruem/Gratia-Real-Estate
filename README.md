# Gratia Estates website

React (Vite + Tailwind) website with a FastAPI backend for the owner's video
library: passwordless sign-in with **email OTP or mobile OTP**, project
videos, and public like/dislike reactions.

```
frontend/            React site (Vite). Deployed on Vercel.
  api/proxy.js       Vercel function: /api/* -> BACKEND_URL (keeps cookies same-site)
  src/services/      apiClient.js (all API calls go to /api), authApi.js
  src/pages/         Videos.jsx, VideoAdminAuth.jsx (OTP sign-in), ...
backend/             FastAPI API
  app/main.py        app, CORS, /health, accepts /api prefix
  app/config.py      env loading (+ dev defaults)
  app/otp.py         code generation, hashing, channel selection
  app/delivery/      email.py (SMTP, Resend), sms.py (MSG91, Fast2SMS, Twilio)
  app/routers/       auth.py (OTP login), videos.py, reactions.py
  tests/             pytest suite (run: pytest -q)
render.yaml          one-click API + Postgres on Render
docker-compose.prod.yml + deploy/   alternative: whole stack on one VPS (Caddy)
```

## How requests flow

The browser always calls `/api/...` on the site's own address:

| Where          | What forwards `/api`             |
| -------------- | -------------------------------- |
| Local dev      | Vite proxy → `127.0.0.1:8000`    |
| Vercel         | `frontend/api/proxy.js` → `BACKEND_URL` |
| VPS (Docker)   | Caddy → `api` container          |

Same-origin calls mean no CORS issues and the login cookies just work.

## Run locally (Windows)

1. Double-click **`start-backend.bat`** (keep the window open).
   With no `backend/.env` it uses SQLite, generates secrets and prints OTP
   codes in the window, so it runs out of the box. To test sign-in, add
   `VIDEO_ADMIN_EMAIL=you@example.com` (and `OWNER_PHONE_NUMBER=+91...`)
   to `backend/.env` and restart.
2. In another terminal:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
3. Open http://localhost:5173/videos. Owner sign-in is at `/video-admin/login`;
   in local mode the code is shown on the page.

> If an old `frontend/.env` sets `VITE_API_URL=http://127.0.0.1:8000`, delete
> that line so the site uses the `/api` proxy.

Check the backend any time at http://localhost:8000/health. It reports the
database and whether email/SMS OTP use a real provider or the dev console.

## Turn on real OTP delivery

Put these in `backend/.env` (local) or your host's environment (production).
Full list with comments: [`backend/.env.example`](backend/.env.example).

**Email OTP – Gmail (simplest):**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourname@gmail.com
SMTP_PASSWORD=abcd efgh ijkl mnop     # Google App Password, not your login password
SMTP_FROM=Gratia Estates <yourname@gmail.com>
```
**Email OTP – Resend** (use this on Render/Railway, which block SMTP):
`RESEND_API_KEY=re_...` and `EMAIL_FROM=Gratia Estates <otp@yourdomain.com>`.

**Mobile OTP (India)** – pick one:
- MSG91: `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`
  (a DLT-approved OTP template containing `##otp##`).
- Fast2SMS: `SMS_PROVIDER=fast2sms`, `FAST2SMS_API_KEY`.
- Twilio: `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_FROM_NUMBER`.

Always set `OWNER_PHONE_NUMBER` (the only number allowed to sign in).
Users can type it as `98765 43210`, `09876543210` or `+91 98765 43210`.

Security built in: codes are 6 digits, valid 10 minutes, stored only as a
keyed hash, max 5 wrong attempts, one send per 30 seconds, and dev-mode
codes are only shown to requests from the same computer.

## Deploy

**Recommended: Vercel (site) + Render (API + Postgres)**
1. Render → New → Blueprint → this repo (uses `render.yaml`). Fill in
   `VIDEO_ADMIN_EMAIL`, `OWNER_PHONE_NUMBER` and your email/SMS keys.
2. Vercel → Project → Settings → Environment Variables:
   `BACKEND_URL=https://<your-render-service>.onrender.com`, then redeploy.
3. Open `https://<site>/api/health` – it should return `"status": "ok"`.

**Alternative: one VPS** – copy `deploy/.env.example` to `deploy/.env`, fill it
in, then `docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d --build`.

## Tests

```
cd backend && pip install -r requirements-dev.txt && pytest -q
cd frontend && npx vite build
```
GitHub Actions runs both on every push (`.github/workflows/ci.yml`).

## Adding a new OTP provider

Add a branch in `backend/app/delivery/email.py` or `sms.py` (`provider()`,
`configured()`, `send()`), document its env keys in `backend/.env.example`,
and add a test in `backend/tests/`. Nothing else needs to change.
