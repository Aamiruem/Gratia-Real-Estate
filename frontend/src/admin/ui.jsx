import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

/* Shared building blocks for the admin panel. */

export const inputClass =
  "h-11 w-full rounded-xl border border-[#d4d8de] bg-white px-3.5 text-sm text-[#142536] outline-none transition placeholder:text-[#7a838c] focus:border-[#c9a45c] focus:ring-4 focus:ring-[#c9a45c]/15";
export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#142536] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#c9a45c] hover:text-[#142536] disabled:cursor-not-allowed disabled:opacity-50";
export const buttonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-[#d9d2c3] bg-white px-4 py-2.5 text-xs font-bold text-[#142536] transition hover:border-[#c9a45c] disabled:opacity-50";

export const statusLabel = (value = "") => value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const STATUS_TONES = {
  new: "bg-sky-100 text-sky-900",
  requested: "bg-sky-100 text-sky-900",
  contacted: "bg-amber-100 text-amber-900",
  confirmed: "bg-emerald-100 text-emerald-900",
  rescheduled: "bg-amber-100 text-amber-900",
  qualified: "bg-violet-100 text-violet-900",
  converted: "bg-emerald-100 text-emerald-900",
  completed: "bg-emerald-100 text-emerald-900",
  lost: "bg-slate-200 text-slate-800",
  cancelled: "bg-slate-200 text-slate-800",
  no_show: "bg-rose-100 text-rose-900",
};

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONES[status] ?? "bg-slate-100 text-slate-800"}`}>
      {statusLabel(status)}
    </span>
  );
}

export const formatDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value))
    : "";
export const formatDay = (iso) =>
  iso ? new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)) : "";
export const number = (n) => new Intl.NumberFormat("en-IN").format(n ?? 0);

/** Loads data with loading / error state. `deps` re-run the loader. */
export function useAdminData(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      setState({ data: await load(), loading: false, error: "" });
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error: error.message }));
    }
  }, [load]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data: typeof data === "function" ? data(s.data) : data })) };
}

export function PageHeader({ title, text, actions, onRefresh, loading }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#142536] sm:text-3xl">{title}</h1>
        {text && <p className="mt-1 max-w-2xl text-sm text-[#4b5966]">{text}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefresh && (
          <button type="button" onClick={onRefresh} className={buttonSecondary} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" /> Refresh
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}

export function Card({ title, action, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-base font-bold text-[#142536]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, Icon, tone = "bg-slate-100 text-slate-700", hint }) {
  return (
    <div className="rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#4b5966]">{label}</span>
        {Icon && (
          <span className={`grid size-8 place-items-center rounded-lg ${tone}`}>
            <Icon size={16} aria-hidden="true" />
          </span>
        )}
      </div>
      <strong className="mt-2 block font-display text-2xl font-bold text-[#142536]">{typeof value === "number" ? number(value) : value}</strong>
      {hint && <span className="text-xs text-[#5e6872]">{hint}</span>}
    </div>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#4b5966]" role="status">
      <Loader2 size={18} className="animate-spin text-[#c9a45c]" aria-hidden="true" /> {label}
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900" role="alert">{error}</p>;
}

export function Empty({ Icon, title, text, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9d2c3] bg-white px-6 py-10 text-center">
      {Icon && <Icon size={26} className="mx-auto text-[#80602b]" aria-hidden="true" />}
      <p className="mt-2 font-semibold text-[#142536]">{title ?? children}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-[#4b5966]">{text}</p>}
    </div>
  );
}

/**
 * Ranked magnitudes as horizontal bars (one hue; label and value in text ink).
 * rows: [{ label, value }]
 */
export function BarList({ rows, valueLabel = "", empty = "No data yet" }) {
  if (!rows?.length) return <p className="py-4 text-sm text-[#5e6872]">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map(({ label, value }) => (
        <li key={label} title={`${label}: ${number(value)} ${valueLabel}`.trim()}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-[#263746]">{label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-[#142536]">{number(value)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-[#f1ede4]">
            <div className="h-2 rounded-full bg-[#1f4a6e]" style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Change over time as columns (single series). Hover/focus a column for its value;
 * the same numbers are available as a table for screen readers.
 * points: [{ label, value }]
 */
export function ColumnChart({ points, seriesLabel, height = 160 }) {
  const [active, setActive] = useState(null);
  if (!points?.length) return <p className="py-4 text-sm text-[#5e6872]">No data for this period yet.</p>;
  const max = Math.max(...points.map((p) => p.value), 1);
  const shown = active ?? points.length - 1;
  return (
    <div>
      <p className="mb-2 text-sm text-[#4b5966]" aria-live="polite">
        <span className="font-semibold text-[#142536]">{points[shown].label}</span>: {number(points[shown].value)} {seriesLabel}
      </p>
      <div className="flex items-end gap-[2px] border-b border-[#d9d2c3]" style={{ height }} onMouseLeave={() => setActive(null)} aria-hidden="true">
        {points.map((p, i) => (
          <div
            key={p.label}
            className="group flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setActive(i)}
            title={`${p.label}: ${number(p.value)} ${seriesLabel}`}
          >
            <div
              className={`w-full rounded-t-[4px] transition-colors ${i === shown ? "bg-[#c9a45c]" : "bg-[#1f4a6e] group-hover:bg-[#2c628f]"}`}
              style={{ height: `${p.value ? Math.max(2, (p.value / max) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[#5e6872]">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
      <details className="mt-2 text-xs text-[#4b5966]">
        <summary className="cursor-pointer font-semibold">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1 font-semibold">Date</th>
              <th className="py-1 text-right font-semibold">{seriesLabel}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label} className="border-t border-[#efebe3]">
                <td className="py-1">{p.label}</td>
                <td className="py-1 text-right tabular-nums">{number(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function RangePicker({ value, onChange, options = [7, 30, 90, 365] }) {
  return (
    <div className="flex rounded-full bg-[#efebe3] p-1" role="group" aria-label="Date range">
      {options.map((days) => (
        <button
          key={days}
          type="button"
          aria-pressed={value === days}
          onClick={() => onChange(days)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${value === days ? "bg-white text-[#142536] shadow-sm" : "text-[#4b5966] hover:text-[#142536]"}`}
        >
          {days === 365 ? "1 year" : `${days} days`}
        </button>
      ))}
    </div>
  );
}

/* ---- Compatibility helpers used by the admin pages (same look as above) ---- */

export function PageTitle({ eyebrow, title, text, actions }) {
  return (
    <div>
      {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#80602b]">{eyebrow}</p>}
      <PageHeader title={title} text={text} actions={actions} />
    </div>
  );
}

/** Same as useAdminData: { data, error, loading, reload }. */
export const useLoad = useAdminData;

/** Single-series daily columns. rows: [{ date, value }] */
export function DailyColumns({ rows, label }) {
  return <ColumnChart points={(rows || []).map((r) => ({ label: r.date, value: r.value }))} seriesLabel={label.toLowerCase()} />;
}
