import { Link } from "react-router-dom";
import { AlarmClock, ArrowRight, Building2, CalendarCheck, CalendarClock, Eye, Inbox, TrendingUp, UserCheck, UserPlus, Users } from "lucide-react";
import { adminApi } from "../api";
import { Card, DailyColumns, ErrorNote, Loading, PageTitle, StatCard, useLoad } from "../ui";
import { timeAgo } from "../../utils/format";

const KIND = {
  contact: "Contact",
  visit: "Site visit",
  callback: "Callback",
  property_enquiry: "Property enquiry",
  consultation: "Consultation",
  whatsapp: "WhatsApp",
};

export default function Overview() {
  const { data, error, loading } = useLoad(() => Promise.all([adminApi.overview(), adminApi.analytics(14)]));
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const [o, a] = data;
  const l = o.leads;

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Admin panel" title="Overview" text="Today's priorities and how the website is performing." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Visitors (30 days)" value={o.visitors_30_days} Icon={Eye} tone="bg-sky-100 text-sky-700" />
        <StatCard label="Total enquiries" value={l.total} Icon={Inbox} tone="bg-slate-100 text-slate-700" />
        <StatCard label="New leads" value={l.new} Icon={UserPlus} tone="bg-amber-100 text-amber-800" />
        <StatCard label="Contacted" value={l.contacted} Icon={Users} tone="bg-indigo-100 text-indigo-700" />
        <StatCard label="Qualified" value={l.qualified} Icon={UserCheck} tone="bg-violet-100 text-violet-700" />
        <StatCard label="Converted" value={l.converted} Icon={TrendingUp} tone="bg-emerald-100 text-emerald-700" />
        <StatCard label="Visits today" value={o.visits_today} Icon={CalendarCheck} tone="bg-teal-100 text-teal-700" />
        <StatCard label="Follow-ups due" value={o.follow_ups_due} Icon={AlarmClock} tone="bg-rose-100 text-rose-700" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Visitors per day (last 14 days)" action={<Link to="/admin/analytics" className="text-xs font-bold text-[#80602b]">Analytics →</Link>}>
          <DailyColumns rows={a.trend.map((d) => ({ date: d.date, value: d.visitors }))} label="Visitors" />
          <p className="mt-3 text-xs text-[#5e6872]">Counts visitors who accepted analytics cookies.</p>
        </Card>
        <Card title="Needs attention">
          <ul className="space-y-2 text-sm">
            {[
              { to: "/admin/leads", Icon: Inbox, text: `${l.new} new leads awaiting a reply`, show: l.new },
              { to: "/admin/leads", Icon: Users, text: `${o.unassigned} new leads not assigned to anyone`, show: o.unassigned },
              { to: "/admin/follow-ups", Icon: AlarmClock, text: `${o.follow_ups_due} follow-ups due`, show: o.follow_ups_due },
              { to: "/admin/leads", Icon: CalendarClock, text: `${o.upcoming_visits} upcoming site visits`, show: o.upcoming_visits },
              { to: "/admin/properties", Icon: Building2, text: `${o.properties.drafts} unpublished property drafts`, show: o.properties.drafts },
            ]
              .filter((row) => row.show)
              .map(({ to, Icon, text }) => (
                <li key={text}>
                  <Link to={to} className="flex items-center gap-3 rounded-xl border border-[#efebe3] px-3 py-2.5 hover:border-[#c9a45c]">
                    <Icon size={16} className="text-[#80602b]" aria-hidden="true" />
                    <span className="flex-1 text-[#263746]">{text}</span>
                    <ArrowRight size={14} className="text-[#80602b]" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            {!(l.new || o.unassigned || o.follow_ups_due || o.upcoming_visits || o.properties.drafts) && (
              <li className="rounded-xl bg-emerald-50 px-3 py-3 text-emerald-800">All caught up. Nothing needs attention right now.</li>
            )}
          </ul>
          <p className="mt-4 text-xs text-[#5e6872]">
            {o.properties.published} published properties · {o.properties.drafts} drafts
          </p>
        </Card>
      </div>

      <Card title="Latest enquiries" action={<Link to="/admin/leads" className="text-xs font-bold text-[#80602b]">All leads →</Link>}>
        {o.recent_leads.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-[#5e6872]">
                <tr>
                  <th className="py-2 pr-3 font-bold">Reference</th>
                  <th className="py-2 pr-3 font-bold">Customer</th>
                  <th className="py-2 pr-3 font-bold">Type</th>
                  <th className="py-2 pr-3 font-bold">Property</th>
                  <th className="py-2 pr-3 font-bold">Status</th>
                  <th className="py-2 font-bold">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efebe3]">
                {o.recent_leads.map((lead) => (
                  <tr key={lead.reference}>
                    <td className="py-2 pr-3 font-mono text-xs">
                      <Link to={`/admin/leads?lead=${lead.reference}`} className="font-semibold text-[#142536] hover:underline">
                        {lead.reference}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 font-semibold text-[#142536]">{lead.name}</td>
                    <td className="py-2 pr-3 text-[#263746]">{KIND[lead.kind] ?? lead.kind}</td>
                    <td className="py-2 pr-3 text-[#263746]">{lead.property_name || "–"}</td>
                    <td className="py-2 pr-3 capitalize text-[#263746]">{lead.status.replace("_", " ")}</td>
                    <td className="py-2 text-[#5e6872]">{timeAgo(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#4b5966]">No enquiries yet. They appear here as soon as a customer submits a form.</p>
        )}
      </Card>
    </div>
  );
}
