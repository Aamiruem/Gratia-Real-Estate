import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  FileCheck2,
  HandCoins,
  KeyRound,
  LineChart,
  MapPinned,
  PhoneCall,
  Warehouse,
} from "lucide-react";
import SEO from "../components/SEO";
import PageHero from "../components/PageHero";
import { JsonLd } from "../components/blog";
import { openLeadDialog } from "../components/LeadDialog";
import { SITE_URL } from "../config/site";

const SERVICES = [
  {
    id: "buy",
    Icon: KeyRound,
    title: "Buying a property",
    text: "From a shortlist that matches your budget and location to site visits, price comparisons and booking support.",
    points: ["Needs assessment and shortlist", "Side-by-side project comparison", "Site visits arranged", "Booking and documentation support"],
    action: { label: "Browse properties", to: "/projects" },
  },
  {
    id: "sell",
    Icon: HandCoins,
    title: "Selling a property",
    text: "Guidance on realistic pricing and presentation, and help reaching serious buyers for your Gurgaon property.",
    points: ["Pricing guidance", "Listing preparation", "Buyer outreach", "Negotiation support"],
    action: { label: "Talk about selling", service: "Selling a property" },
  },
  {
    id: "rent",
    Icon: Warehouse,
    title: "Renting & leasing",
    text: "Share your rental or leasing requirement, residential or commercial, and we'll share options where available.",
    points: ["Residential rentals", "Office and retail leasing", "Lease terms explained"],
    action: { label: "Share a rental requirement", service: "Renting / leasing" },
  },
  {
    id: "invest",
    Icon: LineChart,
    title: "Property investment",
    text: "Understand growth corridors, launch stages, rental potential and holding horizons before committing capital.",
    points: ["Corridor and micro-market insight", "Launch-stage strategy", "Residential and commercial options"],
    action: { label: "Plan an investment", service: "Investment advice" },
  },
  {
    id: "visits",
    Icon: MapPinned,
    title: "Site visits",
    text: "Pick a day and time; we coordinate visits across projects so you can see several in one trip.",
    points: ["Flexible slots", "Multiple projects per visit", "Advisor accompanies you"],
    action: { label: "Book a site visit", to: "/book-visit" },
  },
  {
    id: "checks",
    Icon: FileCheck2,
    title: "Due-diligence checks",
    text: "We help you check HRERA registration, approvals and the all-in cost before you pay a booking amount.",
    points: ["HRERA registration check", "All-in cost breakdown", "Payment-plan comparison"],
    action: { label: "Ask a question", service: "Due-diligence help" },
  },
];

export default function Services() {
  return (
    <>
      <SEO
        title="Real Estate Services in Gurgaon | Buy, Sell, Rent & Invest | Gratia Estates"
        description="Gratia Estates is a Gurgaon real estate consultant helping you buy, sell, rent and invest in residential and commercial property, with site visits and due-diligence support."
        path="/services"
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
                { "@type": "ListItem", position: 2, name: "Services", item: `${SITE_URL}/services` },
              ],
            },
            ...SERVICES.map((service) => ({
              "@type": "Service",
              name: service.title,
              description: service.text,
              areaServed: { "@type": "City", name: "Gurgaon" },
              provider: { "@id": `${SITE_URL}/#organization` },
            })),
          ],
        }}
      />
      <PageHero
        crumb="Services"
        eyebrow="How we help"
        title="Our real estate services"
        text="One Gurgaon-focused advisory for buying, selling, renting and investing in property, with honest guidance at every step."
        aside={
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => openLeadDialog({ kind: "consultation" })}
              className="flex items-center justify-between gap-3 rounded-2xl bg-[#142536] p-5 text-left text-white transition hover:bg-[#1f3a52]"
            >
              <span>
                <span className="block text-sm text-white/80">Free, no-obligation</span>
                <strong className="text-lg text-[#e1c98f]">Book a consultation</strong>
              </span>
              <CalendarCheck size={24} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => openLeadDialog({ kind: "callback" })}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[#e7e2d8] bg-white p-5 text-left transition hover:border-[#c9a45c]"
            >
              <span>
                <span className="block text-sm text-[#4b5966]">Prefer to talk?</span>
                <strong className="text-lg text-[#142536]">Request a callback</strong>
              </span>
              <PhoneCall size={22} className="text-[#80602b]" aria-hidden="true" />
            </button>
          </div>
        }
      />

      <section className="py-12 sm:py-16">
        <div className="container-luxury grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map(({ id, Icon, title, text, points, action }) => (
            <article key={id} id={id} className="flex scroll-mt-28 flex-col rounded-3xl border border-[#e7e2d8] bg-white p-6 shadow-sm sm:p-7">
              <span className="grid size-12 place-items-center rounded-2xl bg-[#142536] text-[#e1c98f]">
                <Icon size={22} aria-hidden="true" />
              </span>
              <h2 className="mt-5 font-display text-xl font-bold text-[#142536]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#4b5966]">{text}</p>
              <ul className="mt-4 space-y-2">
                {points.map((point) => (
                  <li key={point} className="flex items-center gap-2 text-sm font-semibold text-[#263746]">
                    <BadgeCheck size={16} className="shrink-0 text-emerald-600" aria-hidden="true" /> {point}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                {action.to ? (
                  <Link to={action.to} className="inline-flex items-center gap-2 text-sm font-bold text-[#142536] hover:text-[#80602b]">
                    {action.label} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => openLeadDialog({ kind: "consultation", service: action.service })}
                    className="inline-flex items-center gap-2 text-sm font-bold text-[#142536] hover:text-[#80602b]"
                  >
                    {action.label} <ArrowRight size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
