import { useState } from "react";
import { UserPlus } from "lucide-react";
import { adminApi } from "../api";
import { buttonPrimary, buttonSecondary, Card, ErrorNote, inputClass, Loading, PageTitle, useLoad } from "../ui";
import { toast } from "../../components/Toaster";

const ROLE_HELP = {
  owner: "Everything",
  admin: "Everything except changing the owner or other admins",
  agent: "Leads, customers, follow-ups, notifications, reports",
};

export default function Team({ role }) {
  const { data, error, loading, reload } = useLoad(() => adminApi.team());
  const [form, setForm] = useState({ name: "", email: "", role: "agent" });
  const [saving, setSaving] = useState(false);

  const add = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await adminApi.addMember(form);
      toast(`${form.name} added. They sign in with a code sent to ${form.email}.`);
      setForm({ name: "", email: "", role: "agent" });
      reload();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const update = async (member, changes) => {
    try {
      await adminApi.updateMember(member.id, changes);
      toast("Saved");
      reload();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Access" title="Users & team" text="Team members sign in at the private sign-in page with a one-time code sent to their email. No passwords to share." />
      <ErrorNote error={error} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card title="Team members">
          {loading && !data ? (
            <Loading />
          ) : (
            <ul className="divide-y divide-[#efebe3]">
              {(data || []).map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#142536]">
                      {m.name} {!m.is_active && <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">Inactive</span>}
                    </p>
                    <p className="text-sm text-[#4b5966]">{m.email}</p>
                    <p className="text-xs text-[#5e6872]">{ROLE_HELP[m.role]}</p>
                  </div>
                  {m.role === "owner" ? (
                    <span className="rounded-full bg-[#f3ead8] px-3 py-1 text-xs font-bold text-[#80602b]">Owner</span>
                  ) : (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => update(m, { role: e.target.value })}
                        disabled={role !== "owner" && m.role === "admin"}
                        aria-label={`Role for ${m.name}`}
                        className="rounded-full border border-[#d9dce0] px-3 py-1.5 text-xs font-bold"
                      >
                        <option value="agent">Agent</option>
                        {role === "owner" && <option value="admin">Admin</option>}
                        {role !== "owner" && m.role === "admin" && <option value="admin">Admin</option>}
                      </select>
                      <button type="button" className={buttonSecondary} onClick={() => update(m, { is_active: !m.is_active })}>
                        {m.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Add a team member">
          <form onSubmit={add} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[#142536]">Full name</span>
              <input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[#142536]">Work email</span>
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[#142536]">Role</span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputClass}>
                <option value="agent">Agent: works leads</option>
                {role === "owner" && <option value="admin">Admin: manages the website</option>}
              </select>
            </label>
            <button type="submit" disabled={saving} className={buttonPrimary}>
              <UserPlus size={15} aria-hidden="true" /> Add member
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
