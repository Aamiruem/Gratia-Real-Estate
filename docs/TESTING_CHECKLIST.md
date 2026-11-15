# Production testing checklist

Run after every deployment. ✅ = verified, note any issue with the page and device.

## Automated
- [ ] `cd backend && pytest -q` → all tests pass (leads, roles, notifications, analytics, properties, CSRF)
- [ ] `cd frontend && npm run build` → build succeeds, "SEO: wrote … page files" printed

## Navigation & pages (desktop + phone)
- [ ] Navbar: Home, About, Properties (dropdown), Residential, Commercial, Services, Contact, More (Videos, Blog, Install App, Share)
- [ ] Mobile menu opens/closes, every link works, no horizontal scrolling at 360–430 px
- [ ] Footer links incl. Privacy, Terms, Cookie Policy, Cookie settings; social icons (if set in Admin → Settings)
- [ ] 404 page for an unknown URL
- [ ] Every property card opens its page; images load

## Search
- [ ] Home search by location / budget / type / BHK → filtered Properties page with removable chips
- [ ] Header search (icon / Ctrl K) finds projects and articles

## Forms & leads (use your own phone number)
- [ ] Home popup → WhatsApp opens immediately, lead saved
- [ ] Contact form, Book a visit, project callback, Request a callback, Book a consultation, Enquire about property
- [ ] Invalid mobile (e.g. 12345) is rejected with a clear message
- [ ] Submitting the same form twice within 30 min returns the same reference (no duplicate)
- [ ] Confirmation with reference `GE-…` shown; same message appears in the visitor's bell (saved in the database)
- [ ] Phone/WhatsApp/email links open the right app

## Admin panel (`/video-admin/login` → `/admin`)
- [ ] Owner sign-in by email code (and mobile code if configured)
- [ ] Overview numbers match Leads
- [ ] Leads: status change, assign to team member, notes, follow-up with next date, CSV export opens in Excel
- [ ] Customer is notified in their bell when a visit is confirmed/rescheduled
- [ ] Follow-ups: overdue item appears and a "Follow-up due" notification arrives
- [ ] Properties: add (draft) → publish → edit price → offer → unpublish → delete; public site updates; visitors get "New property listed / Price update / New offer" notifications
- [ ] Users & team: add an agent → agent signs in → cannot open Properties editing, Team, Settings, SEO
- [ ] Settings: social links appear in footer; announcement bar shows; AI assistant toggle
- [ ] Signed-out visitor opening `/admin` is sent to sign-in; `/api/leads` returns 401

## Notifications
- [ ] Bell badge counts unread; mark one read; mark all read; delete; history page `/notifications`
- [ ] Owner sees new enquiry within seconds ("Live" indicator)
- [ ] "Turn on alerts" explains the benefit first; "Not now" stops asking; browser permission asked only after "Allow alerts"
- [ ] With VAPID keys set: alert arrives with the site closed (Chrome/Edge/Android; iPhone only when installed to Home Screen, iOS 16.4+)

## PWA
- [ ] Chrome/Edge desktop: Install App → installs; button hides inside the app
- [ ] Android Chrome: Install → home-screen icon, splash screen, standalone window
- [ ] iPhone/iPad Safari: Install App shows Add to Home Screen steps; installed app opens full-screen with splash
- [ ] macOS Safari 17+: instructions show File → Add to Dock
- [ ] Firefox desktop: instructions explain to use Chrome/Edge/Safari
- [ ] Offline: open a visited page with Wi-Fi off → it loads; unvisited page → offline page

## Sharing
- [ ] Phone: Share opens the native sheet
- [ ] Desktop: Copy link (toast "Link copied"), WhatsApp, Facebook, Telegram, Email
- [ ] Shared property link shows a preview (title, description, image): test in WhatsApp and <https://www.opengraph.xyz/>

## SEO & analytics
- [ ] `/sitemap.xml` lists home, main pages and every published property; `/robots.txt` disallows /admin
- [ ] View source of a property page: unique `<title>`, description, canonical, og:/twitter: tags
- [ ] Rich Results Test passes for home and a property page
- [ ] Cookie banner: Decline → no `gtag`/analytics requests; Accept → GA4 Realtime shows the visit
- [ ] Admin → Analytics shows visitors, sources and popular properties after a few visits

## Performance & compatibility
- [ ] PageSpeed Insights (mobile) for home and a property page: LCP < 2.5 s, CLS < 0.1
- [ ] Chrome, Edge, Firefox, Safari (macOS + iOS), Samsung Internet
- [ ] No errors in the browser console on main pages
- [ ] Keyboard: Tab through header, menus, dialogs (Esc closes), visible focus
