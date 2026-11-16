import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AppWindow,
  BellRing,
  CheckCircle2,
  Download,
  EllipsisVertical,
  Laptop,
  MonitorDown,
  Plus,
  Share,
  Smartphone,
  SquarePlus,
  Tablet,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import useInstallPrompt from "../hooks/useInstallPrompt";
import { platform } from "../pwa/install";
import { toast } from "./Toaster";
import { track } from "../analytics/analytics";

/* Step-by-step instructions per device. Each step has a small pictogram of
   the browser control the visitor needs to tap. */
const GUIDES = {
  ios: {
    label: "iPhone / iPad",
    Icon: Smartphone,
    note: "Use Safari (on iOS 16.4+ Chrome and Edge work too).",
    steps: [
      { Icon: Share, text: <>Tap the <b>Share</b> button in the toolbar.</> },
      { Icon: SquarePlus, text: <>Scroll and tap <b>Add to Home Screen</b>.</> },
      { Icon: Plus, text: <>Tap <b>Add</b>. The Gratia Estates icon appears on your home screen.</> },
    ],
  },
  android: {
    label: "Android",
    Icon: Tablet,
    note: "Works in Chrome, Edge and Samsung Internet.",
    steps: [
      { Icon: EllipsisVertical, text: <>Tap the browser menu <b>⋮</b> (Samsung: <b>☰</b> at the bottom).</> },
      { Icon: Download, text: <>Choose <b>Install app</b> or <b>Add to Home screen</b>.</> },
      { Icon: CheckCircle2, text: <>Confirm. Open Gratia Estates from your home screen.</> },
    ],
  },
  desktop: {
    label: "Windows / Mac",
    Icon: Laptop,
    note: "In Chrome or Microsoft Edge.",
    steps: [
      { Icon: MonitorDown, text: <>Click the <b>install icon</b> at the right end of the address bar.</> },
      { Icon: EllipsisVertical, text: <>Or open the menu: Chrome <b>⋮ → Cast, save and share → Install page as app</b>; Edge <b>… → Apps → Install this site as an app</b>.</> },
      { Icon: AppWindow, text: <>Click <b>Install</b>. Gratia Estates opens in its own window.</> },
    ],
  },
  safari: {
    label: "Mac Safari",
    Icon: Laptop,
    note: "Safari 17 or later on macOS Sonoma+.",
    steps: [
      { Icon: Share, text: <>Open <b>File</b> (or the <b>Share</b> button).</> },
      { Icon: SquarePlus, text: <>Choose <b>Add to Dock</b>.</> },
      { Icon: AppWindow, text: <>Click <b>Add</b>. Launch it from the Dock like any app.</> },
    ],
  },
};

function detectGuide(p) {
  if (p.ios) return "ios";
  if (p.android) return "android";
  if (p.mac && p.safari) return "safari";
  return "desktop";
}

const BENEFITS = [
  { Icon: Zap, title: "One-tap access", text: "Opens straight from your home screen, dock or taskbar." },
  { Icon: WifiOff, title: "Works offline", text: "Pages you've visited stay available without internet." },
  { Icon: BellRing, title: "Property updates", text: "New listings and replies to your enquiries, if you allow alerts." },
];

