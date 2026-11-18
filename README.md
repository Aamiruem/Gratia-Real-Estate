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

**AI voice assistant and calls:** The public chat supports English/Hindi voice
input and spoken answers in browsers that provide Speech Recognition and
Speech Synthesis. Its verified, bilingual fallback works without an OpenAI key;
set `OPENAI_API_KEY` for natural-language answers using published listings. The
staff-only CRM assistant can read minimized lead/property summaries and propose
a follow-up; staff must confirm before it is saved.

To enable inbound and automated outbound Retell calls, set
`RETELL_API_KEY`, `RETELL_AGENT_ID`, `RETELL_PHONE_NUMBER` and
`OWNER_PHONE_NUMBER`; bind the Retell number to the inbound/outbound agent and
register `https://<site>/api/webhooks/retell` as the signed webhook URL. The
Render blueprint adds a billable Cron service that checks the durable call queue
every five minutes. It calls only after explicit, recorded consent, Monday–
Saturday between 10 AM and 7 PM IST, and honors the lead's requested morning,
afternoon or evening window. Jobs use Retell idempotency, retry transient
failures, recheck consent before dialing, and appear in CRM call history.
Configure the Retell credentials for both the API and Cron services in Render.

Use this behavior in the Retell agent prompt (the API supplies
`customer_name`, `property_name`, `lead_reference`, `published_properties`,
`business_hours`, `human_handoff_number` and `ai_disclosure` for outbound
calls): disclose that you are an AI, speak Hindi or English to match the
customer, answer only from the supplied published property facts, and never
guess prices or availability. During business hours, offer a warm transfer to
`human_handoff_number` when asked for a person; otherwise collect a callback
request. For inbound calls, keep the Retell knowledge base synchronized with
published listings and enable the same language, disclosure and handoff rules.
Never configure the agent to call a lead without recorded consent. Store
provider credentials in the hosting dashboard, never in source control.

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

## Leads, notifications and the installable app

**Leads.** Every website form (contact, site visit, callback, property enquiry,
consultation, WhatsApp popup) is saved through `POST /api/leads` with a unique
reference such as `GE-261115-7KQ2M`. Forms that continue to WhatsApp still open
it immediately; the lead is saved in parallel. The backend validates every
field, rejects invalid Indian mobile numbers, ignores bot-filled honeypot
fields, returns the earlier reference for repeat submissions within 30
minutes, and rate-limits each address and phone number.

**Owner dashboard.** Sign in as the owner, then open `/admin/leads`: filter and
search leads, track property visits (requested → confirmed → completed /
cancelled / no-show), add private notes, export CSV, and announce a new
property to all visitors.

**Notifications.** The bell in the header shows real events only: the owner
sees new enquiries, visit requests and callbacks; visitors see owner
announcements, newly added videos and confirmations of their own enquiries.
Updates arrive live (Server-Sent Events, with polling as a fallback). Browser
alerts are shown only after someone clicks *Turn on alerts* and allows them.
With `NTFY_TOPIC` set, each new lead also alerts the owner's phone.

**Testimonials and social links.** Add genuine client testimonials to
`frontend/src/data/testimonials.js` and profile URLs to `footerSocialLinks` in
`frontend/src/components/footer/footerData.js`; both stay hidden until filled.

**Installable app (PWA).** `public/manifest.webmanifest`, `public/sw.js` and
`public/offline.html` make the site installable on Android, iPhone/iPad,
Windows and macOS. The service worker is registered only in production builds
(`npm run build` + `npm run preview`, or the deployed site), never in `npm run dev`.

## Admin panel, analytics and deployment

**Admin panel** (`/admin`, private, not linked publicly, `noindex`): sign in at
`/video-admin/login`. Modules: Overview, Properties (add / edit / publish /
unpublish / feature / delete), Customers, Leads (status, assignment, notes,
follow-up timeline, CSV export), Follow-ups, Notifications (history and
announcements), Analytics & traffic sources, Enquiry reports, SEO, Users &
team, Settings. Roles: **owner** and **admin** manage everything; **agent**
works leads, customers and follow-ups. Team members sign in with an email code.

**Notifications** are saved in the PostgreSQL database: team notifications,
public announcements (new listing, price update, offer, availability) and each
visitor's own enquiry confirmations and status updates (tied to a random
device key). Optional browser push (VAPID keys) and owner phone alerts (ntfy).

**Analytics**: consent banner; GA4 (`VITE_GA_MEASUREMENT_ID`) and first-party
events load only after "Accept". No personal data is sent.

**AI chat assistant**: set `OPENAI_API_KEY` on the backend for natural-language
answers; otherwise the chat uses its built-in English/Hindi property answers.

Guides:
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Vercel + GoDaddy DNS, Render/AWS database, shared hosting, VPS
- [docs/SEO_ANALYTICS_GUIDE.md](docs/SEO_ANALYTICS_GUIDE.md): Search Console verification, sitemap, GA4
- [docs/TESTING_CHECKLIST.md](docs/TESTING_CHECKLIST.md): production testing checklist
