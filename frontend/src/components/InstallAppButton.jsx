import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, MonitorDown, Smartphone, X } from "lucide-react";
import useInstallPrompt from "../hooks/useInstallPrompt";
import { platform } from "../pwa/install";
import { toast } from "./Toaster";

function instructionsFor(p) {
  if (p.ios) {
    return {
      Icon: Smartphone,
      title: "Install on iPhone or iPad",
      steps: [
        "Open gratiaestates.com in Safari (on iOS 16.4+ Chrome and Edge also work).",
        "Tap the Share button (the square with an arrow).",
        "Scroll down and tap “Add to Home Screen”, then tap Add.",
      ],
    };
  }
  if (p.mac && p.safari) {
    return {
      Icon: MonitorDown,
      title: "Install on your Mac",
      steps: [
        "In Safari 17 or later, open the File menu (or the Share button).",
        "Choose “Add to Dock”.",
        "Click Add. Gratia Estates opens from the Dock like any app.",
      ],
    };
  }
  if (p.firefox && !p.android) {
    return {
      Icon: MonitorDown,
      title: "Install the app",
      steps: [
        "Firefox on desktop can't install websites as apps.",
        "Open gratiaestates.com in Chrome, Edge or Safari.",
        "Then choose Install App again.",
      ],
    };
  }
  if (p.android) {
    return {
      Icon: Smartphone,
      title: "Install on Android",
      steps: [
        p.samsung ? "Tap the menu (☰) at the bottom." : "Tap the browser menu (⋮) at the top right.",
        p.samsung ? "Choose “Add page to” → “Home screen”." : "Choose “Install app” or “Add to Home screen”.",
        "Confirm. The app icon appears on your home screen.",
      ],
    };
  }
  return {
    Icon: MonitorDown,
    title: "Install on your computer",
    steps: [
      "Look for the install icon (a monitor with a down arrow) at the right of the address bar.",
      p.edge
        ? "Or open the menu (…) → Apps → “Install this site as an app”."
        : "Or open the menu (⋮) → “Cast, save and share” → “Install page as app”.",
      "Click Install. Gratia Estates opens in its own window.",
    ],
  };
}

function InstallDialog({ onClose }) {
  const closeRef = useRef(null);
  const { Icon, title, steps } = instructionsFor(platform());

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-[#0d1b2a]/60 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-dialog-title"
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#142536] text-[#e1c98f]">
            <Icon size={22} aria-hidden="true" />
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full bg-[#f3f1ec] text-[#142536] hover:bg-[#142536] hover:text-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <h2 id="install-dialog-title" className="mt-4 font-display text-2xl font-bold text-[#142536]">
          {title}
        </h2>
        <p className="mt-1 text-sm text-[#4b5966]">
          Get one-tap access to projects, site visits and updates. It works offline too.
        </p>
        <ol className="mt-5 space-y-3">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm leading-6 text-[#263746]">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#f3ead8] text-xs font-bold text-[#80602b]">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-[#142536] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#c9a45c] hover:text-[#142536]"
        >
          Got it
        </button>
      </section>
    </div>
  );
}

const VARIANTS = {
  header:
    "hidden h-11 items-center gap-2 rounded-full border border-[#e7e2d8] bg-white px-3.5 text-xs font-bold text-[#142536] transition hover:border-[#c9a45c] hover:text-[#80602b] lg:inline-flex",
  menu: "flex w-full items-center justify-center gap-2 rounded-full border border-[#142536] bg-white px-4 py-3 text-sm font-bold text-[#142536]",
  footer:
    "inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white transition hover:border-[#e1c98f] hover:text-[#e1c98f]",
};

export default function InstallAppButton({ variant = "header", className = "" }) {
  const { installed, standalone, canPrompt, promptInstall } = useInstallPrompt();
  const [showHelp, setShowHelp] = useState(false);

  // Inside the installed app there is nothing to install.
  if (standalone) return null;

  const onClick = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === "accepted") toast("Gratia Estates is being installed.");
      return;
    }
    if (installed) {
      toast("Gratia Estates is already installed. Open it from your home screen or apps.", "info");
      return;
    }
    setShowHelp(true);
  };

  return (
    <>
      <button type="button" onClick={onClick} className={`${VARIANTS[variant]} ${className}`}>
        {installed && !canPrompt ? (
          <CheckCircle2 size={16} className="text-emerald-600" aria-hidden="true" />
        ) : (
          <Download size={16} aria-hidden="true" />
        )}
        {installed && !canPrompt ? "App installed" : "Install App"}
      </button>
      {showHelp && <InstallDialog onClose={() => setShowHelp(false)} />}
    </>
  );
}
