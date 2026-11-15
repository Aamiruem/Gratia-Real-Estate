import { useEffect, useRef, useState } from "react";
import { Copy, Facebook, Mail, MessageCircle, Send, Share2, Smartphone } from "lucide-react";
import { toast } from "./Toaster";
import { track } from "../analytics/analytics";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // navigator.clipboard needs HTTPS; fall back to a hidden textarea.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
const isTouch = () => window.matchMedia?.("(pointer: coarse)").matches;

const TRIGGERS = {
  icon: "grid size-11 place-items-center rounded-full border border-[#e7e2d8] bg-white text-[#142536] transition hover:border-[#c9a45c] hover:text-[#80602b]",
  overlay: "grid size-10 place-items-center rounded-full bg-white/95 text-[#142536] shadow-md transition hover:bg-[#c9a45c]",
  pill: "inline-flex items-center gap-2 rounded-full border border-[#e7e2d8] bg-white px-4 py-2.5 text-sm font-semibold text-[#142536] transition hover:border-[#c9a45c] hover:text-[#80602b]",
  menu: "flex w-full items-center justify-center gap-2 rounded-full border border-[#e7e2d8] bg-[#fbfaf7] px-4 py-3 text-sm font-bold text-[#142536]",
};

/**
 * Share a page. On phones it opens the native share sheet; elsewhere a menu
 * with Copy link, WhatsApp, Facebook and Email.
 * @param {{url?: string, title?: string, text?: string, variant?: keyof TRIGGERS, label?: string, align?: "left"|"right"}} props
 */
export default function ShareButton({
  url,
  title = "Gratia Estates",
  text = "Discover premium residential and commercial properties with Gratia Estates. Explore properties, discover opportunities, and connect with us today.",
  variant = "icon",
  label = "Share",
  align = "right",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const shareUrl = () => url || window.location.href;

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => !wrapperRef.current?.contains(event.target) && setOpen(false);
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text, url: shareUrl() });
      track("share", { detail: "native" });
      return true;
    } catch (error) {
      return error?.name === "AbortError"; // the person closed the sheet
    }
  };

  const onTrigger = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (canNativeShare() && isTouch() && (await nativeShare())) return;
    setOpen((value) => !value);
  };

  const copy = async () => {
    const ok = await copyText(shareUrl());
    if (ok) track("share", { detail: "copy_link" });
    toast(ok ? "Link copied to clipboard" : "Couldn't copy the link. Please copy it from the address bar.", ok ? "success" : "error");
    setOpen(false);
  };

  const message = `${text}\n${shareUrl()}`;
  const links = [
    {
      label: "WhatsApp",
      Icon: MessageCircle,
      tone: "bg-emerald-100 text-emerald-700",
      href: () => `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`,
    },
    {
      label: "Facebook",
      Icon: Facebook,
      tone: "bg-blue-100 text-blue-700",
      href: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl())}`,
    },
    {
      label: "Telegram",
      Icon: Send,
      tone: "bg-sky-100 text-sky-700",
      href: () => `https://t.me/share/url?url=${encodeURIComponent(shareUrl())}&text=${encodeURIComponent(text)}`,
    },
    {
      label: "Email",
      Icon: Mail,
      tone: "bg-amber-100 text-amber-800",
      href: () => `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${shareUrl()}`)}`,
    },
  ];

  const item =
    "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-[#142536] transition hover:bg-[#f7f4ed]";

  return (
    <div ref={wrapperRef} className={`relative ${variant === "menu" ? "w-full" : ""}`}>
      <button
        type="button"
        onClick={onTrigger}
        aria-label={variant === "icon" || variant === "overlay" ? `${label}: ${title}` : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        title={label}
        className={`${TRIGGERS[variant]} ${className}`}
      >
        <Share2 size={variant === "overlay" ? 16 : 18} strokeWidth={1.9} aria-hidden="true" />
        {(variant === "pill" || variant === "menu") && label}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-[75] mt-2 w-60 rounded-2xl border border-[#e7e2d8] bg-white p-2 shadow-[0_24px_60px_rgba(13,27,42,.2)] ${align === "left" ? "left-0" : "right-0"} ${variant === "menu" ? "bottom-full mb-2 mt-0" : "top-full"}`}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#80602b]">Share</p>
          {canNativeShare() && (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={async () => {
                setOpen(false);
                await nativeShare();
              }}
            >
              <span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-700">
                <Smartphone size={16} aria-hidden="true" />
              </span>
              More options…
            </button>
          )}
          <button type="button" role="menuitem" className={item} onClick={copy}>
            <span className="grid size-8 place-items-center rounded-lg bg-[#f3ead8] text-[#80602b]">
              <Copy size={16} aria-hidden="true" />
            </span>
            Copy link
          </button>
          {links.map(({ label: name, Icon, tone, href }) => (
            <a
              key={name}
              role="menuitem"
              href={href()}
              target={name === "Email" ? undefined : "_blank"}
              rel="noopener noreferrer"
              className={item}
              onClick={() => {
                track("share", { detail: name.toLowerCase() });
                setOpen(false);
              }}
            >
              <span className={`grid size-8 place-items-center rounded-lg ${tone}`}>
                <Icon size={16} aria-hidden="true" />
              </span>
              {name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
