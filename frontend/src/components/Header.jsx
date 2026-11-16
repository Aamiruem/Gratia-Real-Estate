import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Building2, CalendarCheck, ChevronDown, Home, Menu, UserRound } from "lucide-react";
import Logo from "./Logo";
import SiteSearch from "./SiteSearch";
import NotificationBell from "./notifications/NotificationBell";
import InstallAppButton from "./InstallAppButton";
import useSiteSettings from "../hooks/useSiteSettings";
import useOwner from "../hooks/useOwner";
import { projects } from "../data/projects";
import { usePropertiesVersion } from "../data/liveProperties";

/** Keep the header focused on the brand and a single menu trigger. */
export default function Header({ menuOpen, onMenuOpen }) {
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const propertiesMenuRef = useRef(null);
  const { pathname } = useLocation();
  const { user } = useOwner();
  usePropertiesVersion();

  useEffect(() => setPropertiesOpen(false), [pathname]);

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

  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));

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
              className="grid size-11 shrink-0 place-items-center rounded-full border border-[#c9a45c] bg-[#fbf6ea] text-[#142536] shadow-sm transition hover:bg-[#f3ead8] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/30"
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
                <Home size={17} aria-hidden="true" />
                Home
              </NavLink>
              <div ref={propertiesMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setPropertiesOpen((open) => !open)}
                  aria-expanded={propertiesOpen}
                  aria-controls="header-properties-menu"
                  className={`inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold transition ${
                    pathname.startsWith("/projects") ? "bg-[#142536] text-white" : "text-[#142536] hover:bg-[#f3ead8]"
                  }`}
                >
                  <Building2 size={17} aria-hidden="true" />
                  Properties
                  <ChevronDown size={15} aria-hidden="true" className={`transition-transform ${propertiesOpen ? "rotate-180" : ""}`} />
                </button>
                {propertiesOpen && (
                  <div
                    id="header-properties-menu"
                    className="absolute left-0 top-[calc(100%+10px)] z-[70] w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[#e7e2d8] bg-white shadow-[0_20px_50px_rgba(13,27,42,.2)]"
                  >
                    <Link
                      to="/projects"
                      onClick={() => setPropertiesOpen(false)}
                      className="flex items-center justify-between border-b border-[#efebe3] bg-[#fbfaf7] px-4 py-3 text-sm font-bold text-[#142536] transition hover:bg-[#f3ead8]"
                    >
                      All Gurgaon &amp; NCR projects
                      <span className="text-xs font-semibold text-[#80602b]">{projects.length}</span>
                    </Link>
                    <ul className="max-h-[min(65vh,480px)] overflow-y-auto p-2">
                      {sortedProjects.map((project) => (
                        <li key={project.slug}>
                          <Link
                            to={`/projects/${project.slug}`}
                            onClick={() => setPropertiesOpen(false)}
                            className="block rounded-xl px-3 py-2.5 transition hover:bg-[#f3ead8]"
                          >
                            <span className="block text-sm font-semibold text-[#142536]">{project.name}</span>
                            <span className="mt-0.5 block text-xs text-[#68717a]">{project.location}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <SiteSearch variant="full" />
              <NotificationBell />
              <InstallAppButton variant="navbar" />
              <Link
                to="/book-visit"
                className="hidden h-11 items-center gap-2 whitespace-nowrap rounded-full bg-[#c9a45c] px-4 text-sm font-bold text-[#142536] transition hover:bg-[#e1c98f] lg:inline-flex"
              >
                <CalendarCheck size={17} aria-hidden="true" />
                Book a visit
              </Link>
              <Link
                to="/account"
                className="hidden h-11 items-center gap-2 whitespace-nowrap rounded-full border border-[#e7e2d8] bg-white px-4 text-sm font-bold text-[#142536] transition hover:border-[#c9a45c] hover:bg-[#fbf6ea] lg:inline-flex"
              >
                <UserRound size={17} aria-hidden="true" />
                {user?.role === "user" ? "Account" : "Login / Sign up"}
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
