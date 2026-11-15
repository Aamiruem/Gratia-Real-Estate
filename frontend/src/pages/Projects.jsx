import {
  ArrowRight,
  Building2,
  CalendarCheck,
  FileCheck2,
  Landmark,
  MapPin,
  Scale,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import CallIcon from "../components/CallIcon";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import PageHero from "../components/PageHero";
import ProjectCard from "../components/ProjectCard";
import RecommendedProjects from "../components/RecommendedProjects";
import SEO from "../components/SEO";
import { projects } from "../data/projects";
import { usePropertiesVersion } from "../data/liveProperties";
import PropertySearch from "../components/PropertySearch";
import { openLeadDialog } from "../components/LeadDialog";
import { BUDGET_RANGES, CONFIGURATIONS, PROPERTY_TYPES, filterProjects } from "../utils/propertySearch";

const filters = [
  "All",
  "Pre-Launch / New Launch",
  "Launched",
  "Ready to Move",
  "Under Development",
];



const buyingTips = [
  {
    icon: Wallet,
    title: "Fix your all-in budget",
    text: "Include stamp duty, registration, GST and other charges, not just the headline price.",
  },
  {
    icon: FileCheck2,
    title: "Check HRERA registration",
    text: "Confirm the project's registration and approvals before paying any booking amount.",
  },
  {
    icon: Scale,
    title: "Compare like for like",
    text: "Compare carpet area, possession timeline and payment plans across your shortlist.",
  },
];

export default function Projects() {
  // ?stage=... (used by the home page stage cards) preselects a filter.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStage = searchParams.get("stage");
  // ?location=&budget=&type=&q= come from the home page property search.
  const search = {
    location: searchParams.get("location") || "",
    budget: searchParams.get("budget") || "",
    type: searchParams.get("type") || "",
    config: searchParams.get("config") || "",
    q: searchParams.get("q") || "",
  };
  const searchKey = `${search.location}|${search.budget}|${search.type}|${search.config}|${search.q}`;
  const liveVersion = usePropertiesVersion();
  const developerCount = new Set(projects.map((p) => p.developer)).size;
  const sectorCount = new Set(projects.map((p) => p.location)).size;
  const searched = useMemo(() => filterProjects(projects, search), [searchKey, liveVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeChips = [
    search.location && { key: "location", label: search.location },
    search.budget && { key: "budget", label: BUDGET_RANGES.find((r) => r.id === search.budget)?.label ?? search.budget },
    search.type && { key: "type", label: PROPERTY_TYPES.find((t) => t.id === search.type)?.label ?? search.type },
    search.config && { key: "config", label: CONFIGURATIONS.find((c) => c.id === search.config)?.label ?? search.config },
    search.q && { key: "q", label: `“${search.q}”` },
  ].filter(Boolean);
  const clearSearch = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key) next.delete(key);
    else ["location", "budget", "type", "config", "q"].forEach((name) => next.delete(name));
    setSearchParams(next, { replace: true });
  };
  const [filter, setFilter] = useState(
    filters.includes(requestedStage) ? requestedStage : "All",
  );
  // Searches from the home page link to #results: show the matches directly.
  const location = useLocation();
  useEffect(() => {
    if (location.hash === "#results") {
      document.getElementById("results")?.scrollIntoView({ block: "start" });
    }
  }, [location.key, location.hash]);
  // Follow ?stage= changes too (e.g. picking a stage from the nav dropdown
  // while already on this page).
  useEffect(() => {
    setFilter(filters.includes(requestedStage) ? requestedStage : "All");
  }, [requestedStage]);
  const filtered = useMemo(
    () =>
      filter === "All" ? searched : searched.filter((p) => p.status === filter),
    [filter, searched],
  );
  const countFor = (f) =>
    f === "All" ? searched.length : searched.filter((p) => p.status === f).length;

  return (
    <>
      <SEO
        title="Gurgaon Property Projects | New Launch & Ready-to-Move Flats | Gratia Estates"
        description="Browse curated residential projects in Gurgaon from DLF, SOBHA, Godrej, M3M and more, including pre-launch, launched, under-construction and ready-to-move homes."
        path="/projects"
      />
      <PageHero
        crumb="Projects"
        eyebrow="Curated residential projects"
        title="Gurgaon Projects"
        text="Explore selected new-launch, under-construction and ready-to-move homes across Gurgaon. Filter by project stage and open any project for highlights, amenities and location."
        aside={
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Building2, value: projects.length, label: "Projects" },
              { icon: Landmark, value: developerCount, label: "Developers" },
              { icon: MapPin, value: sectorCount, label: "Sectors" },
            ].map(({ icon: Icon, value, label }) => (
              <div
                key={label}
                className="rounded-2xl border border-[#e7e2d8] bg-white p-4 text-center shadow-sm sm:p-5"
              >
                <span className="mx-auto grid size-11 place-items-center rounded-xl bg-[#142536] text-[#e1c98f]">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <strong className="mt-3 block font-display text-3xl font-bold text-[#142536]">
                  {value}
                </strong>
                <span className="text-[11px] font-bold uppercase tracking-[.14em] text-[#80602b]">
                  {label}
                </span>
              </div>
            ))}
            <a
              href="tel:+919109776155"
              className="col-span-3 flex items-center justify-between gap-3 rounded-2xl bg-[#142536] p-4 text-white transition hover:bg-[#1f3a52] sm:p-5"
            >
              <span className="text-sm">
                Need help shortlisting?
                <strong className="block text-[#e1c98f]">
                  Call +91 91097 76155
                </strong>
              </span>
              <span className="grid size-11 place-items-center rounded-full bg-[#34C759] text-white">
                <CallIcon size={20} />
              </span>
            </a>
          </div>
        }
      />

      <section id="results" className="scroll-mt-24 py-12 sm:py-16">
        <div className="container-luxury">
          <PropertySearch key={searchKey} initial={search} className="mb-6" compact />
          {activeChips.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[.12em] text-[#4b5966]">
                {searched.length} {searched.length === 1 ? "match" : "matches"} for
              </span>
              {activeChips.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => clearSearch(key)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#142536] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#263f57]"
                  aria-label={`Remove filter ${label}`}
                >
                  {label} <X size={13} aria-hidden="true" />
                </button>
              ))}
              <button type="button" onClick={() => clearSearch()} className="text-xs font-bold text-[#80602b] hover:underline">
                Clear all
              </button>
            </div>
          )}
          <div className="mb-8 flex flex-wrap items-center gap-2">
            <SlidersHorizontal size={18} className="mr-2 text-[#9a7940]" aria-hidden="true" />
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[.12em] transition ${filter === f ? "border-[#142536] bg-[#142536] text-white" : "border-[#e7e2d8] bg-white text-[#142536] hover:border-[#c9a45c]"}`}
              >
                {f}
                <span
                  className={`rounded-full px-1.5 text-[10px] ${filter === f ? "bg-[#c9a45c] text-[#142536]" : "bg-[#f3ead8] text-[#80602b]"}`}
                >
                  {countFor(f)}
                </span>
              </button>
            ))}
          </div>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {filtered.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </div>
          {!filtered.length && (
            <div className="rounded-2xl border border-dashed border-[#d9dce0] bg-white px-6 py-14 text-center">
              <p className="font-semibold text-[#142536]">
                {search.type === "commercial"
                  ? "Commercial listings are shared on request."
                  : "No listed projects match these filters yet."}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#4b5966]">
                Our advisors often know of options that aren't listed here. Tell us what you need and we'll send matching properties.
              </p>
              <button
                type="button"
                onClick={() =>
                  openLeadDialog({
                    kind: "consultation",
                    service: [search.type && PROPERTY_TYPES.find((t) => t.id === search.type)?.label, search.location, search.budget && BUDGET_RANGES.find((r) => r.id === search.budget)?.label]
                      .filter(Boolean)
                      .join(", ") || "Help finding a property",
                  })
                }
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#142536] px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-white hover:bg-[#c9a45c] hover:text-[#142536]"
              >
                Ask an advisor <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </section>

      <RecommendedProjects className="pb-12 sm:pb-16" />

      <section className="pb-12 sm:pb-16">
        <div className="container-luxury grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-[#e7e2d8] bg-white p-6 shadow-sm sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#80602b]">
              Before you shortlist
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-[#142536] sm:text-3xl">
              Three checks for every Gurgaon project
            </h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-3">
              {buyingTips.map(({ icon: Icon, title, text }) => (
                <li key={title} className="rounded-2xl bg-[#f7f4ed] p-5">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#c9a45c] text-[#142536]">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-[#142536]">
                    {title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[#5e6872]">{text}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative isolate flex flex-col justify-between overflow-hidden rounded-3xl border border-[#d9b873] bg-gradient-to-br from-[#f7ead0] via-[#efd9a8] to-[#e2c27f] p-6 text-[#142536] sm:p-8">
            <div
              className="pointer-events-none absolute -right-16 -top-16 -z-10 size-56 rounded-full bg-white/50 blur-3xl"
              aria-hidden="true"
            />
            <div>
              <span className="grid size-12 place-items-center rounded-2xl bg-[#142536] text-[#e1c98f]">
                <CalendarCheck size={22} aria-hidden="true" />
              </span>
              <h2 className="mt-5 font-display text-2xl font-semibold !text-[#142536] sm:text-3xl">
                Can't find the right fit?
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#142536]/75">
                Tell us your budget, preferred sector and timeline. We'll
                suggest relevant options and help arrange site visits.
              </p>
            </div>
            <Link
              to="/contact"
              className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-[#142536] px-6 py-3 text-xs font-bold uppercase tracking-[.12em] text-white transition hover:bg-white hover:text-[#142536]"
            >
              Share your requirement <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
