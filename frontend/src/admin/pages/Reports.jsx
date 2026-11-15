import { useState } from "react";
import { Download } from "lucide-react";
import { adminApi } from "../api";
import { BarList, buttonSecondary, Card, ErrorNote, Loading, PageTitle, StatCard, useLoad } from "../ui";
import { leadsAdminApi } from "../../services/leadsApi";

const RANGES = [30, 90, 365];
const rows = (list) => list.map((r) => ({ label: String(r.key).replace("_", " "), value: r.count }));

export default function Reports() {
  const [days, setDays] = useState(90);
  const { data, error, loading } = useLoad(() => adminApi.reports(days), [days]);

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Reports"
        title="Enquiry reports"
        text="Which properties, sources and requirements bring enquiries, and how many convert."
        actions={
          <>
            <div className="flex rounded-full border border-[#e7e2d8] bg-white p-1" role="tablist" aria-label="Date range">
              {RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  role="tab"
                  aria-selected={days === range}
                  onClick={() => setDays(range)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${days === range ? "bg-[#142536] text-white" : "text-[#4b5966]"}`}
                >
                  {range === 365 ? "1 year" : `${range} days`}
                </button>
              ))}
            </div>
            <a href={leadsAdminApi.exportUrl()} className={buttonSecondary}>
              <Download size={15} aria-hidden="true" /> Export all leads (CSV / Excel)
            </a>
          </>
        }
      />
      <ErrorNote error={error} />
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Enquiries" value={data.total} />
            <StatCard label="Converted" value={data.converted} />
            <StatCard label="Conversion rate" value={`${data.conversion_rate}%`} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Enquiries by property">
              <BarList rows={rows(data.by_property)} />
            </Card>
            <Card title="Enquiries by month">
              <BarList rows={data.monthly.map((m) => ({ label: m.month, value: m.count }))} />
            </Card>
            <Card title="By form / enquiry type">
              <BarList rows={rows(data.by_kind)} />
            </Card>
            <Card title="By status">
              <BarList rows={rows(data.by_status)} />
            </Card>
            <Card title="By lead source">
              <BarList rows={rows(data.by_source)} />
            </Card>
            <Card title="By requirement (buy / sell / rent / invest)">
              <BarList rows={rows(data.by_requirement)} />
            </Card>
            <Card title="By budget">
              <BarList rows={rows(data.by_budget)} />
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
