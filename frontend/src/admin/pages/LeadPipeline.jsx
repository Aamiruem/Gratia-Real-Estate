import { useState } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";
import { toast } from "../../components/Toaster";
import { leadsAdminApi } from "../../services/leadsApi";
import { adminApi } from "../api";
import { ErrorNote, Loading, PageTitle, useAdminData } from "../ui";

const STAGES = [
  { id: "new", label: "New lead" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "interested", label: "Interested" },
  { id: "site_visit_scheduled", label: "Site visit scheduled" },
  { id: "site_visit_completed", label: "Site visit completed" },
  { id: "negotiation", label: "Negotiation" },
  { id: "booking", label: "Booking" },
  { id: "converted", label: "Converted / won" },
  { id: "lost", label: "Lost" },
];
const APPOINTMENTS = new Set(["visit", "consultation"]);
const CLOSED = new Set(["lost", "not_interested", "closed", "cancelled", "no_show"]);
const inputClass = "rounded-lg border border-[#d9dce0] bg-white px-2 py-1.5 text-xs font-semibold text-[#142536]";

function stageOf(status) {
  if (CLOSED.has(status)) return "lost";
  if (status === "completed") return "site_visit_completed";
  return STAGES.some((stage) => stage.id === status) ? status : "new";
}

export default function LeadPipeline() {
  const [refresh, setRefresh] = useState(0);
  const [moving, setMoving] = useState("");
  const [dragged, setDragged] = useState("");
  const { data, error, loading, reload } = useAdminData(
    async () => {
      const [list, team] = await Promise.all([
        leadsAdminApi.list({ limit: 200, sort: "updated" }),
        adminApi.team(),
      ]);
      return { leads: list.items.filter((lead) => !APPOINTMENTS.has(lead.kind)), team };
    },
    [refresh],
  );
  const agentNames = new Map((data?.team ?? []).map((member) => [member.id, member.name]));

  const moveLead = async (lead, stage) => {
    const nextStatus = stage === "lost" ? "lost" : stage;
    if (stageOf(lead.status) === stage || moving) return;
    setMoving(lead.reference);
    try {
      await leadsAdminApi.update(lead.reference, { status: nextStatus });
      toast(`Lead moved to ${STAGES.find((item) => item.id === stage)?.label ?? stage}`);
      await reload();
    } catch (moveError) {
      toast(moveError.message || "Could not update the lead stage.", "error");
    } finally {
      setMoving("");
      setDragged("");
    }
  };

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="CRM"
        title="Lead pipeline"
        text="Move leads through the sales stages. Each change is saved immediately and recorded in the existing audit history."
        actions={
          <button type="button" className="inline-flex items-center gap-2 rounded-full border border-[#d9d2c3] bg-white px-4 py-2.5 text-xs font-bold text-[#142536]" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" /> Refresh
          </button>
        }
      />
      <ErrorNote error={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <>
          {data?.leads.length === 200 && (
            <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Showing the 200 most recently updated leads. Use the Leads section to search or export the full list.
            </p>
          )}
          <div className="flex gap-3 overflow-x-auto pb-3">
            {STAGES.map((stage) => {
              const stageLeads = (data?.leads ?? []).filter((lead) => stageOf(lead.status) === stage.id);
              return (
                <section
                  key={stage.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const lead = data?.leads.find((item) => item.reference === (dragged || event.dataTransfer.getData("text/plain")));
                    if (lead) moveLead(lead, stage.id);
                  }}
                  className={`w-[280px] shrink-0 rounded-2xl border p-3 transition ${dragged ? "border-[#c9a45c] bg-[#fbf8f0]" : "border-[#e7e2d8] bg-[#f7f4ed]"}`}
                >
                  <div className="flex items-center justify-between gap-2 px-1 pb-3">
                    <h2 className="text-sm font-bold text-[#142536]">{stage.label}</h2>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#80602b]">{stageLeads.length}</span>
                  </div>
                  <ul className="space-y-2">
                    {stageLeads.map((lead) => (
                      <li
                        key={lead.reference}
                        draggable={!moving}
                        onDragStart={(event) => {
                          setDragged(lead.reference);
                          event.dataTransfer.setData("text/plain", lead.reference);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDragged("")}
                        className={`rounded-xl border bg-white p-3 shadow-sm ${dragged === lead.reference ? "opacity-50" : "border-[#eee9df]"}`}
                      >
                        <a href={`/admin/leads?lead=${encodeURIComponent(lead.reference)}`} className="font-semibold text-[#142536] hover:underline">
                          {lead.name}
                        </a>
                        <p className="mt-1 text-xs text-[#80602b]">{lead.property_name || "Property not specified"}</p>
                        <p className="mt-1 text-xs text-[#5e6872]">{lead.budget || "Budget not specified"} · {lead.location || "Location not specified"}</p>
                        <p className="mt-2 text-xs text-[#5e6872]">
                          Owner: {agentNames.get(lead.assigned_to_id) || "Unassigned"}
                        </p>
                        {lead.follow_up_at && (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#5e6872]">
                            <CalendarClock size={12} aria-hidden="true" /> {new Date(lead.follow_up_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                          </p>
                        )}
                        <label className="mt-3 block text-[11px] font-semibold text-[#5e6872]">
                          Move stage
                          <select
                            aria-label={`Move ${lead.name} to a different stage`}
                            value={stage.id}
                            disabled={Boolean(moving)}
                            onChange={(event) => moveLead(lead, event.target.value)}
                            className={`${inputClass} mt-1 w-full`}
                          >
                            {STAGES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                          </select>
                        </label>
                        {moving === lead.reference && <p className="mt-2 text-xs text-[#80602b]" role="status">Saving stage…</p>}
                      </li>
                    ))}
                    {!stageLeads.length && <li className="rounded-xl border border-dashed border-[#d9d2c3] px-3 py-5 text-center text-xs text-[#68737e]">Drop a lead here</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
