import { useState } from "react";
import { AlarmClock, CalendarCheck, Inbox, TrendingUp, Users, UserCheck, UserPlus } from "lucide-react";
import { adminApi } from "../api";
import { BarList, ColumnChart, ErrorNote, Loading, PageTitle, StatCard, useAdminData } from "../ui";

const today = new Date().toISOString().slice(0, 10);

export default function CrmDashboard() {
  const [period, setPeriod] = useState("month");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const params = period === "custom" ? { period, start_date: startDate, end_date: endDate } : { period };
  const { data, error, loading } = useAdminData(
    () => adminApi.crmSummary(params),
    [period, startDate, endDate],
  );

  const cards = data
    ? [
        { label: "Total customers", value: data.customers, Icon: Users, tone: "bg-sky-100 text-sky-700" },
        { label: "Enquiries in period", value: data.leads.total, Icon: Inbox, tone: "bg-slate-100 text-slate-700" },
        { label: "New enquiries", value: data.leads.new, Icon: UserPlus, tone: "bg-amber-100 text-amber-800" },
        { label: "Active leads", value: data.leads.active, Icon: UserCheck, tone: "bg-violet-100 text-violet-700" },
        { label: "Contacted", value: data.leads.contacted, Icon: Users, tone: "bg-indigo-100 text-indigo-700" },
        { label: "Converted", value: data.leads.converted, Icon: TrendingUp, tone: "bg-emerald-100 text-emerald-700" },
        { label: "Follow-ups due", value: data.follow_ups_due, Icon: AlarmClock, tone: "bg-rose-100 text-rose-700" },
        { label: "Upcoming visits", value: data.upcoming_visits, Icon: CalendarCheck, tone: "bg-teal-100 text-teal-700" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Customer relationship management"
        title="CRM dashboard"
        text="Pipeline activity, follow-ups, visits and customer acquisition from live lead records."
        actions={
          <label className="text-xs font-semibold text-[#4b5966]">
            Reporting period
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="ml-2 h-10 rounded-xl border border-[#d9dce0] bg-white px-3 text-sm text-[#142536]"
            >
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="quarter">Last 90 days</option>
              <option value="year">Last 365 days</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        }
      />
      {period === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#e7e2d8] bg-white p-4">
          <label className="text-xs font-semibold text-[#4b5966]">
            From
            <input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block h-10 rounded-xl border border-[#d9dce0] px-3 text-sm text-[#142536]" />
          </label>
          <label className="text-xs font-semibold text-[#4b5966]">
            To
            <input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block h-10 rounded-xl border border-[#d9dce0] px-3 text-sm text-[#142536]" />
          </label>
          <span className="text-xs text-[#5e6872]">Custom ranges are limited to 731 days.</span>
        </div>
      )}
      <ErrorNote error={error} />
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {cards.map(({ label, value, Icon, tone }) => (
              <StatCard key={label} label={label} value={value} Icon={Icon} tone={tone} />
            ))}
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-sm sm:p-5">
              <h2 className="mb-4 font-display font-bold text-[#142536]">Lead generation trend</h2>
              <ColumnChart points={data.trend.map((row) => ({ label: row.date, value: row.value }))} seriesLabel="leads" />
            </section>
            <section className="rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-sm sm:p-5">
              <h2 className="mb-4 font-display font-bold text-[#142536]">Lead conversion</h2>
              <p className="font-display text-4xl font-bold text-[#142536]">{data.leads.conversion_rate}%</p>
              <p className="mt-1 text-sm text-[#5e6872]">{data.leads.converted} converted from {data.leads.total} enquiries in the selected period.</p>
              <div className="mt-5">
                <BarList rows={data.by_status.map((row) => ({ label: row.label.replace(/_/g, " "), value: row.value }))} />
              </div>
            </section>
            <section className="rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-sm sm:p-5">
              <h2 className="mb-4 font-display font-bold text-[#142536]">Customer acquisition sources</h2>
              <BarList rows={data.by_source} />
            </section>
            <section className="rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-sm sm:p-5">
              <h2 className="mb-4 font-display font-bold text-[#142536]">Property demand</h2>
              <BarList rows={data.property_demand} />
            </section>
            <section className="rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-sm sm:p-5 xl:col-span-2">
              <h2 className="mb-4 font-display font-bold text-[#142536]">Sales agent activity</h2>
              {data.agent_performance.length ? (
                <BarList rows={data.agent_performance.map((row) => ({ label: `${row.label} · ${row.converted} converted`, value: row.value }))} valueLabel="leads" />
              ) : (
                <p className="text-sm text-[#5e6872]">No assigned leads in this period.</p>
              )}
            </section>
          </div>
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Sales revenue and deal performance are not shown because this CRM currently has no persisted deal or payment records. No revenue is estimated from enquiries.
          </p>
        </>
      ) : null}
    </div>
  );
}
