import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, LayoutDashboard, RefreshCw } from "lucide-react";
import SEO from "../components/SEO";
import NotificationList from "../components/notifications/NotificationList";
import { AlertsToggle } from "../components/notifications/NotificationBell";
import useOwner from "../hooks/useOwner";
import useNotifications, { markAllRead, refreshNotifications } from "../hooks/useNotifications";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "read", label: "Read" },
];

export default function Notifications() {
  const notifications = useNotifications();
  const { isOwner } = useOwner();
  const [filter, setFilter] = useState("all");
  const { items, unread, loading, live, error } = notifications;

  const visible = useMemo(
    () => items.filter((item) => (filter === "unread" ? !item.read : filter === "read" ? item.read : true)),
    [items, filter],
  );

  return (
    <>
      <SEO title="Notifications | Gratia Estates" description="Your Gratia Estates updates." path="/notifications" noindex />
      <section className="bg-[#f7f4ed] py-10 sm:py-14">
        <div className="container-luxury max-w-3xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] text-[#80602b]">
                <Bell size={14} aria-hidden="true" /> Notification history
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold text-[#142536] sm:text-4xl">Notifications</h1>
              <p className="mt-2 text-sm text-[#4b5966]">
                {isOwner
                  ? "New enquiries, visit requests, callbacks and site updates. Updates appear here as they happen."
                  : "New properties, videos and updates on enquiries you've sent from this device."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isOwner && (
                <Link
                  to="/admin/leads"
                  className="inline-flex items-center gap-2 rounded-full bg-[#142536] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#c9a45c] hover:text-[#142536]"
                >
                  <LayoutDashboard size={15} aria-hidden="true" /> Leads dashboard
                </Link>
              )}
              <button
                type="button"
                onClick={() => refreshNotifications()}
                className="inline-flex items-center gap-2 rounded-full border border-[#e7e2d8] bg-white px-4 py-2.5 text-xs font-bold text-[#142536] hover:border-[#c9a45c]"
              >
                <RefreshCw size={15} aria-hidden="true" /> Refresh
              </button>
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-3xl border border-[#e7e2d8] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#efebe3] px-4 py-3">
              <div className="flex gap-1 rounded-full bg-[#f3f1ec] p-1" role="tablist" aria-label="Filter notifications">
                {FILTERS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    onClick={() => setFilter(id)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${filter === id ? "bg-white text-[#142536] shadow-sm" : "text-[#4b5966] hover:text-[#142536]"}`}
                  >
                    {label}
                    {id === "unread" && unread > 0 ? ` (${unread})` : ""}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                {live && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <span className="size-2 animate-pulse rounded-full bg-emerald-500" /> Live
                  </span>
                )}
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={!unread}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#142536] hover:text-[#80602b] disabled:opacity-40"
                >
                  <CheckCheck size={15} aria-hidden="true" /> Mark all as read
                </button>
              </div>
            </div>

            {error && <p className="bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
            {loading && !items.length ? (
              <p className="px-4 py-10 text-center text-sm text-[#5e6872]">Loading notifications…</p>
            ) : (
              <NotificationList items={visible} />
            )}

            <div className="border-t border-[#efebe3] bg-[#fbfaf7] px-4 py-3">
              <AlertsToggle notifications={notifications} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
