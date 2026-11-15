# Setting up Email, SMS and WhatsApp codes

The website already sends sign-in and password-reset codes. Each channel only
needs a provider account and its keys. Until a channel is set up, local
development shows codes in the backend window (and your ntfy app); production
never does.

Keys are entered with the setup script (`python -m app.configure_otp`, run in
`backend`) or added to the private settings file
`%LOCALAPPDATA%\GratiaEstates\backend.env` (on a server: the server's
environment). **Never paste keys into chat, code or `.env.example`.**

| Channel | Recommended provider | Typical time to go live | Code status |
|---|---|---|---|
| Email | Amazon SES (via SMTP) | 1–2 days (production access review) | Ready (SMTP adapter) |
| SMS | Fast2SMS → MSG91 for scale | Same day (Fast2SMS) / 3–10 days (DLT) | Ready (Fast2SMS, MSG91, Twilio) |
| WhatsApp | Meta WhatsApp Cloud API | 1–7 days (business + template approval) | Ready (Cloud API adapter) |

---

## 1. Email codes with Amazon SES

SES offers an SMTP interface, so it plugs into the existing email sender.

1. **AWS Console → Amazon SES.** Choose region **Asia Pacific (Mumbai) ap-south-1**.
2. **Identities → Create identity → Domain → `gratiaestates.com`.** Keep *Easy DKIM* (RSA 2048).
3. SES shows **3 CNAME records** (DKIM). In **GoDaddy → My Products → DNS** for
   gratiaestates.com, add each one exactly. These are *new* records: they don't
   change the website the domain currently shows.
4. Add (or update) these TXT records in GoDaddy:
   - SPF, host `@`: `v=spf1 include:amazonses.com ~all`
     (if an SPF record already exists, add `include:amazonses.com` to it; only one SPF record is allowed)
   - DMARC, host `_dmarc`: `v=DMARC1; p=none; rua=mailto:purwarmanish@gmail.com`
5. Wait until SES shows the identity as **Verified** (usually under an hour).
6. **Sandbox:** new accounts can only email verified addresses. Under
   **Account dashboard → Request production access**, describe the use:
   "transactional one-time verification codes for staff and customers of
   gratiaestates.com, low volume, no marketing". Approval usually takes about a day.
7. **SMTP settings → Create SMTP credentials.** This creates a restricted IAM user
   and shows an SMTP username and password **once**.
8. On this computer, in `backend`, run `python -m app.configure_otp`, choose
   email, and enter:
   - SMTP host: `email-smtp.ap-south-1.amazonaws.com`, port `587`
   - Username and password: from step 7
   - From address: e.g. `Gratia Real Estate <no-reply@gratiaestates.com>`

   The script logs in to check the details before saving them.
9. Restart the backend, choose **Email OTP** on the sign-in page, and confirm the code arrives.

Cost: about US$0.10 per 1,000 emails.

---

## 2. SMS codes in India

Indian regulations (TRAI **DLT**) require every business SMS to come from a
registered sender ID ("header") with a registered message template. An
international account (e.g. a Twilio trial) does **not** satisfy DLT by itself,
and messages to Indian numbers can be blocked or delayed without it.

### Option A: Fast2SMS (quickest)
Fast2SMS's **OTP route** uses its own DLT-registered template, so you don't
need your own DLT registration to start.
1. Sign up at fast2sms.com and complete the KYC / website verification they ask for.
2. Add a small balance (the OTP route is paid per SMS).
3. **Dev API → copy the API key.**
4. In `backend`, run `python -m app.configure_otp`, choose SMS → **1) Fast2SMS**,
   enter the owner's mobile number and paste the key (input is hidden).
   Answer **Y** to "Send a test SMS", and the phone should get a real SMS.
5. Restart the backend. **SMS OTP** codes now arrive as normal SMS; ntfy is no longer used for them.

### Option B: MSG91 with your own DLT registration (best for scale and branding)
1. Register the business as a **Principal Entity** on a DLT portal (e.g. Jio
   TrueConnect or Airtel DLT). This needs the business PAN/GST and an authorised
   letter, and takes 1–3 days.
2. Register a 6-letter **header**, e.g. `GRATIA`.
3. Register a **Service Implicit** content template, for example:
   `{#var#} is your Gratia Real Estate verification code. It expires in 10 minutes. Do not share it. - GRATIA`
4. In MSG91, add the DLT entity ID, header and template, and create a *Flow*/OTP
   template that maps the variable to `otp`.
5. Run `python -m app.configure_otp` → **2) MSG91** → Auth key, template ID, variable `otp`.

### Option C: Twilio (international numbers)
Use this for owners or staff with non-Indian numbers. Trial accounts can only
text numbers you have verified, and add a "Sent from your Twilio trial account" prefix.

---

## 3. WhatsApp codes (official WhatsApp Business Platform)

Only the official Cloud API is used. No personal WhatsApp, WhatsApp Web
automation or unofficial tools.

1. **business.facebook.com → create/open the Business portfolio** for Gratia Real Estate.
2. **Business settings → Security centre → Start verification.** Upload
   business documents (GST/registration certificate, matching name and address).
3. **developers.facebook.com → Create app → Business → add the WhatsApp product.**
   This creates a WhatsApp Business Account (WABA).
4. **WhatsApp → API setup → Add phone number.** Use a number that is **not**
   active on the WhatsApp or WhatsApp Business apps (or delete WhatsApp from it
   first). Verify it by SMS or voice, and set the display name "Gratia Real Estate"
   (Meta reviews display names).
5. **WhatsApp Manager → Message templates → Create template → Category:
   Authentication.** Choose **Copy code** button, language English, and name it e.g.
   `gratia_login_code`. Authentication templates use Meta's fixed wording
   ("*{{1}} is your verification code.*"), with optional "Do not share" and expiry lines.
   Submit and wait for **Approved**.
6. **Business settings → Users → System users → Add (Admin)** → assign the app and
   the WABA → **Generate token** with `whatsapp_business_messaging` and
   `whatsapp_business_management`, expiry **Never**.
7. Copy the **Phone number ID** (API setup page). Then add these values to the private
   settings file (or the server's environment):

   ```
   WHATSAPP_PHONE_NUMBER_ID=<phone number ID>
   WHATSAPP_ACCESS_TOKEN=<system user token>
   WHATSAPP_OTP_TEMPLATE=gratia_login_code
   WHATSAPP_TEMPLATE_LANG=en
   ```
8. Restart the backend. **WhatsApp OTP** appears on the sign-in page; send a code to the owner's number.

Pricing: Meta charges per delivered authentication message, at a rate that depends
on the country (India has its own rate). Check Meta's current pricing page. Some
countries restrict authentication templates for international senders; check
Meta's documentation if staff use non-Indian numbers.

If WhatsApp delivery fails, the website does **not** automatically send an SMS
instead. The person chooses another channel on the sign-in page.

**Not built yet: delivery-status webhooks.** They need the backend at a public HTTPS
address (the GoDaddy VPS). Once it's live, set the webhook URL to
`https://<api-domain>/api/v1/verification/webhooks/whatsapp`.

---

## What only you can do

- [ ] AWS account, SES domain verification (GoDaddy DNS), production access request
- [ ] Fast2SMS signup, KYC and balance (or DLT registration for MSG91)
- [ ] Meta business verification, WhatsApp number, approved authentication template, system user token
- [ ] Run `python -m app.configure_otp` (email/SMS) and add the WhatsApp values privately
