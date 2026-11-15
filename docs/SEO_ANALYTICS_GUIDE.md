# SEO, Google Search Console and Google Analytics 4

## What the website already does

- Unique title, description, canonical URL, Open Graph and Twitter Card tags on
  every page, both in the pre-rendered HTML (for crawlers and link previews)
  and after the page loads.
- `sitemap.xml` and `robots.txt` generated on every build
  (`frontend/scripts/seo-pages.mjs`). Private pages (`/admin`, `/video-admin`,
  `/notifications`, `/api/`) are disallowed and marked `noindex`.
- Structured data: `WebSite`, `RealEstateAgent` (organization, address, phone,
  areas served), `BreadcrumbList`, `Service` (Services page), `ApartmentComplex`
  (each property) and article data for blog posts.
- Descriptive URLs (`/projects/dlf-privana-north`, `/residential`, `/commercial`, `/services`).
- Per-property SEO title/description: Admin → Properties → Edit.
- Performance: code splitting, lazy images, cached assets, installable PWA.

> No one can guarantee a first-page or #1 ranking on Google. Branded searches
> ("Gratia Estates") usually rank quickly once the site is verified and indexed;
> competitive terms ("flats in Gurgaon") need months of useful content, reviews
> and links. Never add fake reviews, fake listings or copy-paste location pages.

## 1. Google Search Console (do this first)

### Verify the domain (DNS, recommended)
1. Open <https://search.google.com/search-console> → **Add property** → **Domain** →
   enter `gratiaestates.com`.
2. Google shows a TXT record like `google-site-verification=abc123...`. Copy it.
3. GoDaddy → **DNS → Manage DNS → Add New Record**:
   Type **TXT**, Name **@**, Value = the copied text, TTL 1 hour → Save.
4. Back in Search Console click **Verify** (DNS can take up to a few hours; retry if needed).
   A Domain property covers `https`, `http`, `www` and non-www together.

### Submit the sitemap
1. Search Console → **Sitemaps** → enter `https://www.gratiaestates.com/sitemap.xml` → **Submit**.
2. Status should become *Success* with the number of discovered URLs.

### Ask Google to index key pages (URL inspection)
1. Paste a URL (e.g. `https://www.gratiaestates.com/`) into the top search bar.
2. **Test live URL** → if "URL is available to Google", click **Request indexing**.
3. Repeat for `/projects`, `/residential`, `/commercial`, `/services`, `/contact`
   and new property pages.

### Monitor (weekly)
| Report | What to look for |
|---|---|
| **Performance → Search results** | Clicks, impressions, CTR, average position; **Queries** tab shows searches that bring visitors (filter "gratia" for branded searches) |
| **Pages (Indexing)** | "Not indexed" reasons: fix 404s, "Duplicate without canonical", "Crawled – currently not indexed" (improve content) |
| **Core Web Vitals** | LCP / INP / CLS on mobile and desktop |
| **HTTPS** and **Enhancements → Breadcrumbs** | Errors in structured data |
| **Mobile usability** (via Lighthouse / URL inspection) | Text too small, tap targets |

Link Search Console to GA4: GA4 → Admin → **Product links → Search Console links**.

## 2. Google Analytics 4

1. <https://analytics.google.com> → **Admin → Create → Property** "Gratia Estates",
   time zone India, currency INR.
2. **Data streams → Web** → URL `https://www.gratiaestates.com` → copy the
   **Measurement ID** (`G-XXXXXXXXXX`).
3. Vercel → Project → Settings → Environment Variables:
   `VITE_GA_MEASUREMENT_ID = G-XXXXXXXXXX` → **Redeploy**.
4. Open the site, click **Accept** in the cookie banner, and check GA4 → **Reports → Realtime**.

### Events the site sends (only after the visitor accepts cookies)

| Event | When |
|---|---|
| `page_view` | Every page (with page path; query strings are removed) |
| `property_view` | A property page is opened (`property_slug`) |
| `search` | Property search (location / budget / type / BHK, never free text with numbers) |
| `enquiry_click` | An enquiry/callback/consultation button is clicked |
| `generate_lead` | A form is submitted successfully |
| `whatsapp_click`, `call_click`, `email_click` | Contact links |
| `share` | Website or property shared (method) |
| `install_click`, `app_install` | Install App button / app installed |
| `notification_optin` | Visitor turned on alerts |

Mark as **key events (conversions)**: GA4 → Admin → **Events** → toggle *Mark as key event*
for `generate_lead`, `whatsapp_click`, `call_click`.

Traffic sources (organic, direct, social, referral) appear in **Reports →
Acquisition → Traffic acquisition**. The admin panel's *Analytics & traffic*
page shows the same kinds of numbers from the website's own database.

### Privacy
- GA4 loads **only after consent**; Google advertising features are disabled.
- No names, phone numbers, emails or form contents are sent to Google.
- Visitors can change their choice via **Cookie settings** in the footer.

### Google Tag Manager?
Not needed: GA4 is built in. If you later add GTM, load it inside
`loadGoogleAnalytics()` in `frontend/src/analytics/analytics.js` so it also waits for consent.

## 3. Local SEO

1. **Google Business Profile** (<https://business.google.com>): create or claim
   "Gratia Estates" with the same name, address (Iworkk Coworking Office Space,
   90 IDC, Gurgaon), phone (+91 91097 76155) and website as on the site (NAP consistency).
   Category: *Real estate consultant*. Add photos and opening hours.
2. Paste the profile link in Admin → Settings → *Google Business Profile*: it
   appears in the footer.
3. Ask real clients for Google reviews; never write or buy reviews.
4. Add genuine testimonials (with permission) in `frontend/src/data/testimonials.js`.
5. Location pages: only create a page for a sector or corridor when you can write
   genuinely useful, unique content (listings there, connectivity, price ranges
   from your own experience). Thin duplicate pages hurt rankings.

## 4. Content that helps rankings
- Keep each property's description unique and complete (Admin → SEO lists gaps).
- Publish blog guides regularly (buying costs, sector comparisons, site-visit tips).
- Link between related pages (property ↔ sector guide ↔ services).
