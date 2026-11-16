# Deploying Gratia Estates (Vercel + GoDaddy domain)

The site has two parts:

| Part | What it is | Recommended host |
|---|---|---|
| **Frontend** | React/Vite website, PWA, admin panel UI (`frontend/`) | **Vercel** |
| **Backend** | FastAPI API: leads, notifications, properties, analytics, auth (`backend/`) | **Render** (blueprint `render.yaml`) or any Python host |
| **Database** | PostgreSQL | Render PostgreSQL (paid plan), Neon, Supabase or **AWS RDS** |

The browser only ever calls `https://www.gratiaestates.com/api/...`; Vercel's
`api/proxy.js` forwards those calls to the backend. Same-origin calls mean
secure cookies and no CORS problems.

> Visitors never need to log in. Only `/admin` (team) and `/video-admin/login`
> (sign-in) are private, and both are excluded from search engines.

---

## 1. Database (PostgreSQL)

Pick one:

- **Render PostgreSQL**: created automatically by `render.yaml`. ⚠️ Render's *free*
  database expires after a trial period. Use a paid plan for production.
- **AWS RDS for PostgreSQL**: create a PostgreSQL 15+ instance, allow inbound
  5432 from your backend host, and copy the connection string.
- **Neon / Supabase**: create a project and copy the PostgreSQL connection string.

Set it as `DATABASE_URL` on the backend
(`postgresql://USER:PASSWORD@HOST:5432/DBNAME`, URL-encode special characters, `@` → `%40`).

Tables are created automatically on first start, and new columns are added
automatically on upgrades (`backend/app/migrate.py`). The original 8 listings are
copied into the `properties` table the first time.

### Backups

- Render paid / AWS RDS / Neon all offer automatic daily backups: turn them on.
- Manual backup any time:
  ```bash
  pg_dump "$DATABASE_URL" --no-owner --format=custom -f gratia-$(date +%F).dump
  # restore: pg_restore --no-owner -d "$NEW_DATABASE_URL" gratia-YYYY-MM-DD.dump
  ```
- Admin → Reports → *Export all leads (CSV / Excel)* is a quick extra copy of leads.

## 2. Backend on Render

1. Push this repository to GitHub.
2. Render → **New → Blueprint** → choose the repo. It reads `render.yaml`.
3. In the `gratia-api` service → **Environment**, fill the `sync: false` values:

| Variable | Value |
|---|---|
| `VIDEO_ADMIN_EMAIL` | the owner's email (owner sign-in) |
| `OWNER_PHONE_NUMBER` | owner mobile, `+91...` |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY`, `EMAIL_FROM` | email OTP delivery; `EMAIL_FROM` must use a verified sender domain |
| `SMS_PROVIDER` | `fast2sms` |
| `FAST2SMS_API_KEY` | SMS OTP delivery for Indian mobile numbers |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp Business API credentials |
| `WHATSAPP_OTP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` | approved authentication template name and exact language |
| `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID` | Instagram professional-account API token and account ID; keep both in backend secrets |
| `INSTAGRAM_API_HOST`, `INSTAGRAM_API_VERSION` | API host/version; current Unified Login defaults are `graph.facebook.com` and `v27.0` |
| `NTFY_TOPIC` | optional: phone alert for every new lead (ntfy app) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional: browser push. Generate with `cd backend && python -m app.push` |
| `OPENAI_API_KEY` | optional: AI chat assistant (OpenAI API key, billed per use) |
| `VERCEL_DEPLOY_HOOK_URL` | optional: rebuilds the sitemap when listings change (see step 3.5) |

`COOKIE_SECURE=true`, `OTP_CONSOLE_FALLBACK=false`, JWT secrets, `PUBLIC_SITE_URL` and `FRONTEND_ORIGINS` are set by the blueprint. Save the environment changes and redeploy the backend.

The Instagram feed requires an Instagram professional (business or creator)
account shared with a Meta app that has `instagram_basic` access. For Unified
Login, use the Instagram account ID returned by `/me/assigned_instagram_accounts`
and the app's business integration access token. Keep the token only in the
backend environment; never put it in frontend variables or source control. The
Videos page loads posts in pages and embeds Instagram's own video/Reel player.

4. Deploy, then open `https://<your-api>.onrender.com/health` → `{"status":"ok","database":"ok"}`.

## 3. Frontend on Vercel

1. Vercel → **Add New → Project** → import the repo.
2. **Root Directory:** `frontend`. Framework: Vite (detected). Build command and
   output come from `frontend/vercel.json`.
3. **Settings → Environment Variables** (Production):

