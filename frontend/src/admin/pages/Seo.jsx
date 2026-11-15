import { Link } from "react-router-dom";
import { CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";
import { Card, PageTitle } from "../ui";
import { projects } from "../../data/projects";
import { SITE_URL } from "../../config/site";

const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim();

export default function Seo() {
  const checks = [
    { ok: true, text: "XML sitemap is generated on every build", href: `${SITE_URL}/sitemap.xml` },
    { ok: true, text: "robots.txt allows search engines and hides private pages", href: `${SITE_URL}/robots.txt` },
    { ok: true, text: "Every page has its own title, description, canonical URL, Open Graph and Twitter tags" },
    { ok: true, text: "Structured data: RealEstateAgent, WebSite, BreadcrumbList, Service and property schema" },
    { ok: Boolean(GA_ID), text: GA_ID ? `Google Analytics 4 connected (${GA_ID})` : "Google Analytics 4 not connected: set VITE_GA_MEASUREMENT_ID in Vercel" },
    { ok: SITE_URL.includes("gratiaestates.com"), text: `Site address used in sitemap and canonical links: ${SITE_URL}` },
  ];
  const missing = projects.filter((p) => !p.description || p.description.length < 120 || !p.image);

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Search engines"
        title="SEO"
        text="Search setup status and quick links. Per-property SEO titles and descriptions are edited in Properties."
      />
      <Card title="Status">
        <ul className="space-y-2 text-sm">
          {checks.map(({ ok, text, href }) => (
            <li key={text} className="flex items-start gap-2">
              {ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" /> : <CircleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />}
              <span className="text-[#263746]">
                {text}{" "}
                {href && (
                  <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-[#80602b] hover:underline">
                    open
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Google tools">
          <ul className="space-y-2 text-sm">
            {[
              ["Google Search Console", "https://search.google.com/search-console"],
              ["Google Analytics 4", "https://analytics.google.com/"],
              ["Rich Results Test (structured data)", `https://search.google.com/test/rich-results?url=${encodeURIComponent(`${SITE_URL}/`)}`],
              ["PageSpeed Insights (Core Web Vitals)", `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`${SITE_URL}/`)}`],
              ["Google Business Profile", "https://business.google.com/"],
            ].map(([label, href]) => (
              <li key={label}>
                <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-[#142536] hover:text-[#80602b]">
                  <ExternalLink size={14} aria-hidden="true" /> {label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-[#5e6872]">Step-by-step setup is in docs/SEO_ANALYTICS_GUIDE.md in the project.</p>
        </Card>
        <Card title="Listings to improve">
          {missing.length ? (
            <ul className="space-y-1 text-sm">
              {missing.map((p) => (
                <li key={p.slug} className="text-[#263746]">
                  {p.name}: {!p.image ? "add a photo" : "write a longer, unique description (120+ characters)"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-800">All published listings have a photo and a full description.</p>
          )}
          <Link to="/admin/properties" className="mt-4 inline-block text-xs font-bold text-[#80602b]">
            Edit properties →
          </Link>
        </Card>
      </div>
    </div>
  );
}
