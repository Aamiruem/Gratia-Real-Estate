import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Briefcase, Building, CalendarCheck, LineChart, PhoneCall, Store, Warehouse } from "lucide-react";
import SEO from "../components/SEO";
import PageHero from "../components/PageHero";
import ProjectCard from "../components/ProjectCard";
import { JsonLd } from "../components/blog";
import { openLeadDialog } from "../components/LeadDialog";
import { projects } from "../data/projects";
import { usePropertiesVersion } from "../data/liveProperties";
import { isCommercial } from "../utils/propertySearch";
import { SITE_URL } from "../config/site";

const SEGMENTS = [
  { Icon: Building, title: "Office spaces", text: "Pre-leased and vacant office floors in Gurgaon's business districts." },
  { Icon: Store, title: "Retail & SCO", text: "High-street shops and shop-cum-office (SCO) units along busy corridors." },
  { Icon: Warehouse, title: "Other commercial assets", text: "Larger commercial and mixed-use opportunities, shared on request." },
  { Icon: LineChart, title: "Investment advice", text: "Rental yield, lease terms and exit options explained before you invest." },
];

export default function Commercial() {
  const version = usePropertiesVersion();
  const listings = useMemo(() => projects.filter(isCommercial), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <SEO
        title="Commercial Property in Gurgaon | Offices, Retail & SCO | Gratia Estates"
        description="Looking for commercial property in Gurgaon (Gurugram)? Gratia Estates helps investors and businesses find office spaces, retail and SCO units, and commercial investment opportunities."
        path="/commercial"
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Commercial", item: `${SITE_URL}/commercial` },
          ],
        }}
      />
      <PageHero
        crumb="Commercial"
        eyebrow="Offices, retail & investment"
        title="Commercial properties"
        text="Office spaces, retail units and commercial investments in Gurgaon. Tell us your budget and purpose, and we'll shortlist options that fit."
        aside={
          <div className="rounded-3xl bg-[#142536] p-6 text-white">
            <Briefcase size={26} className="text-[#e1c98f]" aria-hidden="true" />
            <p className="mt-4 font-display text-2xl font-bold !text-white">Get commercial options</p>
            <p className="mt-2 text-sm text-white/80">Many commercial deals are not publicly listed. Share your requirement for a curated shortlist.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => openLeadDialog({ kind: "consultation", service: "Commercial property" })}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#c9a45c] px-4 py-3 text-xs font-bold uppercase tracking-[.1em] text-[#142536] hover:bg-white"
              >
                <CalendarCheck size={15} aria-hidden="true" /> Consultation
              </button>
              <button
                type="button"
                onClick={() => openLeadDialog({ kind: "callback" })}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/40 px-4 py-3 text-xs font-bold uppercase tracking-[.1em] text-white hover:bg-white hover:text-[#142536]"
              >
                <PhoneCall size={15} aria-hidden="true" /> Callback
              </button>
            </div>
          </div>
        }
      />

      <section className="py-12 sm:py-16">
        <div className="container-luxury">
          <h2 className="font-display text-3xl font-bold text-[#142536]">Current commercial listings</h2>
          {listings.length ? (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {listings.map((project) => (
                <ProjectCard key={project.slug} project={project} />
              ))}
            </div>
          ) : (
            <p className="mt-3 max-w-2xl rounded-2xl border border-dashed border-[#d9dce0] bg-white p-6 text-sm leading-6 text-[#4b5966]">
              There are no commercial projects listed on the website at the moment. Our advisors share current office,
              retail and SCO options directly. Request a consultation and we'll get back to you.
            </p>
          )}
        </div>
      </section>

      <section className="bg-[#f7f4ed] py-12 sm:py-16">
        <div className="container-luxury">
          <h2 className="font-display text-3xl font-bold text-[#142536]">What we help with</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SEGMENTS.map(({ Icon, title, text }) => (
              <li key={title} className="rounded-3xl border border-[#e7e2d8] bg-white p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-[#142536] text-[#e1c98f]">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold text-[#142536]">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#4b5966]">{text}</p>
              </li>
            ))}
          </ul>
          <Link to="/services" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[#142536] hover:text-[#80602b]">
            See all our services <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
