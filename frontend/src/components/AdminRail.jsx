import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  CalendarCheck,
  Clapperboard,
  ContactRound,
  Home,
  LayoutDashboard,
  Menu,
  Phone,
  Settings,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import useOwner from "../hooks/useOwner";
import Logo from "./Logo";

const PUBLIC_LINKS = [
  { to: "/", label: "Home", Icon: Home, end: true },
  { to: "/projects", label: "Properties", Icon: Building2 },
  { to: "/residential", label: "Residential", Icon: Home },
  { to: "/commercial", label: "Commercial", Icon: Building2 },
  { to: "/price-prediction", label: "Price prediction", Icon: Calculator },
  { to: "/videos", label: "Videos", Icon: Clapperboard },
  { to: "/blog", label: "Guides & blog", Icon: BookOpen },
  { to: "/about", label: "About Gratia", Icon: UsersRound },
  { to: "/contact", label: "Contact", Icon: ContactRound },
];

const STAFF_LINKS = [
  { to: "/admin", label: "Admin dashboard", Icon: LayoutDashboard, end: true },
  { to: "/admin/properties", label: "Add / manage properties", Icon: Building2 },
  { to: "/admin/leads", label: "Leads & enquiries", Icon: ContactRound },
  { to: "/admin/analytics", label: "Analytics", Icon: BarChart3 },
  { to: "/admin/settings", label: "Admin settings", Icon: Settings, roles: ["owner", "admin"] },
];

/** A responsive site menu available to visitors and signed-in staff. */
export default function AdminRail() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { isStaff, role } = useOwner();
  const staffLinks = STAFF_LINKS.filter((item) => !item.roles || item.roles.includes(role));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  const linkClass = ({ isActive }) =>
    `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${isActive ? "bg-[#f3ead8] text-[#142536]" : "text-white/80 hover:bg-white/10 hover:text-white"}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open site menu"
        aria-expanded={open}
        aria-controls="site-side-menu"
        title="Open menu"
        className="fixed left-3 top-[88px] z-[55] grid size-11 place-items-center rounded-full border border-[#e7e2d8] bg-white/95 text-[#142536] shadow-[0_8px_24px_rgba(13,27,42,.16)] backdrop-blur transition hover:border-[#c9a45c] hover:bg-[#fbf6ea] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/30"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      {open && (
        <>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close site menu" className="fixed inset-0 z-[60] cursor-default bg-[#0d1b2a]/45 backdrop-blur-[2px]" />
          <aside
            id="site-side-menu"
            aria-label="Site menu"
            className="fixed inset-y-0 left-0 z-[65] flex w-[min(340px,calc(100vw-20px))] flex-col overflow-hidden rounded-r-3xl bg-[#102337] text-white shadow-[20px_0_60px_rgba(13,27,42,.28)]"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
              <Link to="/" onClick={() => setOpen(false)} aria-label="Gratia Estates home">
                <Logo variant="light" className="h-11 text-[17px]" />
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid size-10 place-items-center rounded-full border border-white/15 text-white/80 transition hover:bg-white/10 hover:text-white">
                <X size={19} aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 p-4">
              <Link to="/price-prediction" onClick={() => setOpen(false)} className="flex min-h-[76px] flex-col justify-between rounded-2xl bg-[#c9a45c] p-3 text-[#142536] transition hover:bg-[#e1c98f]">
                <Calculator size={19} aria-hidden="true" />
                <span className="text-xs font-bold">Estimate a price</span>
              </Link>
              <Link to="/book-visit" onClick={() => setOpen(false)} className="flex min-h-[76px] flex-col justify-between rounded-2xl border border-white/15 bg-white/5 p-3 transition hover:bg-white/10">
                <CalendarCheck size={19} className="text-[#e1c98f]" aria-hidden="true" />
                <span className="text-xs font-bold">Book a visit</span>
              </Link>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Main menu">
              <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[.18em] text-[#e1c98f]">Explore Gratia Estates</p>
              <ul className="space-y-1">
                {PUBLIC_LINKS.map(({ to, label, Icon, end }) => (
                  <li key={to}>
                    <NavLink to={to} end={end} onClick={() => setOpen(false)} className={linkClass}>
                      <Icon size={17} className="shrink-0 text-[#e1c98f]" aria-hidden="true" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>

              <div className="my-4 border-t border-white/10" />
              {isStaff ? (
                <>
                  <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#e1c98f]">Staff tools · {role}</p>
                  <ul className="space-y-1">
                    {staffLinks.map(({ to, label, Icon, end }) => (
                      <li key={to}>
                        <NavLink to={to} end={end} onClick={() => setOpen(false)} className={linkClass}>
                          <Icon size={17} className="shrink-0 text-[#e1c98f]" aria-hidden="true" />
                          {label}
                        </NavLink>
                      </li>
                    ))}
                    <li>
                      <Link to="/videos" onClick={() => setOpen(false)} className={linkClass}>
                        <Video size={17} className="shrink-0 text-[#e1c98f]" aria-hidden="true" />
                        Manage video library
                      </Link>
                    </li>
                  </ul>
                </>
              ) : (
                <Link to="/admin" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#c9a45c]/50 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
                  <LayoutDashboard size={17} className="text-[#e1c98f]" aria-hidden="true" />
                  Admin sign in
                </Link>
              )}
            </nav>

            <div className="border-t border-white/10 p-4">
              <a href="tel:+919109776155" className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-500">
                <Phone size={16} aria-hidden="true" /> Call a property advisor
              </a>
              <p className="mt-3 text-center text-[10px] text-white/50">Gurgaon · Delhi-NCR</p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
