import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, CalendarCheck, Home as HomeIcon, MapPin, PhoneCall } from "lucide-react";
import SEO from "../components/SEO";
import PageHero from "../components/PageHero";
import ProjectCard from "../components/ProjectCard";
import PropertySearch from "../components/PropertySearch";
import { JsonLd } from "../components/blog";
import { openLeadDialog } from "../components/LeadDialog";
import { projects } from "../data/projects";
import { usePropertiesVersion } from "../data/liveProperties";
import { isCommercial, matchesType } from "../utils/propertySearch";
import { SITE_URL } from "../config/site";

const FILTERS = [
  { id: "residential", label: "All homes" },
  { id: "apartment", label: "Apartments" },
  { id: "luxury", label: "Luxury" },
  { id: "villa", label: "Villas & floors" },
  { id: "plot", label: "Plots" },
];

export default function Residential() {
  const version = usePropertiesVersion();
  const [filter, setFilter] = useState("residential");
  const homes = useMemo(() => projects.filter((p) => !isCommercial(p)), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = homes.filter((p) => matchesType(p, filter));
  const sectors = new Set(homes.map((p) => p.location)).size;

  return (
    <>
      <SEO
        title="Residential Properties in Gurgaon | Apartments, Luxury Homes & Villas | Gratia Estates"
        description="Browse residential properties for sale in Gurgaon (Gurugram): new-launch, under-construction and ready-to-move apartments and luxury homes, with site visits arranged by Gratia Estates."
        path="/residential"
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Residential", item: `${SITE_URL}/residential` },
          ],
        }}
      />
      <PageHero
        crumb="Residential"
        eyebrow="Homes for sale in Gurgaon"
        title="Residential properties"
        text="Apartments, luxury residences and premium homes across Gurgaon's growth corridors. Compare stage, price and location, then visit with an advisor."
        aside={
          <div className="grid grid-cols-2 gap-3">
            {[
              { Icon: HomeIcon, value: homes.length, label: "Residential projects" },
              { Icon: MapPin, value: sectors, label: "Sectors" },
            ].map(({ Icon, value, label }) => (
              <div key={label} className="rounded-2xl border border-[#e7e2d8] bg-white p-5 text-center shadow-sm">
                <Icon size={22} className="mx-auto text-[#80602b]" aria-hidden="true" />
                <strong className="mt-2 block font-display text-3xl font-bold text-[#142536]">{value}</strong>
                <span className="text-[11px] font-bold uppercase tracking-[.14em] text-[#4b5966]">{label}</span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => openLeadDialog({ kind: "consultation", service: "Buying a home" })}
              className="col-span-2 flex items-center justify-between gap-3 rounded-2xl bg-[#142536] p-5 text-left text-white transition hover:bg-[#1f3a52]"
            >
              <span className="text-sm">
                Not sure where to start?
                <strong className="block text-[#e1c98f]">Book a free consultation</strong>
              </span>
              <CalendarCheck size={22} aria-hidden="true" />
            </button>
          </div>
        }
      />

      <section className="py-10 sm:py-14">
        <div className="container-luxury">
          <PropertySearch initial={{ type: "residential" }} compact />
          <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Home type">
            {FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[.1em] transition ${filter === id ? "border-[#142536] bg-[#142536] text-white" : "border-[#e7e2d8] bg-white text-[#142536] hover:border-[#c9a45c]"}`}
              >
                {label} ({homes.filter((p) => matchesType(p, id)).length})
              </button>
            ))}
          </div>

          {shown.length ? (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {shown.map((project) => (
                <ProjectCard key={project.slug} project={project} />
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-dashed border-[#d9dce0] bg-white px-6 py-14 text-center">
              <p className="font-semibold text-[#142536]">No listed projects of this type right now.</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#4b5966]">Tell us what you're looking for and an advisor will share suitable options.</p>
              <button
                type="button"
                onClick={() => openLeadDialog({ kind: "consultation", service: FILTERS.find((f) => f.id === filter)?.label })}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#142536] px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-white hover:bg-[#c9a45c] hover:text-[#142536]"
              >
                Ask an advisor <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="bg-[#f7f4ed] py-12 sm:py-16">
        <div className="container-luxury grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold text-[#142536]">Buying a home in Gurgaon</h2>
            <p className="mt-3 text-sm leading-7 text-[#4b5966] sm:text-base">
              Gurgaon offers new launches with flexible payment plans, under-construction projects at earlier-stage
              prices, and ready-to-move homes you can occupy straight away. We help you compare carpet area, all-in cost,
              possession timelines and HRERA registration before you commit.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/book-visit" className="inline-flex items-center gap-2 rounded-full bg-[#c9a45c] px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-[#142536] hover:bg-[#e1c98f]">
                <CalendarCheck size={15} aria-hidden="true" /> Book a site visit
              </Link>
              <button
                type="button"
                onClick={() => openLeadDialog({ kind: "callback" })}
                className="inline-flex items-center gap-2 rounded-full border border-[#142536] px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-[#142536] hover:bg-[#142536] hover:text-white"
              >
                <PhoneCall size={15} aria-hidden="true" /> Request a callback
              </button>
            </div>
          </div>
          <ul className="grid gap-3">
            {[
              ["Compare by stage", "/projects", "Pre-launch, launched, under development and ready to move."],
              ["Read buying guides", "/blog", "Costs, site-visit checklists and location insights."],
              ["Looking for an office or shop?", "/commercial", "See our commercial property services."],
            ].map(([title, to, text]) => (
              <li key={to}>
                <Link to={to} className="flex items-center gap-4 rounded-2xl border border-[#e7e2d8] bg-white p-4 transition hover:border-[#c9a45c]">
                  <Building2 size={20} className="shrink-0 text-[#80602b]" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[#142536]">{title}</span>
                    <span className="text-sm text-[#4b5966]">{text}</span>
                  </span>
                  <ArrowRight size={16} className="text-[#80602b]" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
