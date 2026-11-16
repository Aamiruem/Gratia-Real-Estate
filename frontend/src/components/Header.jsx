import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowUpRight, Building2, CalendarCheck, ChevronDown, Clapperboard, ContactRound, Home, LogIn, Menu, Search, UserPlus, UserRound, UsersRound, X } from "lucide-react";
import Logo from "./Logo";
import SiteSearch from "./SiteSearch";
import NotificationBell from "./notifications/NotificationBell";
import InstallAppButton from "./InstallAppButton";
import useSiteSettings from "../hooks/useSiteSettings";
import useOwner from "../hooks/useOwner";
import { projects } from "../data/projects";
import { usePropertiesVersion } from "../data/liveProperties";

const FEATURED_PROJECTS = ["Roots Courtyard", "Bestech"];

/** Keep the header focused on the brand and a single menu trigger. */
export default function Header({ menuOpen, onMenuOpen }) {
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const propertiesMenuRef = useRef(null);
  const accountMenuRef = useRef(null);
  const { pathname } = useLocation();
  const { user } = useOwner();
  usePropertiesVersion();

  useEffect(() => {
    setPropertiesOpen(false);
    setProjectSearch("");
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!propertiesOpen) return undefined;
    const onPointer = (event) => {
      if (!propertiesMenuRef.current?.contains(event.target)) setPropertiesOpen(false);
    };
    const onKey = (event) => event.key === "Escape" && setPropertiesOpen(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [propertiesOpen]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const onPointer = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) setAccountOpen(false);
    };
    const onKey = (event) => event.key === "Escape" && setAccountOpen(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  const searchTerm = projectSearch.trim().toLowerCase();
  const filteredProjects = searchTerm
    ? sortedProjects.filter((project) =>
        [project.name, project.developer, project.location, project.status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchTerm),
      )
    : sortedProjects;
  const featuredProjectLinks = FEATURED_PROJECTS.map((name) => {
    const project = sortedProjects.find((item) => item.name.toLowerCase().includes(name.toLowerCase()));
    return {
      name,
      to: project ? `/projects/${project.slug}` : `/projects?q=${encodeURIComponent(name)}#results`,
    };
  });

  return (
    <>
      <AnnouncementBar />
      <header className="sticky top-0 z-50 w-full">
        <div className="border-b border-[#e7e2d8] bg-white/95 shadow-[0_8px_30px_rgba(20,37,54,0.08)] backdrop-blur-xl">
          <div className="container-luxury flex h-[76px] items-center gap-2">
            <Link to="/" className="flex shrink-0 items-center" aria-label="Gratia Estates home">
              <Logo className="h-[50px] text-[18px] transition-transform duration-200 hover:scale-[1.02] sm:text-[20px]" />
            </Link>

            <button
              type="button"
              onClick={onMenuOpen}
              aria-label="Open site menu"
              aria-expanded={menuOpen}
              aria-controls="site-side-menu"
              className={`ml-3 grid size-11 shrink-0 place-items-center rounded-full border shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/30 ${
                menuOpen
                  ? "border-[#142536] bg-[#142536] text-[#e1c98f]"
                  : "border-[#c9a45c]/70 bg-[#fbf6ea] text-[#142536] hover:border-[#c9a45c] hover:bg-[#f3ead8]"
              }`}
            >
              <Menu size={21} aria-hidden="true" />
            </button>

            <nav className="ml-1 hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `group inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold tracking-[-.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/20 ${
                    isActive
                      ? "bg-[#f3ead8] text-[#142536] shadow-sm ring-1 ring-inset ring-[#c9a45c]/30"
                      : "text-[#263746] hover:bg-[#fbf6ea] hover:text-[#142536]"
                  }`
                }
              >
                <Home size={18} strokeWidth={2} aria-hidden="true" className="text-[#80602b] transition-transform duration-200 group-hover:scale-110" />
                Home
              </NavLink>
              <div
                ref={propertiesMenuRef}
                className="relative"
                onMouseEnter={() => setPropertiesOpen(true)}
                onMouseLeave={() => setPropertiesOpen(false)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setPropertiesOpen(false);
                }}
              >
                <button
                  type="button"
                  onClick={() => setPropertiesOpen(true)}
                  onFocus={() => setPropertiesOpen(true)}
                  aria-expanded={propertiesOpen}
                  aria-controls="header-properties-menu"
                  className={`group inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold tracking-[-.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/20 ${
                    pathname.startsWith("/projects") || propertiesOpen
                      ? "bg-[#f3ead8] text-[#142536] shadow-sm ring-1 ring-inset ring-[#c9a45c]/30"
                      : "text-[#263746] hover:bg-[#fbf6ea] hover:text-[#142536]"
                  }`}
                >
                  <Building2 size={18} strokeWidth={2} aria-hidden="true" className="text-[#80602b] transition-transform duration-200 group-hover:scale-110" />
                  Properties
                  <ChevronDown size={15} aria-hidden="true" className={`text-[#80602b] transition-transform duration-200 ${propertiesOpen ? "rotate-180" : ""}`} />
                </button>
                {propertiesOpen && (
                  <div
                    id="header-properties-menu"
                    className="absolute left-0 top-full z-[70] w-[min(360px,calc(100vw-32px))] pt-2"
                  >
                    <div className="overflow-hidden rounded-2xl border border-[#e7e2d8] bg-white shadow-[0_24px_60px_rgba(13,27,42,.24)] ring-1 ring-black/[.03]">
                      <Link
                        to="/projects"
                        onClick={() => setPropertiesOpen(false)}
                        className="group flex items-center justify-between border-b border-[#efebe3] bg-gradient-to-r from-[#fbfaf7] to-white px-4 py-3.5 text-sm font-bold text-[#142536] transition-colors hover:from-[#f8f2e5] hover:to-[#fffdf8]"
                      >
                        <span>
                          <span className="block">All Gurgaon &amp; NCR projects</span>
                          <span className="mt-0.5 block text-[11px] font-medium text-[#68717a]">Explore verified project listings</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3ead8] px-2.5 py-1 text-xs font-bold text-[#80602b]">
                          {projects.length}
                          <ArrowUpRight size={14} aria-hidden="true" className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </span>
                      </Link>
                      <div className="border-b border-[#efebe3] px-3 py-2">
                        <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#80602b]">Popular projects</p>
                        <div className="flex flex-wrap gap-1.5">
                          {featuredProjectLinks.map(({ name, to }) => (
                            <Link
                              key={name}
                              to={to}
                              onClick={() => setPropertiesOpen(false)}
                              className="rounded-full border border-[#e7e2d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#142536] shadow-sm transition hover:-translate-y-0.5 hover:border-[#c9a45c] hover:bg-[#fbf6ea] hover:text-[#80602b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a45c]/60"
                            >
                              {name}
                            </Link>
                          ))}
                        </div>
                      </div>
                      <div className="border-b border-[#efebe3] px-3 py-3">
                        <label htmlFor="header-project-search" className="sr-only">
                          Search projects by name, location, developer, or status
                        </label>
                        <div className="flex h-10 items-center gap-2 rounded-xl border border-[#e7e2d8] bg-[#fbfaf7] px-3 text-[#80602b] transition focus-within:border-[#c9a45c] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#c9a45c]/15">
                          <Search size={16} aria-hidden="true" className="shrink-0" />
                          <input
                            id="header-project-search"
                            type="text"
                            value={projectSearch}
                            onChange={(event) => setProjectSearch(event.target.value)}
                            placeholder="Search projects or locations"
                            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[#142536] outline-none placeholder:font-normal placeholder:text-[#8b9299]"
                          />
                          {projectSearch && (
                            <button
                              type="button"
                              onClick={() => setProjectSearch("")}
                              aria-label="Clear project search"
                              className="grid size-6 shrink-0 place-items-center rounded-full text-[#68717a] transition hover:bg-[#f3ead8] hover:text-[#142536]"
                            >
                              <X size={14} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        <p className="mt-2 px-1 text-[10px] font-medium text-[#8b9299]" aria-live="polite">
                          {searchTerm
                            ? `${filteredProjects.length} matching ${filteredProjects.length === 1 ? "project" : "projects"}`
                            : `${projects.length} projects available`}
                        </p>
                      </div>
                      <ul className="max-h-[min(42vh,340px)] overflow-y-auto overscroll-contain p-2">
                        {filteredProjects.map((project) => (
                          <li key={project.slug}>
                            <Link
                              to={`/projects/${project.slug}`}
                              onClick={() => setPropertiesOpen(false)}
                              className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[#fbf6ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a45c]/70"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-[#142536] transition-colors group-hover:text-[#80602b]">
                                  {project.name}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-[#68717a]">{project.location}</span>
                              </span>
                              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-[#80602b] opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
                                <ArrowUpRight size={15} aria-hidden="true" />
                              </span>
                            </Link>
                          </li>
                        ))}
                        {filteredProjects.length === 0 && (
                          <li className="px-3 py-6 text-center">
                            <p className="text-sm font-semibold text-[#142536]">No matching projects</p>
                            <p className="mt-1 text-xs text-[#68717a]">Try a project name, developer, or sector.</p>
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              <NavLink
                to="/videos"
                className={({ isActive }) =>
                  `group hidden h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold tracking-[-.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/20 xl:inline-flex ${
                    isActive
                      ? "bg-[#f3ead8] text-[#142536] shadow-sm ring-1 ring-inset ring-[#c9a45c]/30"
                      : "text-[#263746] hover:bg-[#fbf6ea] hover:text-[#142536]"
                  }`
                }
              >
                <Clapperboard size={18} strokeWidth={2} aria-hidden="true" className="text-[#80602b] transition-transform duration-200 group-hover:scale-110" />
                Videos
              </NavLink>
              <NavLink
                to="/about"
                className={({ isActive }) =>
                  `group hidden h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold tracking-[-.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/20 xl:inline-flex ${
                    isActive
                      ? "bg-[#f3ead8] text-[#142536] shadow-sm ring-1 ring-inset ring-[#c9a45c]/30"
                      : "text-[#263746] hover:bg-[#fbf6ea] hover:text-[#142536]"
                  }`
                }
              >
                <UsersRound size={18} strokeWidth={2} aria-hidden="true" className="text-[#80602b] transition-transform duration-200 group-hover:scale-110" />
                About
              </NavLink>
              <NavLink
                to="/contact"
                className={({ isActive }) =>
                  `group hidden h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold tracking-[-.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/20 xl:inline-flex ${
                    isActive
                      ? "bg-[#f3ead8] text-[#142536] shadow-sm ring-1 ring-inset ring-[#c9a45c]/30"
                      : "text-[#263746] hover:bg-[#fbf6ea] hover:text-[#142536]"
                  }`
                }
              >
                <ContactRound size={18} strokeWidth={2} aria-hidden="true" className="text-[#80602b] transition-transform duration-200 group-hover:scale-110" />
                Contact
              </NavLink>
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <SiteSearch variant="full" />
              <NotificationBell />
              <InstallAppButton variant="navbar" />
              <div ref={accountMenuRef} className="relative hidden lg:block">
                <button
                  type="button"
                  onClick={() => setAccountOpen((open) => !open)}
                  aria-label={user?.role === "user" ? "Open account menu" : "Open login and sign up menu"}
                  title={user?.role === "user" ? "Account" : "Login / Sign up"}
                  aria-expanded={accountOpen}
                  aria-controls="header-account-menu"
                  className={`inline-flex size-11 items-center justify-center rounded-full border shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/30 ${
                    accountOpen
                      ? "border-[#142536] bg-[#142536] text-[#e1c98f]"
                      : "border-[#c9a45c]/60 bg-[#fbf6ea] text-[#142536] hover:border-[#c9a45c] hover:bg-[#f3ead8]"
                  }`}
                >
                  <UserRound size={18} strokeWidth={2} aria-hidden="true" className={accountOpen ? "text-[#e1c98f]" : "text-[#80602b]"} />
                </button>
                {accountOpen && (
                  <div
                    id="header-account-menu"
                    className="absolute right-0 top-full z-[70] w-56 pt-2"
                  >
                    <div className="overflow-hidden rounded-2xl border border-[#e7e2d8] bg-white p-2 shadow-[0_20px_50px_rgba(13,27,42,.2)]">
                      <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#80602b]">
                        {user?.role === "user" ? "Your account" : "Customer access"}
                      </p>
                      {user?.role === "user" ? (
                        <Link
                          to="/account"
                          onClick={() => setAccountOpen(false)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#142536] transition-colors hover:bg-[#f3ead8]"
                        >
                          <UserRound size={17} aria-hidden="true" className="text-[#80602b]" />
                          My account
                        </Link>
                      ) : (
                        <>
                          <Link
                            to="/account?mode=login"
                            onClick={() => setAccountOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#142536] transition-colors hover:bg-[#f3ead8]"
                          >
                            <LogIn size={17} aria-hidden="true" className="text-[#80602b]" />
                            Log in
                          </Link>
                          <Link
                            to="/account?mode=signup"
                            onClick={() => setAccountOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#142536] transition-colors hover:bg-[#f3ead8]"
                          >
                            <UserPlus size={17} aria-hidden="true" className="text-[#80602b]" />
                            Sign up
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Link
                to="/book-visit"
                className="hidden h-11 items-center gap-2 whitespace-nowrap rounded-full bg-[#c9a45c] px-4 text-sm font-bold tracking-[-.01em] text-[#142536] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#e1c98f] hover:shadow-md active:translate-y-0 active:scale-[.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/30 lg:inline-flex"
              >
                <CalendarCheck size={18} strokeWidth={2} aria-hidden="true" />
                Book a visit
              </Link>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

// Optional one-line message set in Admin → Settings.
function AnnouncementBar() {
  const settings = useSiteSettings();
  const text = settings?.announcement_bar?.trim();
  if (!text) return null;
  return (
    <div className="bg-[#142536] px-4 py-2 text-center text-xs font-semibold text-[#e1c98f] sm:text-sm" role="note">
      {text}
    </div>
  );
}
