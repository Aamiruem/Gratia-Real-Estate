import { useState } from "react";
import { Eye, MousePointerClick, Repeat, Target, Users } from "lucide-react";
import { adminApi } from "../api";
import { BarList, Card, DailyColumns, ErrorNote, Loading, PageTitle, StatCard, useLoad } from "../ui";
import { projects } from "../../data/projects";

const RANGES = [7, 30, 90, 365];
const SOURCE_LABELS = {
  organic: "Organic search",
  direct: "Direct",
  social: "Social media",
  referral: "Other websites",
  paid: "Paid ads",
  email: "Email",
  whatsapp: "WhatsApp",
  app: "Installed app",
  unknown: "Unknown",
};
const INTERACTIONS = {
  property_view: "Property page views",
  search: "Property searches",
  enquiry_click: "Enquiry button clicks",
  lead_submit: "Form submissions",
  whatsapp_click: "WhatsApp clicks",
  call_click: "Phone call clicks",
  email_click: "Email clicks",
  share: "Shares",
  install_click: "Install app clicks",
  app_install: "App installs",
  notification_optin: "Alert sign-ups",
};

const propertyName = (slug) => projects.find((p) => p.slug === slug)?.name || slug;

export default function Analytics() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useLoad(() => adminApi.analytics(days), [days]);

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Website analytics"
        title="Analytics & traffic sources"
        text="First-party analytics from visitors who accepted cookies. No personal details are stored. Google Analytics 4 shows full traffic if configured."
        actions={
          <div className="flex rounded-full border border-[#e7e2d8] bg-white p-1" role="tablist" aria-label="Date range">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                role="tab"
                aria-selected={days === range}
                onClick={() => setDays(range)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${days === range ? "bg-[#142536] text-white" : "text-[#4b5966] hover:text-[#142536]"}`}
              >
                {range === 365 ? "1 year" : `${range} days`}
              </button>
            ))}
          </div>
        }
      />
      <ErrorNote error={error} />
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Visitors" value={data.totals.visitors} Icon={Users} tone="bg-sky-100 text-sky-700" />
            <StatCard label="Sessions" value={data.totals.sessions} Icon={Repeat} tone="bg-indigo-100 text-indigo-700" />
            <StatCard label="Page views" value={data.totals.page_views} Icon={Eye} tone="bg-slate-100 text-slate-700" />
            <StatCard label="Enquiries" value={data.totals.leads} Icon={MousePointerClick} tone="bg-amber-100 text-amber-800" />
            <StatCard label="Enquiries per session" value={`${data.totals.conversion_rate}%`} Icon={Target} tone="bg-emerald-100 text-emerald-700" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Visitors per day">
              <DailyColumns rows={data.trend.map((d) => ({ date: d.date, value: d.visitors }))} label="Visitors" />
            </Card>
            <Card title="Enquiries per day">
              <DailyColumns rows={data.trend.map((d) => ({ date: d.date, value: d.leads }))} label="Enquiries" />
            </Card>
            <Card title="Traffic sources (sessions)">
              <BarList rows={data.sources.map((s) => ({ label: SOURCE_LABELS[s.source] || s.source, value: s.sessions }))} valueLabel="sessions" />
            </Card>
            <Card title="Lead sources (enquiries)">
              <BarList rows={data.lead_sources.map((s) => ({ label: SOURCE_LABELS[s.source] || s.source, value: s.leads }))} valueLabel="enquiries" />
            </Card>
            <Card title="Popular properties">
              <BarList rows={data.top_properties.map((p) => ({ label: propertyName(p.slug), value: p.views }))} valueLabel="views" />
            </Card>
            <Card title="Top pages">
              <BarList rows={data.top_pages.map((p) => ({ label: p.path, value: p.views }))} valueLabel="views" />
            </Card>
            <Card title="Interactions">
              <BarList
                rows={Object.entries(INTERACTIONS)
                  .map(([key, label]) => ({ label, value: data.interactions[key] || 0 }))
                  .filter((row) => row.value)}
                empty="No interactions recorded yet."
              />
            </Card>
            <Card title="Referring websites & searches">
              <BarList rows={data.referrers.map((r) => ({ label: r.host, value: r.sessions }))} valueLabel="sessions" empty="No referring websites yet." />
              <div className="mt-5">
                <BarList rows={data.searches.map((s) => ({ label: s.query, value: s.count }))} valueLabel="searches" empty="No searches yet." />
              </div>
            </Card>
          </div>
          <p className="text-xs text-[#5e6872]">
            Devices: {Object.entries(data.devices).map(([d, n]) => `${d} ${n}`).join(" · ") || "–"}
          </p>
        </>
      ) : null}
    </div>
  );
}
