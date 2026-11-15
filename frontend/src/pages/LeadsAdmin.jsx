import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarCheck,
  CalendarClock,
  Download,
  Inbox,
  Loader2,
  LockKeyhole,
  Mail,
  Megaphone,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  TrendingUp,
  UserRoundPlus,
} from "lucide-react";
import SEO from "../components/SEO";
import { toast } from "../components/Toaster";
import useOwner from "../hooks/useOwner";
import useNotifications from "../hooks/useNotifications";
import { leadsAdminApi } from "../services/leadsApi";
import { notificationsApi } from "../services/notificationsApi";
import { projects } from "../data/projects";
import { timeAgo } from "../utils/format";

const TABS = [
  { id: "enquiries", label: "Enquiries & leads", Icon: Inbox },
  { id: "appointments", label: "Property visits", Icon: CalendarCheck },
  { id: "", label: "All", Icon: UserRoundPlus },
];

const KIND_LABELS = {
  contact: "Contact form",
  visit: "Site visit",
  callback: "Callback",
  property_enquiry: "Property enquiry",
  consultation: "Consultation",
  whatsapp: "WhatsApp enquiry",
};

const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "lost"];
const VISIT_STATUSES = ["requested", "confirmed", "rescheduled", "completed", "cancelled", "no_show"];
const APPOINTMENT_KINDS = new Set(["visit", "consultation"]);

const STATUS_TONES = {
  new: "bg-sky-100 text-sky-800",
  requested: "bg-sky-100 text-sky-800",
  contacted: "bg-amber-100 text-amber-900",
  confirmed: "bg-emerald-100 text-emerald-800",
  rescheduled: "bg-amber-100 text-amber-900",
  qualified: "bg-violet-100 text-violet-800",
  converted: "bg-emerald-100 text-emerald-800",
  completed: "bg-emerald-100 text-emerald-800",
  lost: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-200 text-slate-700",
  no_show: "bg-rose-100 text-rose-800",
};

const label = (value) => value.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());
const formatDay = (iso) =>
  iso ? new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00`)) : "";
const whatsappLink = (phone, name) =>
  `https://api.whatsapp.com/send?phone=${phone.replace(/\D/g, "")}&text=${encodeURIComponent(`Hello ${name}, this is Gratia Estates regarding your enquiry.`)}`;

export default function LeadsAdmin() {
  const { checked, isOwner } = useOwner();
  if (!checked) {
    return (
      <div className="container-luxury flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-[#c9a45c]" size={32} aria-label="Checking access" />
      </div>
    );
  }
  if (!isOwner) {
    return (
      <section className="container-luxury flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <SEO title="Owner sign-in required | Gratia Estates" description="Private owner page." path="/admin/leads" noindex />
        <span className="grid size-14 place-items-center rounded-2xl bg-[#142536] text-[#e1c98f]">
          <LockKeyhole size={24} aria-hidden="true" />
        </span>
        <h1 className="mt-5 font-display text-3xl font-bold text-[#142536]">Owner sign-in required</h1>
        <p className="mt-2 max-w-md text-[#4b5966]">Leads and visit requests are private. Please sign in with the owner account.</p>
        <Link to="/video-admin/login" className="mt-6 rounded-full bg-[#142536] px-6 py-3 text-sm font-bold text-white hover:bg-[#c9a45c] hover:text-[#142536]">
          Sign in
        </Link>
      </section>
    );
  }
  return <Dashboard />;
}

