import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarCheck,
  Clock3,
  Compass,
  HandCoins,
  Handshake,
  Home as HomeIcon,
  KeyRound,
  Landmark,
  LineChart,
  Mail,
  MapPin,
  MessageCircle,
  PhoneCall,
  Quote,
  Scale,
  ShieldCheck,
  Star,
} from "lucide-react";
import CallIcon from "../CallIcon";
import ProjectCard from "../ProjectCard";
import PropertySearch from "../PropertySearch";
import { openLeadDialog } from "../LeadDialog";
import { projects } from "../../data/projects";
import { testimonials } from "../../data/testimonials";
import { footerAddress, footerContactLinks } from "../footer/footerData";
import { whatsappUrl } from "../../utils/whatsapp";

const PHONE = footerContactLinks.find((link) => link.type === "phone");
const EMAIL = footerContactLinks.find((link) => link.type === "email");
const ADDRESS = `${footerAddress.lineOne} ${footerAddress.lineTwo}`;
const MAP_QUERY = "90 IDC Gurgaon Haryana";

function Heading({ id, eyebrow, title, text, center = false }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#80602b]">{eyebrow}</p>
      <h2 id={id} className="mt-3 font-display text-3xl font-bold leading-tight text-[#142536] sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-sm leading-7 text-[#4b5966] sm:text-base">{text}</p>}
    </div>
  );
}

/* ---------------- Search by location, budget and type ---------------- */
export function HomePropertySearch() {
  return (
    <section aria-labelledby="home-search-title" className="relative z-20 -mt-8 pb-4 sm:-mt-10">
      <div className="container-luxury">
        <h2 id="home-search-title" className="sr-only">
          Search properties by location, budget and type
        </h2>
        <PropertySearch />
      </div>
    </section>
  );
}

