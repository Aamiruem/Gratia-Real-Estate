import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarCheck,
  Clock3,
  CornerDownLeft,
  FileText,
  Layers,
  MapPin,
  MessageCircle,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { projects } from "../data/projects";
import { posts } from "../data/blogs";
import { track } from "../analytics/analytics";
import { openLeadDialog } from "./LeadDialog";
import CallIcon from "./CallIcon";

const PAGES = [
  { title: "All properties", to: "/projects", keywords: "projects properties flats homes property list browse" },
  { title: "Residential properties", to: "/residential", keywords: "residential homes apartments flats villas luxury" },
  { title: "Commercial properties", to: "/commercial", keywords: "commercial office retail shop investment" },
  { title: "Our services", to: "/services", keywords: "services buy sell rent invest advisory consultation" },
  { title: "Book a site visit", to: "/book-visit", keywords: "book visit site schedule appointment tour" },
  { title: "Property videos", to: "/videos", keywords: "videos walkthrough tour youtube" },
  { title: "Blog & buying guides", to: "/blog", keywords: "blog guides articles insights tips" },
  { title: "Contact Gratia Estates", to: "/contact", keywords: "contact phone call whatsapp email office address" },
  { title: "About Gratia Estates", to: "/about", keywords: "about company team advisory gratia estates" },
];

const POPULAR = ["DLF", "Sobha", "Ready to Move", "Sector 76", "Dwarka Expressway", "Godrej"];
const STAGES = ["Ready to Move", "Launched", "Under Development", "Pre-Launch / New Launch"];
const RECENT_KEY = "gratia-recent-searches";
const GROUPS = [
  { id: "Projects", Icon: Building2 },
  { id: "Guides", Icon: BookOpen },
  { id: "Pages", Icon: FileText },
];

const normalise = (value) =>
  String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Built when the search opens, so listings loaded from the backend are included.
function buildIndex() {
  const entries = [
    ...projects.map((project) => ({
      group: "Projects",
      title: project.name,
      subtitle: [project.developer, project.location].filter(Boolean).join(" · "),
      status: project.status,
      meta: project.price,
      image: project.image,
      to: `/projects/${project.slug}`,
      primary: project.name,
      text: [project.developer, project.location, project.status, project.type, project.configuration, ...(project.highlights || [])].join(" "),
    })),
    ...posts.map((post) => ({
      group: "Guides",
      title: post.title,
      subtitle: post.excerpt,
      to: `/blog/${post.slug}`,
      primary: post.title,
      text: post.excerpt || "",
    })),
    ...PAGES.map((page) => ({ group: "Pages", title: page.title, to: page.to, primary: page.title, text: page.keywords })),
  ];
  entries.forEach((entry) => {
    entry.primaryNorm = normalise(entry.primary);
    entry.textNorm = normalise(entry.text);
  });
  return entries;
}

