import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck } from "lucide-react";
import Logo from "./Logo";
import SiteSearch from "./SiteSearch";
import NotificationBell from "./notifications/NotificationBell";
import InstallAppButton from "./InstallAppButton";
import useSiteSettings from "../hooks/useSiteSettings";

const PHONE = "+91 91097 76155";

/** The left drawer is the only site navigation; this header stays focused on brand and quick actions. */
export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <AnnouncementBar />
      <header className="sticky top-0 z-50 w-full">
        <div className={`border-b bg-white/95 backdrop-blur-xl transition-shadow ${scrolled ? "border-[#e7e2d8] shadow-[0_8px_30px_rgba(20,37,54,0.10)]" : "border-transparent"}`}>
          <div className="container-luxury flex h-[76px] items-center justify-between gap-3">
            <Link to="/" className="flex shrink-0 items-center" aria-label="Gratia Estates home">
              <Logo className="h-[50px] text-[18px] transition-transform duration-200 hover:scale-[1.02] sm:text-[20px]" />
            </Link>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <SiteSearch variant="full" />
              <InstallAppButton variant="header" />
              <NotificationBell />
              <a href="tel:+919109776155" title={`Call an advisor: ${PHONE}`} className="hidden items-center gap-2 rounded-full bg-[#34C759] px-4 py-3 text-xs font-bold text-white shadow-[0_6px_16px_rgba(52,199,89,.25)] transition hover:bg-[#2DB14F] min-[1500px]:inline-flex">
                Call an advisor · {PHONE}
              </a>
              <Link to="/book-visit" className="hidden items-center gap-2 whitespace-nowrap rounded-full bg-[#c9a45c] px-4 py-3 text-xs font-bold uppercase tracking-[.1em] text-[#142536] shadow-[0_6px_18px_rgba(201,164,92,.35)] transition hover:-translate-y-0.5 hover:bg-[#e1c98f] sm:inline-flex">
                <CalendarCheck size={16} aria-hidden="true" /> Book a visit
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