/* ---------------- Residential & commercial ---------------- */
export function PropertyCategories() {
  const residential = projects.filter((p) => /residential/i.test(p.type));
  const categories = [
    {
      title: "Residential properties",
      text: "Apartments, luxury residences and premium homes across Gurgaon's most sought-after sectors.",
      image: residential[1]?.image || projects[0]?.image,
      badge: `${residential.length} projects listed`,
      Icon: HomeIcon,
      action: { label: "Browse residential", to: "/projects?type=residential#results" },
    },
    {
      title: "Commercial properties",
      text: "Office spaces, retail and investment-grade commercial assets. Current options are shared on request.",
      image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80",
      badge: "Available on request",
      Icon: Briefcase,
      action: { label: "Ask for commercial options", onClick: () => openLeadDialog({ kind: "consultation", service: "Commercial property" }) },
    },
  ];

  return (
    <section className="py-14 sm:py-20" aria-labelledby="categories-title">
      <div className="container-luxury">
        <Heading id="categories-title" eyebrow="Property categories" title="Residential & commercial" text="Whether you're buying a home or an investment, start with the category that fits you." />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {categories.map(({ title, text, image, badge, Icon, action }) => (
            <article key={title} className="group relative isolate flex min-h-[340px] overflow-hidden rounded-3xl bg-[#142536] text-white shadow-luxury">
              <img
                src={image}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 -z-10 h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0d1b2a] via-[#0d1b2a]/60 to-transparent" />
              <div className="mt-auto p-6 sm:p-8">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.14em] backdrop-blur">
                  <Icon size={14} aria-hidden="true" /> {badge}
                </span>
                <h3 className="mt-4 font-display text-2xl font-bold !text-white sm:text-3xl">{title}</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-white/85">{text}</p>
                {action.to ? (
                  <Link to={action.to} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#c9a45c] px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-[#142536] transition hover:bg-white">
                    {action.label} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ) : (
                  <button type="button" onClick={action.onClick} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#c9a45c] px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-[#142536] transition hover:bg-white">
                    {action.label} <ArrowRight size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Buying, selling, investment ---------------- */
export function ServicesSection() {
  const services = [
    {
      Icon: KeyRound,
      title: "Buy a property",
      text: "Shortlist projects that match your budget and location, compare them side by side, and visit with an advisor.",
      points: ["Curated shortlists", "Site visits arranged", "Price & payment-plan comparison"],
      cta: { label: "Explore projects", to: "/projects" },
    },
    {
      Icon: HandCoins,
      title: "Sell a property",
      text: "Get guidance on pricing, presentation and finding the right buyer for your Gurgaon home.",
      points: ["Pricing guidance", "Buyer outreach", "Documentation support"],
      cta: { label: "Talk about selling", service: "Selling a property" },
    },
    {
      Icon: LineChart,
      title: "Invest in real estate",
      text: "Understand growth corridors, launch stages and holding horizons before you commit capital.",
      points: ["Corridor insights", "Launch-stage strategy", "Residential & commercial"],
      cta: { label: "Plan an investment", service: "Investment advice" },
    },
  ];

  return (
    <section className="bg-[#f7f4ed] py-14 sm:py-20" aria-labelledby="services-title">
      <div className="container-luxury">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <Heading id="services-title" eyebrow="Our services" title="Buying, selling & investment" text="One advisory team for every step of your property journey." />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openLeadDialog({ kind: "callback" })}
              className="inline-flex items-center gap-2 rounded-full border border-[#142536] bg-white px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-[#142536] transition hover:bg-[#142536] hover:text-white"
            >
              <PhoneCall size={15} aria-hidden="true" /> Request a callback
            </button>
            <button
              type="button"
              onClick={() => openLeadDialog({ kind: "consultation" })}
              className="inline-flex items-center gap-2 rounded-full bg-[#142536] px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-white transition hover:bg-[#c9a45c] hover:text-[#142536]"
            >
              <CalendarCheck size={15} aria-hidden="true" /> Book a consultation
            </button>
          </div>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {services.map(({ Icon, title, text, points, cta }) => (
            <article key={title} className="flex flex-col rounded-3xl border border-[#e7e2d8] bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-luxury sm:p-7">
              <span className="grid size-12 place-items-center rounded-2xl bg-[#142536] text-[#e1c98f]">
                <Icon size={22} aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-display text-xl font-bold text-[#142536]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#4b5966]">{text}</p>
              <ul className="mt-4 space-y-2">
                {points.map((point) => (
                  <li key={point} className="flex items-center gap-2 text-sm font-semibold text-[#263746]">
                    <BadgeCheck size={16} className="shrink-0 text-emerald-600" aria-hidden="true" /> {point}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                {cta.to ? (
                  <Link to={cta.to} className="inline-flex items-center gap-2 text-sm font-bold text-[#142536] hover:text-[#80602b]">
                    {cta.label} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => openLeadDialog({ kind: "consultation", service: cta.service })}
                    className="inline-flex items-center gap-2 text-sm font-bold text-[#142536] hover:text-[#80602b]"
                  >
                    {cta.label} <ArrowRight size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- New launches (latest listings) ---------------- */
export function NewLaunches() {
  const launches = projects.filter((p) => /launch/i.test(p.status)).slice(0, 4);
  if (!launches.length) return null;
  return (
    <section className="py-14 sm:py-20" aria-labelledby="launches-title">
      <div className="container-luxury">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <Heading id="launches-title" eyebrow="Latest listings" title="New & recent launches" text="Projects that are newly launched or about to launch: often the widest choice of units and payment plans." />
          <Link
            to={`/projects?stage=${encodeURIComponent("Launched")}`}
            className="inline-flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-[#142536] hover:text-[#80602b]"
          >
            All launches <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {launches.map((project) => (
            <ProjectCard key={project.slug} project={project} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Why choose Gratia Estates ---------------- */
export function WhyChooseUs() {
  const reasons = [
    { Icon: Compass, title: "Gurgaon specialists", text: "We focus on one market, so we know its sectors, corridors and developers in depth." },
    { Icon: Handshake, title: "One advisor, start to finish", text: "The same person guides you from first shortlist to site visit and paperwork." },
    { Icon: Scale, title: "Clear comparisons", text: "All-in costs, carpet areas, possession timelines and payment plans compared like for like." },
    { Icon: ShieldCheck, title: "Due-diligence first", text: "We help you check HRERA registration and approvals before any booking amount." },
    { Icon: CalendarCheck, title: "Site visits arranged", text: "Pick a day and time; we coordinate visits across projects to save you trips." },
    { Icon: Clock3, title: "Established in 2013", text: "Gratia Real Estates Advisory Private Limited was founded in Gurgaon in October 2013." },
  ];
  return (
    <section className="bg-[#142536] py-14 text-white sm:py-20" aria-labelledby="why-title">
      <div className="container-luxury">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#e1c98f]">Why choose us</p>
          <h2 id="why-title" className="mt-3 font-display text-3xl font-bold !text-white sm:text-4xl">
            Why choose Gratia Estates?
          </h2>
          <p className="mt-3 text-sm leading-7 text-white/80 sm:text-base">Focused, honest advice that puts your priorities first.</p>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reasons.map(({ Icon, title, text }) => (
            <li key={title} className="rounded-3xl border border-white/10 bg-white/[.04] p-6 transition hover:border-[#c9a45c]/50 hover:bg-white/[.07]">
              <span className="grid size-11 place-items-center rounded-xl bg-[#c9a45c] text-[#142536]">
                <Icon size={20} aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold !text-white">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-white/80">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- About ---------------- */
export function AboutSnapshot() {
  const image = projects[2]?.image || projects[0]?.image;
  return (
    <section className="py-14 sm:py-20" aria-labelledby="about-snapshot-title">
      <div className="container-luxury grid items-center gap-10 lg:grid-cols-2">
        <div className="relative">
          <img src={image} alt="A premium Gurgaon residential project" loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-luxury" />
          <div className="absolute -bottom-6 left-6 right-6 rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-luxury sm:left-auto sm:w-72">
            <p className="flex items-center gap-2 text-sm font-bold text-[#142536]">
              <Landmark size={18} className="text-[#80602b]" aria-hidden="true" /> Gratia Real Estates Advisory
            </p>
            <p className="mt-1 text-xs text-[#4b5966]">Private Limited · Gurgaon, Haryana · Est. 2013</p>
          </div>
        </div>
        <div className="pt-6 lg:pt-0">
          <Heading
            id="about-snapshot-title"
            eyebrow="About us"
            title="A Gurgaon-focused real estate advisory"
            text="Gratia Estates helps home buyers and investors compare new-launch, under-construction and ready-to-move projects with clarity. We listen first, shortlist carefully, and stay with you until you're confident in your decision."
          />
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { value: projects.length, label: "Projects listed" },
              { value: new Set(projects.map((p) => p.developer)).size, label: "Developers" },
              { value: new Set(projects.map((p) => p.location)).size, label: "Sectors" },
            ].map(({ value, label }) => (
              <div key={label} className="rounded-2xl bg-[#f7f4ed] p-4 text-center">
                <strong className="block font-display text-2xl font-bold text-[#142536]">{value}</strong>
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#4b5966]">{label}</span>
              </div>
            ))}
          </div>
          <Link to="/about" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#142536] px-6 py-3 text-xs font-bold uppercase tracking-[.1em] text-white transition hover:bg-[#c9a45c] hover:text-[#142536]">
            More about us <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Testimonials (only real ones from data/testimonials.js) ---------------- */
export function Testimonials() {
  if (!testimonials.length) return null;
  return (
    <section className="bg-[#f7f4ed] py-14 sm:py-20" aria-labelledby="testimonials-title">
      <div className="container-luxury">
        <Heading id="testimonials-title" center eyebrow="Client stories" title="What our clients say" />
        <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map(({ name, location, text, rating = 5 }) => (
            <li key={`${name}-${text.slice(0, 20)}`} className="flex flex-col rounded-3xl border border-[#e7e2d8] bg-white p-6 shadow-sm">
              <Quote size={26} className="text-[#c9a45c]" aria-hidden="true" />
              <p className="mt-3 flex-1 text-sm leading-7 text-[#263746]">{text}</p>
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#efebe3] pt-4">
                <div>
                  <p className="font-semibold text-[#142536]">{name}</p>
                  {location && <p className="text-xs text-[#4b5966]">{location}</p>}
                </div>
                <span className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} size={14} className={i < rating ? "fill-[#c9a45c] text-[#c9a45c]" : "text-[#d9d2c3]"} aria-hidden="true" />
                  ))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- Contact + Google Maps ---------------- */
export function ContactAndMap() {
  const rows = [
    { Icon: CallIcon, label: "Call", value: PHONE?.label, href: PHONE?.href, tone: "bg-[#15803D] text-white" },
    { Icon: MessageCircle, label: "WhatsApp", value: "Chat with an advisor", href: whatsappUrl("Hello Gratia Estates, I'd like help with a Gurgaon property."), tone: "bg-emerald-100 text-emerald-700", external: true },
    { Icon: Mail, label: "Email", value: EMAIL?.label, href: EMAIL?.href, tone: "bg-amber-100 text-amber-800" },
    { Icon: MapPin, label: "Office", value: ADDRESS, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MAP_QUERY)}`, tone: "bg-sky-100 text-sky-700", external: true },
  ];
  return (
    <section className="py-14 sm:py-20" aria-labelledby="home-contact-title">
      <div className="container-luxury grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
        <div>
          <Heading id="home-contact-title" eyebrow="Contact" title="Visit or reach us" text="Talk to an advisor by phone or WhatsApp, or drop by our Gurgaon office." />
          <ul className="mt-7 space-y-3">
            {rows.map(({ Icon, label, value, href, tone, external }) => (
              <li key={label}>
                <a
                  href={href}
                  {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="flex items-center gap-4 rounded-2xl border border-[#e7e2d8] bg-white p-3.5 transition hover:border-[#c9a45c] hover:shadow-sm"
                >
                  <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}>
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-[.14em] text-[#80602b]">{label}</span>
                    <span className="block break-words text-sm font-semibold text-[#142536]">{value}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Link to="/book-visit" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#c9a45c] px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-[#142536] hover:bg-[#e1c98f]">
              <CalendarCheck size={15} aria-hidden="true" /> Schedule a visit
            </Link>
            <Link to="/contact#enquiry-form" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#142536] px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-[#142536] hover:bg-[#142536] hover:text-white">
              <Building2 size={15} aria-hidden="true" /> Send an enquiry
            </Link>
          </div>
        </div>
        <div className="overflow-hidden rounded-3xl border border-[#e7e2d8] bg-[#f3f1ec] shadow-sm">
          <iframe
            title="Gratia Estates office location on Google Maps"
            src={`https://www.google.com/maps?q=${encodeURIComponent(MAP_QUERY)}&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-[360px] w-full border-0 lg:h-full lg:min-h-[460px]"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}
