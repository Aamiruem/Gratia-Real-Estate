import { useState } from "react";
import { UserPlus } from "lucide-react";
import { adminApi } from "../api";
import { buttonPrimary, buttonSecondary, Card, ErrorNote, inputClass, Loading, PageTitle, useLoad } from "../ui";
import { toast } from "../../components/Toaster";
import { PasswordField, StrengthList, passwordChecks } from "../../components/auth/PasswordSignIn";

const ROLE_HELP = {
  owner: "Everything",
  admin: "Everything except changing the owner or other admins",
  agent: "Leads, customers, follow-ups, notifications, reports",
};

export default function Team({ role }) {
  const { data, error, loading, reload } = useLoad(() => adminApi.team());
  const [form, setForm] = useState({ name: "", email: "", role: "agent", password: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);

  const add = async (event) => {
    event.preventDefault();
    if (form.password && form.password !== form.confirmPassword) {
      toast("The passwords don't match.", "error");
      return;
    }
    if (form.password && !passwordChecks(form.password, form.email).every((check) => check.ok)) {
      toast("Choose a stronger password using the checklist.", "error");
      return;
    }
    setSaving(true);
    try {
      const { confirmPassword, ...member } = form;
      if (!member.password) delete member.password;
      await adminApi.addMember(member);
      toast(form.password ? `${form.name} added. They can sign in with their email and password.` : `${form.name} added. They can sign in with a code sent to ${form.email}.`);
      setForm({ name: "", email: "", role: "agent", password: "", confirmPassword: "" });
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
      <PageTitle
        eyebrow="Access"
        title="Users & team"
        text="Create a staff account with its work email. Set a password for immediate email/password sign-in, or leave it blank for one-time code onboarding."
      />
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
        <Card title="Create a staff account">
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
            <div className="space-y-3 border-t border-[#efebe3] pt-3">
              <p className="text-xs leading-5 text-[#5e6872]">Set a password now for email/password sign-in, or leave it blank so the member can start with a one-time email code.</p>
              <PasswordField id="new-member-password" label="Password (optional)" value={form.password} onChange={(password) => setForm({ ...form, password })} autoComplete="new-password" />
              {form.password && <StrengthList password={form.password} email={form.email} />}
              {form.password && <PasswordField id="new-member-confirm-password" label="Confirm password" value={form.confirmPassword} onChange={(confirmPassword) => setForm({ ...form, confirmPassword })} autoComplete="new-password" />}
            </div>
            <button type="submit" disabled={saving} className={buttonPrimary}>
              <UserPlus size={15} aria-hidden="true" /> Add member
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