// Every word must appear; matches in the name and at word starts rank higher.
function search(index, query) {
  const words = normalise(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  return index
    .map((entry) => {
      let score = 0;
      for (const word of words) {
        const inName = entry.primaryNorm.indexOf(word);
        const inText = entry.textNorm.indexOf(word);
        if (inName === -1 && inText === -1) return null;
        if (inName !== -1) score += inName === 0 ? 6 : entry.primaryNorm[inName - 1] === " " ? 4 : 2;
        else score += entry.textNorm[inText - 1] === " " || inText === 0 ? 1.5 : 0.75;
      }
      return { ...entry, score: score + (entry.group === "Projects" ? 0.5 : 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

function Highlight({ text, query }) {
  const words = normalise(query).split(" ").filter((w) => w.length > 1);
  if (!words.length || !text) return text || null;
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return String(text)
    .split(pattern)
    .map((part, i) =>
      i % 2 ? (
        <mark key={i} className="rounded bg-[#f6e7c5] px-0.5 text-inherit">
          {part}
        </mark>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecent(query) {
  const value = query.trim();
  if (value.length < 2) return;
  try {
    const next = [value, ...loadRecent().filter((q) => q.toLowerCase() !== value.toLowerCase())].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: recent searches are only a convenience.
  }
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * variant="full" shows "Search  Ctrl K" (wide headers); "icon" is a round button.
 */
export default function SiteSearch({ className = "", variant = "icon" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("All");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const index = useMemo(() => (open ? buildIndex() : []), [open]);
  const allResults = useMemo(() => search(index, query), [index, query]);
  const counts = useMemo(
    () => Object.fromEntries(GROUPS.map(({ id }) => [id, allResults.filter((r) => r.group === id).length])),
    [allResults],
  );
  const results = useMemo(
    () => (scope === "All" ? allResults : allResults.filter((r) => r.group === scope)).slice(0, 12),
    [allResults, scope],
  );
  const featured = useMemo(() => (open ? projects.slice(0, 3) : []), [open]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => setActive(0), [query, scope]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setScope("All");
    setRecent(loadRecent());
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  // Keep the highlighted result visible while moving with the arrow keys.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = () => setOpen(false);

  const go = (to, label = query) => {
    if (!to) return;
    if (label.trim()) {
      saveRecent(label);
      track("search", { detail: label.trim().slice(0, 80) });
    }
    setOpen(false);
    navigate(to);
  };

  const seeAll = () => go(`/projects?q=${encodeURIComponent(query.trim())}#results`);

  const onInputKey = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results[active]) go(results[active].to);
      else if (query.trim()) seeAll();
    } else if (event.key === "Escape") {
      close();
    }
  };

  const clearRecent = () => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
    setRecent([]);
  };

  const hasQuery = Boolean(query.trim());
  let lastGroup = null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search projects and guides"
        title={`Search (${isMac() ? "⌘" : "Ctrl"} K)`}
        className={
          variant === "full"
            ? // Round icon button on narrower screens, "Search  Ctrl K" pill from 1440px.
              `group inline-flex size-11 items-center justify-center gap-2 rounded-full border border-[#e7e2d8] bg-white text-[13px] font-semibold text-[#263746] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c9a45c] hover:bg-[#fbf6ea] hover:text-[#142536] hover:shadow-md active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/25 min-[1440px]:w-auto min-[1440px]:bg-[#f8f6f1] min-[1440px]:pl-3.5 min-[1440px]:pr-2 min-[1440px]:hover:bg-white ${className}`
            : `group inline-flex size-11 items-center justify-center rounded-full border border-[#e7e2d8] bg-white text-[#263746] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c9a45c] hover:bg-[#fbf6ea] hover:text-[#80602b] hover:shadow-md active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/25 ${className}`
        }
      >
        <Search size={18} strokeWidth={2} aria-hidden="true" className="transition-transform duration-200 group-hover:scale-110" />
        {variant === "full" ? (
          <>
            <span className="sr-only min-[1440px]:not-sr-only">Search</span>
            <kbd className="hidden rounded-md border border-[#e2ddd2] bg-white px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[#5e6872] min-[1440px]:inline">
              {isMac() ? "⌘ K" : "Ctrl K"}
            </kbd>
          </>
        ) : (
          <span className="sr-only">Search</span>
        )}
      </button>

      {/* Rendered at the page level: inside the header (which uses backdrop-blur)
          a "fixed" overlay would only cover the header itself. */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-stretch justify-center bg-[#0b1621]/65 backdrop-blur-sm sm:items-start sm:px-4 sm:pt-[8vh]"
          onMouseDown={(event) => event.target === event.currentTarget && close()}
          role="dialog"
          aria-modal="true"
          aria-label="Search Gratia Estates"
        >
          <div className="toast-in flex w-full max-w-3xl flex-col overflow-hidden bg-white shadow-[0_40px_100px_rgba(0,0,0,.35)] sm:max-h-[80vh] sm:rounded-[28px]">
            {/* Search field */}
            <div className="flex items-center gap-3 border-b border-[#eee9df] px-4 sm:px-6">
              <Search size={22} className="shrink-0 text-[#9a7940]" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search projects, developers, sectors or guides…"
                aria-label="Search"
                aria-controls="site-search-results"
                aria-activedescendant={results[active] ? `search-result-${active}` : undefined}
                enterKeyHint="search"
                className="h-16 min-w-0 flex-1 bg-transparent text-base text-[#142536] outline-none placeholder:text-[#7d8790] focus-visible:outline-none sm:h-[72px] sm:text-lg"
              />
              {hasQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#5e6872] hover:bg-[#f4f0e7] hover:text-[#142536]"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={close}
                aria-label="Close search"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f4f0e7] text-[#4b5966] transition hover:bg-[#142536] hover:text-white"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Scope tabs */}
            {hasQuery && allResults.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto border-b border-[#f1ede4] px-4 py-2.5 sm:px-6" role="tablist" aria-label="Filter results">
                {["All", ...GROUPS.map((g) => g.id)].map((id) => {
                  const count = id === "All" ? allResults.length : counts[id];
                  if (id !== "All" && !count) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={scope === id}
                      onClick={() => setScope(id)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${scope === id ? "bg-[#142536] text-white" : "bg-[#f4f0e7] text-[#4b5966] hover:text-[#142536]"}`}
                    >
                      {id}
                      <span className={`rounded-full px-1.5 text-[10px] ${scope === id ? "bg-[#c9a45c] text-[#142536]" : "bg-white text-[#80602b]"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {!hasQuery ? (
                <div className="grid gap-6 p-4 sm:grid-cols-[1fr_1.15fr] sm:p-6">
                  <div className="space-y-6">
                    {recent.length > 0 && (
                      <section>
                        <div className="flex items-center justify-between">
                          <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-[#80602b]">
                            <Clock3 size={13} aria-hidden="true" /> Recent
                          </h3>
                          <button type="button" onClick={clearRecent} className="text-xs font-semibold text-[#5e6872] hover:text-[#142536]">
                            Clear
                          </button>
                        </div>
                        <ul className="mt-2 space-y-0.5">
                          {recent.map((item) => (
                            <li key={item}>
                              <button
                                type="button"
                                onClick={() => setQuery(item)}
                                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium text-[#263746] hover:bg-[#fbf6ea]"
                              >
                                <Clock3 size={14} className="text-[#9aa3ac]" aria-hidden="true" /> {item}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                    <section>
                      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-[#80602b]">
                        <TrendingUp size={13} aria-hidden="true" /> Popular searches
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {POPULAR.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setQuery(suggestion)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e2d8] bg-white px-3.5 py-1.5 text-sm font-medium text-[#263746] transition hover:border-[#c9a45c] hover:bg-[#fbf6ea]"
                          >
                            <Search size={13} className="text-[#9a7940]" aria-hidden="true" /> {suggestion}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section>
                      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-[#80602b]">
                        <Layers size={13} aria-hidden="true" /> Browse by stage
                      </h3>
                      <ul className="mt-2 grid grid-cols-2 gap-1.5">
                        {STAGES.map((stage) => (
                          <li key={stage}>
                            <button
                              type="button"
                              onClick={() => go(`/projects?stage=${encodeURIComponent(stage)}`, "")}
                              className="flex w-full items-center justify-between gap-2 rounded-xl bg-[#fbfaf7] px-3 py-2.5 text-left text-[13px] font-semibold text-[#142536] ring-1 ring-[#efebe3] transition hover:bg-[#fbf6ea] hover:ring-[#c9a45c]"
                            >
                              <span className="truncate">{stage}</span>
                              <span className="rounded-full bg-white px-1.5 text-[10px] text-[#80602b]">
                                {projects.filter((p) => p.status === stage).length}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  <div className="space-y-4">
                    <section>
                      <h3 className="text-[11px] font-bold uppercase tracking-[.16em] text-[#80602b]">Featured projects</h3>
                      <ul className="mt-2 space-y-1.5">
                        {featured.map((project) => (
                          <li key={project.slug}>
                            <button
                              type="button"
                              onClick={() => go(`/projects/${project.slug}`, "")}
                              className="group flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-[#fbf6ea]"
                            >
                              <img src={project.image} alt="" loading="lazy" className="h-14 w-20 shrink-0 rounded-xl object-cover" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-[#142536]">{project.name}</span>
                                <span className="flex items-center gap-1 truncate text-xs text-[#5e6872]">
                                  <MapPin size={11} aria-hidden="true" /> {project.location}
                                </span>
                                <span className="text-xs font-semibold text-[#80602b]">{project.price}</span>
                              </span>
                              <ArrowUpRight size={16} className="shrink-0 text-[#c4c9ce] group-hover:text-[#9a7940]" aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => go("/book-visit", "")}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-[#142536] px-3 py-3 text-xs font-bold text-white transition hover:bg-[#c9a45c] hover:text-[#142536]"
                      >
                        <CalendarCheck size={15} aria-hidden="true" /> Book a visit
                      </button>
                      <a
                        href="tel:+919109776155"
                        className="flex items-center justify-center gap-2 rounded-2xl bg-[#15803D] px-3 py-3 text-xs font-bold text-white transition hover:bg-[#166534]"
                      >
                        <CallIcon size={15} /> Call an advisor
                      </a>
                    </div>
                  </div>
                </div>
              ) : results.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#f4f0e7] text-[#9a7940]">
                    <Search size={20} aria-hidden="true" />
                  </span>
                  <p className="mt-3 font-display text-lg font-bold text-[#142536]">No matches for “{query.trim()}”</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-[#5e6872]">
                    Try a developer (DLF, Godrej), a sector number or a project stage, or ask an advisor. We often know of options that aren't listed.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        openLeadDialog({ kind: "consultation", service: `Looking for: ${query.trim()}` });
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-[#142536] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#c9a45c] hover:text-[#142536]"
                    >
                      <MessageCircle size={14} aria-hidden="true" /> Ask an advisor
                    </button>
                    <button type="button" onClick={() => go("/projects", "")} className="rounded-full border border-[#e7e2d8] px-4 py-2.5 text-xs font-bold text-[#142536] hover:border-[#c9a45c]">
                      Browse all properties
                    </button>
                  </div>
                </div>
              ) : (
                <ul id="site-search-results" role="listbox" className="p-2 sm:p-3">
                  {results.map((entry, i) => {
                    const selected = i === active;
                    const groupInfo = GROUPS.find((g) => g.id === entry.group);
                    const heading = scope === "All" && entry.group !== lastGroup ? entry.group : null;
                    lastGroup = entry.group;
                    return (
                      <Fragment key={entry.to}>
                        {heading && (
                          <li role="presentation" className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#80602b] first:pt-1">
                            {heading}
                          </li>
                        )}
                        <li id={`search-result-${i}`} role="option" aria-selected={selected} data-index={i}>
                          <button
                            type="button"
                            onMouseEnter={() => setActive(i)}
                            onClick={() => go(entry.to)}
                            className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition ${selected ? "bg-[#fbf6ea] ring-1 ring-[#ead9b4]" : "hover:bg-[#fbfaf7]"}`}
                          >
                            {entry.image ? (
                              <img src={entry.image} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded-xl object-cover" />
                            ) : (
                              <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${selected ? "bg-[#142536] text-[#e1c98f]" : "bg-[#f4f0e7] text-[#9a7940]"}`}>
                                <groupInfo.Icon size={18} aria-hidden="true" />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold text-[#142536]">
                                <Highlight text={entry.title} query={query} />
                              </span>
                              {entry.subtitle && (
                                <span className="mt-0.5 block truncate text-xs text-[#5e6872]">
                                  <Highlight text={entry.subtitle} query={query} />
                                </span>
                              )}
                              {entry.status && (
                                <span className="mt-1 inline-flex rounded-full bg-[#eef3f7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1f4a6e]">
                                  {entry.status}
                                </span>
                              )}
                            </span>
                            {entry.meta && <span className="hidden shrink-0 text-sm font-semibold text-[#142536] sm:block">{entry.meta}</span>}
                            {selected ? (
                              <CornerDownLeft size={15} className="shrink-0 text-[#9a7940]" aria-hidden="true" />
                            ) : (
                              <ArrowRight size={15} className="shrink-0 text-[#c4c9ce]" aria-hidden="true" />
                            )}
                          </button>
                        </li>
                      </Fragment>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer: keyboard help and a link to the full results */}
            <div className="flex items-center justify-between gap-3 border-t border-[#eee9df] bg-[#fbfaf7] px-4 py-3 sm:px-6">
              <div className="hidden items-center gap-4 text-[11px] text-[#5e6872] sm:flex">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-[#e2ddd2] bg-white px-1.5 font-sans">↑</kbd>
                  <kbd className="rounded border border-[#e2ddd2] bg-white px-1.5 font-sans">↓</kbd> navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-[#e2ddd2] bg-white px-1.5 font-sans">↵</kbd> open
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-[#e2ddd2] bg-white px-1.5 font-sans">esc</kbd> close
                </span>
              </div>
              {hasQuery && counts.Projects > 0 ? (
                <button type="button" onClick={seeAll} className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-[#142536] hover:text-[#80602b]">
                  See all {counts.Projects} matching {counts.Projects === 1 ? "property" : "properties"} <ArrowRight size={14} aria-hidden="true" />
                </button>
              ) : (
                <Link to="/projects" onClick={close} className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-[#142536] hover:text-[#80602b]">
                  Browse all properties <ArrowRight size={14} aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