function InstallDialog({ onClose, canPrompt, onInstall }) {
  const closeRef = useRef(null);
  const p = platform();
  const [guide, setGuide] = useState(detectGuide(p));
  const firefoxDesktop = p.firefox && !p.android && !p.ios;
  const current = GUIDES[guide];

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-[#0d1b2a]/65 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-dialog-title"
        className="toast-in relative grid max-h-[92vh] w-full max-w-[780px] overflow-y-auto rounded-t-[28px] bg-white shadow-[0_40px_100px_rgba(0,0,0,.35)] sm:grid-cols-[.9fr_1.1fr] sm:overflow-hidden sm:rounded-[28px]"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full bg-white/90 text-[#142536] shadow-sm transition hover:bg-[#142536] hover:text-white"
        >
          <X size={18} aria-hidden="true" />
        </button>

        {/* App preview */}
        <div className="relative isolate overflow-hidden bg-gradient-to-br from-[#0f1f2e] via-[#142536] to-[#1d3a52] p-6 text-white sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-20 -z-10 size-64 rounded-full bg-[#c9a45c]/25 blur-3xl" aria-hidden="true" />
          <div className="flex items-center gap-4">
            <img
              src="/icons/icon-192.png"
              alt=""
              width="72"
              height="72"
              className="size-[72px] rounded-[20px] shadow-[0_14px_30px_rgba(0,0,0,.4)] ring-1 ring-white/15"
            />
            <div>
              <p className="font-display text-xl font-bold !text-white">Gratia Estates</p>
              <p className="text-sm text-white/75">Gurgaon real estate · Free</p>
            </div>
          </div>
          <ul className="mt-7 space-y-4">
            {BENEFITS.map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-[#e1c98f]">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-white">{title}</span>
                  <span className="block text-[13px] leading-5 text-white/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-7 hidden text-xs text-white/60 sm:block">No app store needed. Remove it any time like any other app.</p>
        </div>

        {/* Install action / instructions */}
        <div className="p-6 sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#80602b]">Install the app</p>
          <h2 id="install-dialog-title" className="mt-1.5 pr-10 font-display text-2xl font-bold text-[#142536]">
            {canPrompt ? "Add Gratia Estates to your device" : "Install in three quick steps"}
          </h2>

          {canPrompt ? (
            <>
              <p className="mt-2 text-sm leading-6 text-[#4b5966]">
                Your browser can install Gratia Estates directly. It takes a couple of seconds.
              </p>
              <button
                type="button"
                onClick={onInstall}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#142536] px-5 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(20,37,54,.25)] transition hover:bg-[#c9a45c] hover:text-[#142536]"
              >
                <Download size={17} aria-hidden="true" /> Install now
              </button>
              <button type="button" onClick={onClose} className="mt-3 w-full rounded-full px-5 py-2.5 text-sm font-semibold text-[#4b5966] hover:text-[#142536]">
                Not now
              </button>
            </>
          ) : firefoxDesktop ? (
            <div className="mt-4 rounded-2xl bg-[#fbf6ea] p-4 text-sm leading-6 text-[#263746]">
              Firefox on computers can't install websites as apps. Open <b>gratiaestates.com</b> in <b>Chrome</b>,{" "}
              <b>Edge</b> or <b>Safari</b> and choose <b>Install App</b> again.
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Choose your device">
                {Object.entries(GUIDES).map(([id, { label, Icon }]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={guide === id}
                    onClick={() => setGuide(id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${guide === id ? "border-[#142536] bg-[#142536] text-white" : "border-[#e7e2d8] bg-white text-[#263746] hover:border-[#c9a45c]"}`}
                  >
                    <Icon size={13} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
              <ol className="mt-5 space-y-3" role="tabpanel">
                {current.steps.map(({ Icon, text }, index) => (
                  <li key={index} className="flex items-start gap-3 rounded-2xl border border-[#efebe3] bg-[#fbfaf7] p-3">
                    <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-white text-[#142536] shadow-sm ring-1 ring-[#e7e2d8]">
                      <Icon size={19} aria-hidden="true" />
                      <span className="absolute -left-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[#c9a45c] text-[10px] font-bold text-[#142536]">
                        {index + 1}
                      </span>
                    </span>
                    <span className="pt-1 text-sm leading-6 text-[#263746] [&_b]:font-semibold [&_b]:text-[#142536]">{text}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-[#5e6872]">{current.note}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 w-full rounded-full bg-[#142536] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#c9a45c] hover:text-[#142536]"
              >
                Got it
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

const VARIANTS = {
  header:
    "hidden size-11 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[#e7e2d8] bg-white text-[13px] font-semibold text-[#142536] transition hover:border-[#c9a45c] hover:text-[#80602b] 2xl:inline-flex",
  navbar:
    "inline-flex size-11 items-center justify-center rounded-full border border-[#e7e2d8] bg-white text-[#80602b] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c9a45c] hover:bg-[#fbf6ea] hover:shadow-md active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9a45c]/25",
  menu: "flex w-full items-center justify-center gap-2 rounded-full border border-[#142536] bg-white px-4 py-3 text-sm font-bold text-[#142536]",
  footer:
    "inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white transition hover:border-[#e1c98f] hover:text-[#e1c98f]",
};

export default function InstallAppButton({ variant = "header", className = "" }) {
  const { installed, standalone, canPrompt, promptInstall } = useInstallPrompt();
  const [open, setOpen] = useState(false);

  // Inside the installed app there is nothing to install.
  if (standalone) return null;

  const install = async () => {
    try {
      const outcome = await promptInstall();
      if (outcome === "unavailable") {
        setOpen(true);
        return;
      }
      setOpen(false);
      if (outcome === "accepted") toast("Gratia Estates is being installed.");
      else toast("Install was cancelled. You can try again any time.", "info");
    } catch {
      setOpen(true);
      toast("Your browser could not open the install prompt. Follow the device steps instead.", "info");
    }
  };

  const onClick = () => {
    track("install_click", { detail: canPrompt ? "prompt" : "instructions" });
    if (installed && !canPrompt) {
      toast("Gratia Estates is already installed. Open it from your home screen or apps.", "info");
      return;
    }
    // Use the one-time browser install prompt immediately from the user gesture.
    // iOS and browsers without this API still get the correct device guide.
    if (canPrompt) {
      void install();
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        title={variant === "header" || variant === "navbar" ? (installed && !canPrompt ? "App installed" : "Install App") : undefined}
        className={`${VARIANTS[variant]} ${className}`}
      >
        {installed && !canPrompt ? (
          <CheckCircle2 size={16} className="text-emerald-600" aria-hidden="true" />
        ) : (
          <Download size={16} aria-hidden="true" />
        )}
        <span className={variant === "header" || variant === "navbar" ? "sr-only" : undefined}>
          {installed && !canPrompt ? "App installed" : "Install App"}
        </span>
      </button>
      {/* Page-level portal so the overlay covers the whole screen, not just the header. */}
      {open && createPortal(<InstallDialog onClose={() => setOpen(false)} canPrompt={canPrompt} onInstall={install} />, document.body)}
    </>
  );
}