function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusRef = searchParams.get("lead") || "";
  const [tab, setTab] = useState(focusRef ? "" : "enquiries");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState(focusRef);
  const [upcoming, setUpcoming] = useState(false);
  const [data, setData] = useState({ items: [], total: 0 });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { items: notificationItems } = useNotifications();
  const newestNotification = notificationItems.find((item) => item.source === "owner")?.id ?? 0;

  const load = useCallback(async () => {
    setError("");
    try {
      const [list, summary] = await Promise.all([
        leadsAdminApi.list({ kind: tab, status, q: query.trim(), upcoming: tab === "appointments" && upcoming, limit: 100 }),
        leadsAdminApi.stats(),
      ]);
      setData(list);
      setStats(summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, status, query, upcoming]);

  // Reload when filters change (search is debounced) and when a new lead arrives.
  useEffect(() => {
    const timer = window.setTimeout(load, query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query, newestNotification]);

  const statuses = tab === "appointments" ? VISIT_STATUSES : tab === "enquiries" ? LEAD_STATUSES : [...LEAD_STATUSES, ...VISIT_STATUSES.slice(1)];

  const updateLead = async (reference, changes) => {
    try {
      const updated = await leadsAdminApi.update(reference, changes);
      setData((current) => ({ ...current, items: current.items.map((item) => (item.reference === reference ? updated : item)) }));
      leadsAdminApi.stats().then(setStats, () => {});
      toast(changes.owner_notes !== undefined ? "Notes saved" : `Status changed to ${label(updated.status)}`);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const cards = stats
    ? [
        { label: "Total leads", value: stats.total, Icon: UserRoundPlus, tone: "bg-sky-100 text-sky-700" },
        { label: "Last 7 days", value: stats.last_7_days, Icon: TrendingUp, tone: "bg-emerald-100 text-emerald-700" },
        { label: "Awaiting reply", value: stats.new, Icon: Inbox, tone: "bg-amber-100 text-amber-800" },
        { label: "Visits today", value: stats.visits_today, Icon: CalendarClock, tone: "bg-violet-100 text-violet-700" },
        { label: "Upcoming visits", value: stats.upcoming_visits, Icon: CalendarCheck, tone: "bg-rose-100 text-rose-700" },
      ]
    : [];

  return (
    <>
      <SEO title="Leads dashboard | Gratia Estates" description="Private owner dashboard." path="/admin/leads" noindex />
      <section className="bg-[#f7f4ed] py-10 sm:py-12">
        <div className="container-luxury">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#80602b]">Owner dashboard</p>
              <h1 className="mt-2 font-display text-3xl font-bold text-[#142536] sm:text-4xl">Leads &amp; property visits</h1>
              <p className="mt-2 text-sm text-[#4b5966]">Every enquiry from the website, with a unique reference. New leads appear automatically.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-2 rounded-full border border-[#e7e2d8] bg-white px-4 py-2.5 text-xs font-bold text-[#142536] hover:border-[#c9a45c]"
              >
                <RefreshCw size={15} aria-hidden="true" /> Refresh
              </button>
              <a
                href={leadsAdminApi.exportUrl(tab)}
                className="inline-flex items-center gap-2 rounded-full bg-[#142536] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#c9a45c] hover:text-[#142536]"
              >
                <Download size={15} aria-hidden="true" /> Export CSV
              </a>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cards.map(({ label: name, value, Icon, tone }) => (
              <div key={name} className="rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-sm">
                <span className={`grid size-9 place-items-center rounded-xl ${tone}`}>
                  <Icon size={17} aria-hidden="true" />
                </span>
                <strong className="mt-3 block font-display text-2xl font-bold text-[#142536]">{value}</strong>
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#4b5966]">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-8 sm:py-10">
        <div className="container-luxury grid gap-8 xl:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lead type">
              {TABS.map(({ id, label: name, Icon }) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(id);
                    setStatus("");
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition ${tab === id ? "border-[#142536] bg-[#142536] text-white" : "border-[#e7e2d8] bg-white text-[#142536] hover:border-[#c9a45c]"}`}
                >
                  <Icon size={15} aria-hidden="true" /> {name}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="relative min-w-[220px] flex-1">
                <span className="sr-only">Search leads</span>
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5e6872]" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    if (focusRef) setSearchParams({}, { replace: true });
                  }}
                  placeholder="Search name, phone, reference, property…"
                  className="h-11 w-full rounded-full border border-[#d9dce0] bg-white pl-10 pr-4 text-sm text-[#142536] outline-none placeholder:text-[#68717a] focus:border-[#c9a45c] focus:ring-4 focus:ring-[#c9a45c]/10"
                />
              </label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label="Filter by status"
                className="h-11 rounded-full border border-[#d9dce0] bg-white px-4 text-sm font-semibold text-[#142536]"
              >
                <option value="">All statuses</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
              {tab === "appointments" && (
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#142536]">
                  <input type="checkbox" checked={upcoming} onChange={(event) => setUpcoming(event.target.checked)} className="size-4 accent-[#142536]" />
                  Upcoming only
                </label>
              )}
            </div>

            <p className="mt-4 text-xs font-semibold text-[#4b5966]">
              {loading ? "Loading…" : `${data.total} ${data.total === 1 ? "lead" : "leads"}`}
            </p>
            {error && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

            <ul className="mt-3 space-y-3">
              {data.items.map((lead) => (
                <LeadCard key={lead.reference} lead={lead} highlighted={lead.reference === focusRef} onUpdate={updateLead} />
              ))}
            </ul>
            {!loading && !data.items.length && !error && (
              <div className="mt-3 rounded-2xl border border-dashed border-[#d9d2c3] bg-white p-10 text-center">
                <Inbox size={28} className="mx-auto text-[#80602b]" aria-hidden="true" />
                <p className="mt-3 font-semibold text-[#142536]">No leads match these filters yet</p>
                <p className="mt-1 text-sm text-[#4b5966]">Enquiries from the website's forms will appear here.</p>
              </div>
            )}
          </div>

          <AnnounceForm />
        </div>
      </section>
    </>
  );
}

function LeadCard({ lead, highlighted, onUpdate }) {
  const [notes, setNotes] = useState(lead.owner_notes);
  const [showNotes, setShowNotes] = useState(Boolean(lead.owner_notes));
  const appointment = APPOINTMENT_KINDS.has(lead.kind);
  const statuses = appointment ? VISIT_STATUSES : LEAD_STATUSES;
  const details = [
    ["Property", lead.property_name],
    ["Location", lead.location],
    ["Budget", lead.budget],
    ["Type", lead.property_type],
    ["Visitors", lead.visitors],
    ["Contact via", lead.contact_method],
  ].filter(([, value]) => value);

  return (
    <li
      className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${highlighted ? "border-[#c9a45c] ring-4 ring-[#c9a45c]/20" : "border-[#e7e2d8]"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f3ead8] px-2.5 py-1 text-[11px] font-bold text-[#80602b]">{KIND_LABELS[lead.kind] ?? lead.kind}</span>
            <span className="font-mono text-xs font-semibold text-[#4b5966]">{lead.reference}</span>
            <span className="text-xs text-[#5e6872]">· {timeAgo(lead.created_at)}</span>
          </div>
          <h2 className="mt-2 font-display text-lg font-bold text-[#142536]">{lead.name}</h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 font-semibold text-[#142536] hover:text-[#80602b]">
              <Phone size={14} aria-hidden="true" /> {lead.phone}
            </a>
            <a href={whatsappLink(lead.phone, lead.name)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline">
              <MessageCircle size={14} aria-hidden="true" /> WhatsApp
            </a>
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 text-[#263746] hover:text-[#80602b]">
                <Mail size={14} aria-hidden="true" /> {lead.email}
              </a>
            )}
          </div>
        </div>
        <label className="shrink-0">
          <span className="sr-only">Status for {lead.reference}</span>
          <select
            value={lead.status}
            onChange={(event) => onUpdate(lead.reference, { status: event.target.value })}
            className={`rounded-full border-0 px-3 py-1.5 text-xs font-bold ${STATUS_TONES[lead.status] ?? "bg-slate-100"}`}
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(lead.visit_date || lead.visit_time) && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          <CalendarClock size={16} aria-hidden="true" />
          {appointment ? "Visit" : "Preferred"}: {formatDay(lead.visit_date)} {lead.visit_time ? `· ${lead.visit_time}` : ""}
        </p>
      )}

      {details.length > 0 && (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {details.map(([name, value]) => (
            <div key={name} className="flex gap-2">
              <dt className="shrink-0 text-[#5e6872]">{name}:</dt>
              <dd className="min-w-0 font-medium text-[#142536]">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {lead.message && <p className="mt-3 whitespace-pre-line rounded-xl bg-[#fbfaf7] px-3 py-2 text-sm leading-6 text-[#263746]">{lead.message}</p>}

      <div className="mt-3">
        {showNotes ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onUpdate(lead.reference, { owner_notes: notes });
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <label className="flex-1">
              <span className="sr-only">Private notes</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Private notes (only you can see these)"
                className="w-full rounded-xl border border-[#d9dce0] px-3 py-2 text-sm text-[#142536] outline-none focus:border-[#c9a45c]"
              />
            </label>
            <button type="submit" className="self-start rounded-full bg-[#142536] px-4 py-2 text-xs font-bold text-white hover:bg-[#c9a45c] hover:text-[#142536]">
              Save notes
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setShowNotes(true)} className="text-xs font-bold text-[#80602b] hover:underline">
            + Add private notes
          </button>
        )}
      </div>
    </li>
  );
}

function AnnounceForm() {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const project = useMemo(() => projects.find((p) => p.slug === slug), [slug]);

  const choose = (value) => {
    setSlug(value);
    const p = projects.find((item) => item.slug === value);
    if (p) {
      setTitle(`New property added: ${p.name}`);
      setBody(`${p.name} by ${p.developer} in ${p.location}. ${p.price}.`);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (title.trim().length < 3) return;
    setSending(true);
    try {
      await notificationsApi.announce({
        kind: project ? "property.added" : "announcement",
        title: title.trim(),
        body: body.trim(),
        link: project ? `/projects/${project.slug}` : null,
      });
      toast("Announcement published to all visitors");
      setSlug("");
      setTitle("");
      setBody("");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSending(false);
    }
  };

  const field = "w-full rounded-xl border border-[#d9dce0] bg-white px-3 py-2.5 text-sm text-[#142536] outline-none focus:border-[#c9a45c]";
  return (
    <aside className="h-fit rounded-3xl border border-[#e7e2d8] bg-[#fbfaf7] p-5 xl:sticky xl:top-28">
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-[#80602b]">
        <Megaphone size={14} aria-hidden="true" /> Notify visitors
      </p>
      <h2 className="mt-2 font-display text-xl font-bold text-[#142536]">Announce a new property</h2>
      <p className="mt-1 text-sm text-[#4b5966]">Appears in every visitor's notification bell (and as an alert for visitors who turned alerts on).</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-[#142536]">Property (optional)</span>
          <select value={slug} onChange={(event) => choose(event.target.value)} className={field}>
            <option value="">General announcement</option>
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-[#142536]">Title *</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} required minLength={3} className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-[#142536]">Message</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} rows={3} className={field} />
        </label>
        <button
          type="submit"
          disabled={sending || title.trim().length < 3}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#142536] px-4 py-3 text-xs font-bold text-white hover:bg-[#c9a45c] hover:text-[#142536] disabled:opacity-50"
        >
          {sending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Megaphone size={15} aria-hidden="true" />}
          Publish to visitors
        </button>
      </form>
    </aside>
  );
}
