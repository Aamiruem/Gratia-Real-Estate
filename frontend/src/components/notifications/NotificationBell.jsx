import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellOff, BellRing, CheckCheck, LayoutDashboard } from "lucide-react";
import useOwner from "../../hooks/useOwner";
import useNotifications, {
  dismissAlerts,
  disableAlerts,
  enableAlerts,
  markAllRead,
  setNotificationMode,
} from "../../hooks/useNotifications";
import NotificationList from "./NotificationList";
import { toast } from "../Toaster";

export function AlertsToggle({ notifications }) {
  const { permission, alerts } = notifications;
  const [explaining, setExplaining] = useState(false);
  if (permission === "unsupported") return null;
  if (permission === "denied") {
    return (
      <p className="flex items-center gap-2 text-xs text-[#5e6872]">
        <BellOff size={14} aria-hidden="true" /> Alerts are blocked in your browser settings.
      </p>
    );
  }
  if (permission === "granted" && alerts === "on") {
    return (
      <button type="button" onClick={disableAlerts} className="flex items-center gap-2 text-xs font-semibold text-emerald-700 hover:underline">
        <BellRing size={14} aria-hidden="true" /> Alerts on · turn off
      </button>
    );
  }
  // Declined earlier in our own prompt: don't keep asking.
  if (alerts === "declined" && permission !== "granted" && !explaining) {
    return (
      <button type="button" onClick={() => setExplaining(true)} className="flex items-center gap-2 text-xs text-[#4b5966] hover:underline">
        <BellOff size={14} aria-hidden="true" /> Alerts off
      </button>
    );
  }
  if (!explaining) {
    return (
      <button type="button" onClick={() => setExplaining(true)} className="flex items-center gap-2 text-xs font-semibold text-[#80602b] hover:underline">
        <BellRing size={14} aria-hidden="true" /> Turn on alerts
      </button>
    );
  }
  return (
    <div className="w-full rounded-xl bg-white p-3 text-xs leading-5 text-[#263746] shadow-sm ring-1 ring-[#e7e2d8]">
      <p>
        Get a browser alert for <strong>new listings, price changes, offers</strong> and updates on your enquiries,
        even when this site is closed. You can turn it off any time.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            const result = await enableAlerts();
            setExplaining(false);
            if (result === "granted") toast("Alerts turned on. We'll notify you about new updates.");
            else if (result === "denied") toast("Alerts were not allowed. You can change this in your browser settings.", "info");
          }}
          className="rounded-full bg-[#142536] px-3 py-1.5 font-bold text-white hover:bg-[#c9a45c] hover:text-[#142536]"
        >
          Allow alerts
        </button>
        <button
          type="button"
          onClick={() => {
            dismissAlerts();
            setExplaining(false);
          }}
          className="rounded-full px-3 py-1.5 font-semibold text-[#4b5966] hover:bg-[#f3f1ec]"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

export default function NotificationBell() {
  const { isStaff: isOwner } = useOwner();
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const { unread, items } = notifications;

  useEffect(() => setNotificationMode(isOwner), [isOwner]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = unread ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative grid size-11 place-items-center rounded-full border border-[#e7e2d8] bg-white text-[#142536] transition hover:border-[#c9a45c] hover:text-[#80602b]"
      >
        <Bell size={19} strokeWidth={1.9} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-5 text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-[84px] z-[70] overflow-hidden rounded-2xl border border-[#e7e2d8] bg-white shadow-[0_30px_70px_rgba(13,27,42,.22)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[380px]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#efebe3] px-4 py-3">
            <div>
              <p className="font-display text-base font-bold text-[#142536]">Notifications</p>
              <p className="text-xs text-[#5e6872]">
                {unread ? `${unread} unread` : "No unread notifications"}
                {notifications.live && <span className="ml-2 inline-flex items-center gap-1 text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500" /> Live</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={!unread}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[#142536] transition hover:bg-[#f3ead8] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck size={14} aria-hidden="true" /> Mark all read
            </button>
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain">
            {notifications.loading && !items.length ? (
              <p className="px-4 py-8 text-center text-sm text-[#5e6872]">Loading…</p>
            ) : (
              <NotificationList items={items.slice(0, 12)} onNavigate={() => setOpen(false)} compact />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#efebe3] bg-[#fbfaf7] px-4 py-3">
            <AlertsToggle notifications={notifications} />
            <div className="flex items-center gap-3">
              {isOwner && (
                <Link
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#142536] hover:text-[#80602b]"
                >
                  <LayoutDashboard size={14} aria-hidden="true" /> Admin
                </Link>
              )}
              <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs font-bold text-[#142536] hover:text-[#80602b]">
                View all
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