| Variable | Value |
|---|---|
| `BACKEND_URL` | `https://<your-api>.onrender.com` (no trailing slash, no `/api`) |
| `SITE_URL` | `https://www.gratiaestates.com` |
| `VITE_GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` (see SEO_ANALYTICS_GUIDE.md) |

4. Deploy. Check `https://<project>.vercel.app/api/health`.
5. *(Optional)* **Settings → Git → Deploy Hooks** → create hook "properties" on
   branch `main` → copy the URL into the backend's `VERCEL_DEPLOY_HOOK_URL`.
   Publishing or editing a property in the admin panel then refreshes the sitemap.

## 4. GoDaddy domain → Vercel (DNS, HTTPS, www)

1. Vercel → Project → **Settings → Domains** → add `www.gratiaestates.com`
   and `gratiaestates.com`. Choose **redirect `gratiaestates.com` → `www.gratiaestates.com`** (308).
2. GoDaddy → **My Products → Domain → DNS → Manage DNS**. Use exactly the values
   Vercel shows on the Domains page; they are normally:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `76.76.21.21` | 600 |
| CNAME | `www` | `cname.vercel-dns.com` | 600 |

   Delete any old `A @` or `CNAME www` records (e.g. GoDaddy "Parked"/website
   builder records) and turn off GoDaddy domain forwarding.
3. Wait for DNS (minutes to a few hours). Vercel issues the **SSL certificate
   automatically**, and all `http://` requests are redirected to `https://`.
4. Keep any **MX** (email) and **TXT** (Google verification) records as they are.

Result: `http://gratiaestates.com`, `https://gratiaestates.com` and
`http://www.gratiaestates.com` all end at `https://www.gratiaestates.com`, the
canonical address used in the sitemap and `<link rel="canonical">`.

## 5. After going live

- [ ] `https://www.gratiaestates.com/api/health` → ok
- [ ] Sign in at `/video-admin/login` → lands on `/admin`
- [ ] Submit a test enquiry → it appears in Admin → Leads and in the bell
- [ ] `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, `/sw.js` load
- [ ] Install the app from Chrome/Edge (desktop + Android) and Safari (iPhone)
- [ ] Follow `docs/SEO_ANALYTICS_GUIDE.md` (Search Console + GA4)
- [ ] Run `docs/TESTING_CHECKLIST.md`

---

## Alternative A: GoDaddy shared hosting (cPanel)

Shared hosting can serve the **frontend only**; it can't run the Python backend.
Host the backend on Render (above) and give it its own subdomain.

1. Backend: Render → service → **Settings → Custom Domain** → `api.gratiaestates.com`.
   In GoDaddy DNS add `CNAME api → <your-api>.onrender.com`.
   Set backend env `FRONTEND_ORIGINS=https://www.gratiaestates.com,https://gratiaestates.com`.
2. Build locally:
   ```bash
   cd frontend
   set VITE_API_URL=https://api.gratiaestates.com   # PowerShell: $env:VITE_API_URL="..."
   set SITE_URL=https://www.gratiaestates.com
   npm ci && npm run build
   ```
3. cPanel → File Manager → upload the **contents** of `frontend/dist/` into `public_html/`.
4. Create `public_html/.htaccess`:
   ```apache
   RewriteEngine On
   # HTTPS and www
   RewriteCond %{HTTPS} off [OR]
   RewriteCond %{HTTP_HOST} !^www\. [NC]
   RewriteRule ^ https://www.gratiaestates.com%{REQUEST_URI} [L,R=301]
   # Single-page app: unknown paths -> index.html (files and folders served as is)
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule ^ /index.html [L]
   <Files "sw.js">
     Header set Cache-Control "no-cache"
   </Files>
   ```
5. cPanel → **SSL/TLS Status** → run AutoSSL for the domain.

## Alternative B: GoDaddy VPS (or any Linux server)

Everything (website, API, PostgreSQL, HTTPS) runs with Docker using
`docker-compose.prod.yml` and `frontend/Caddyfile`.

1. GoDaddy DNS: `A @ → <VPS IP>`, `A www → <VPS IP>`.
2. On the server: install Docker, clone the repo, copy `deploy/.env.example` to
   `deploy/.env` and fill it (domain, database password, owner email, keys).
3. `docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d --build`
4. Caddy obtains HTTPS certificates automatically and redirects HTTP → HTTPS.
5. Backups: add a daily cron job running the `pg_dump` command above against the
   database container, and copy the file off the server.

## Environment variable reference

- Backend: `backend/.env.example` (every variable is documented there).
- Frontend: `frontend/.env.example`.
- Never commit real `.env` files; set secrets in the hosting dashboards.
