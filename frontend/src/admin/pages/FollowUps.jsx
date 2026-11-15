import { useState } from "react";
import { Link } from "react-router-dom";
import { Phone } from "lucide-react";
import { adminApi } from "../api";
import { Empty, ErrorNote, Loading, PageTitle, useLoad } from "../ui";

const SCOPES = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "all", label: "All scheduled" },
];

const formatWhen = (iso) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export default function FollowUps() {
  const [scope, setScope] = useState("overdue");
  const { data, error, loading } = useLoad(() => adminApi.followUpsDue(scope), [scope]);
  const now = Date.now();

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Lead management"
        title="Follow-ups"
        text="Leads with a scheduled next step. Add notes and set the next follow-up from each lead in Leads. You're notified in the bell when one falls due."
      />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Follow-up period">
        {SCOPES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={scope === id}
            onClick={() => setScope(id)}
            className={`rounded-full border px-4 py-2 text-xs font-bold transition ${scope === id ? "border-[#142536] bg-[#142536] text-white" : "border-[#e7e2d8] bg-white text-[#142536] hover:border-[#c9a45c]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty>No follow-ups in this view.</Empty>
      ) : (
        <ul className="space-y-2">
          {data.items.map((lead) => {
            const overdue = new Date(lead.follow_up_at).getTime() < now;
            return (
              <li key={lead.reference} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-sm">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${overdue ? "bg-rose-100 text-rose-800" : "bg-sky-100 text-sky-800"}`}>
                  {overdue ? "Overdue · " : ""}
                  {formatWhen(lead.follow_up_at)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#142536]">
                    {lead.name} <span className="font-mono text-xs font-normal text-[#5e6872]">{lead.reference}</span>
                  </p>
                  <p className="text-sm text-[#4b5966]">
                    {lead.property_name || "No property chosen"} · <span className="capitalize">{lead.status.replace("_", " ")}</span>
                  </p>
                </div>
                <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#142536] hover:underline">
                  <Phone size={14} aria-hidden="true" /> {lead.phone}
                </a>
                <Link to={`/admin/leads?lead=${lead.reference}`} className="rounded-full bg-[#142536] px-4 py-2 text-xs font-bold text-white hover:bg-[#c9a45c] hover:text-[#142536]">
                  Open lead
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
