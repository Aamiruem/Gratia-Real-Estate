import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Building2, CalendarCheck, ChevronDown, ContactRound, Home, LogIn, Menu, UserPlus, UserRound, UsersRound } from "lucide-react";
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
  const [accountOpen, setAccountOpen] = useState(false);
  const propertiesMenuRef = useRef(null);
  const accountMenuRef = useRef(null);
  const { pathname } = useLocation();
  const { user } = useOwner();
  usePropertiesVersion();

  useEffect(() => {
    setPropertiesOpen(false);
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
              className="ml-3 grid size-11 shrink-0 place-items-center rounded-full border border-[#c9a45c] bg-[#fbf6ea] text-[#142536] shadow-sm transition hover:bg-[#f3ead8] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/30"
            >
              <Menu size={21} aria-hidden="true" />
            </button>

            <nav className="ml-1 hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold transition ${
                    isActive ? "bg-[#142536] text-white" : "text-[#142536] hover:bg-[#f3ead8]"
                  }`
                }
              >
                <Home size={17} aria-hidden="true" className="text-[#80602b]" />
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
                  className={`inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold transition ${
                    pathname.startsWith("/projects") ? "bg-[#142536] text-white" : "text-[#142536] hover:bg-[#f3ead8]"
                  }`}
                >
                  <Building2 size={17} aria-hidden="true" className={pathname.startsWith("/projects") ? "text-[#e1c98f]" : "text-[#80602b]"} />
                  Properties
                  <ChevronDown size={15} aria-hidden="true" className={`transition-transform ${propertiesOpen ? "rotate-180" : ""}`} />
                </button>
                {propertiesOpen && (
                  <div
                    id="header-properties-menu"
                    className="absolute left-0 top-full z-[70] w-[min(360px,calc(100vw-32px))] pt-2"
                  >
                    <div className="overflow-hidden rounded-2xl border border-[#e7e2d8] bg-white shadow-[0_20px_50px_rgba(13,27,42,.2)]">
                      <Link
                        to="/projects"
                        onClick={() => setPropertiesOpen(false)}
                        className="flex items-center justify-between border-b border-[#efebe3] bg-[#fbfaf7] px-4 py-3 text-sm font-bold text-[#142536] transition-colors hover:bg-[#f3ead8]"
                      >
                        All Gurgaon &amp; NCR projects
                        <span className="text-xs font-semibold text-[#80602b]">{projects.length}</span>
                      </Link>
                      <div className="border-b border-[#efebe3] px-3 py-2">
                        <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#80602b]">Popular projects</p>
                        <div className="flex flex-wrap gap-1.5">
                          {featuredProjectLinks.map(({ name, to }) => (
                            <Link
                              key={name}
                              to={to}
                              onClick={() => setPropertiesOpen(false)}
                              className="rounded-full border border-[#e7e2d8] px-3 py-1.5 text-xs font-semibold text-[#142536] transition-colors hover:border-[#c9a45c] hover:bg-[#f3ead8] hover:text-[#80602b]"
                            >
                              {name}
                            </Link>
                          ))}
                        </div>
                      </div>
                      <ul className="max-h-[min(55vh,400px)] overflow-y-auto p-2">
                        {sortedProjects.map((project) => (
                          <li key={project.slug}>
                          <Link
                            to={`/projects/${project.slug}`}
                            onClick={() => setPropertiesOpen(false)}
                            className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-[#f3ead8] hover:text-[#80602b]"
                          >
                            <span className="block text-sm font-semibold text-[#142536]">{project.name}</span>
                            <span className="mt-0.5 block text-xs text-[#68717a]">{project.location}</span>
                          </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              <NavLink
                to="/about"
                className={({ isActive }) =>
                  `hidden h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold transition xl:inline-flex ${
                    isActive ? "bg-[#142536] text-white" : "text-[#142536] hover:bg-[#f3ead8]"
                  }`
                }
              >
                <UsersRound size={17} aria-hidden="true" className="text-[#80602b]" />
                About
              </NavLink>
              <NavLink
                to="/contact"
                className={({ isActive }) =>
                  `hidden h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold transition xl:inline-flex ${
                    isActive ? "bg-[#142536] text-white" : "text-[#142536] hover:bg-[#f3ead8]"
                  }`
                }
              >
                <ContactRound size={17} aria-hidden="true" className="text-[#80602b]" />
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
                  className="inline-flex size-11 items-center justify-center rounded-full border border-[#c9a45c]/60 bg-[#fbf6ea] text-[#142536] shadow-sm transition hover:border-[#c9a45c] hover:bg-[#f3ead8] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/30"
                >
                  <UserRound size={17} aria-hidden="true" className="text-[#80602b]" />
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
                className="hidden h-11 items-center gap-2 whitespace-nowrap rounded-full bg-[#c9a45c] px-4 text-sm font-bold text-[#142536] transition hover:bg-[#e1c98f] lg:inline-flex"
              >
                <CalendarCheck size={17} aria-hidden="true" />
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
