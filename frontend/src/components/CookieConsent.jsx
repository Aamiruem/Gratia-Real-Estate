import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { getConsent, setConsent } from "../analytics/analytics";

// Asks once; the choice can be changed later from "Cookie settings" in the footer.
export default function CookieConsent() {
  const [open, setOpen] = useState(() => !getConsent());

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener("gratia-open-cookie-settings", reopen);
    return () => window.removeEventListener("gratia-open-cookie-settings", reopen);
  }, []);

  if (!open) return null;
  const choose = (value) => {
    setConsent(value);
    setOpen(false);
  };

  return (
    <section
      role="dialog"
      aria-live="polite"
      aria-labelledby="cookie-title"
      className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-3xl rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-[0_24px_60px_rgba(13,27,42,.25)] sm:bottom-5 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="hidden size-11 shrink-0 place-items-center rounded-xl bg-[#f3ead8] text-[#80602b] sm:grid">
          <Cookie size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="cookie-title" className="text-sm font-bold text-[#142536]">
            Help us improve Gratia Estates
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-[#4b5966]">
            With your permission we use analytics cookies (including Google Analytics) to see which pages and properties
            are useful. We never share your name, phone number or email.{" "}
            <Link to="/cookie-policy" className="font-semibold text-[#142536] underline">
              Cookie policy
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="flex-1 rounded-full border border-[#d9dce0] px-4 py-2.5 text-sm font-bold text-[#142536] hover:bg-[#f3f1ec] sm:flex-none"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="flex-1 rounded-full bg-[#142536] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#c9a45c] hover:text-[#142536] sm:flex-none"
          >
            Accept
          </button>
        </div>
      </div>
    </section>
  );
}
