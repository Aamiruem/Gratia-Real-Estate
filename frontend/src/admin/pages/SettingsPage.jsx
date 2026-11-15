import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { adminApi } from "../api";
import { buttonPrimary, Card, ErrorNote, inputClass, Loading, PageTitle, useLoad } from "../ui";
import { toast } from "../../components/Toaster";

const SOCIAL = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["youtube", "YouTube"],
  ["linkedin", "LinkedIn"],
  ["x", "X (Twitter)"],
  ["google_business", "Google Business Profile"],
];

export default function SettingsPage() {
  const { data, error, loading } = useLoad(() => Promise.all([adminApi.settings(), adminApi.health()]));
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setForm(data[0]);
  }, [data]);

  if (loading && !form) return <Loading />;
  if (!form) return <ErrorNote error={error} />;
  const health = data?.[1];

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      setForm(await adminApi.saveSettings(form));
      toast("Settings saved");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Configuration" title="Website settings" text="Social media links, business hours and the AI assistant. Changes apply to the live website within a couple of minutes." />
      <form onSubmit={save} className="grid gap-6 xl:grid-cols-2">
        <Card title="Social media (shown in the footer)">
          <div className="grid gap-3">
            {SOCIAL.map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs font-bold text-[#142536]">{label}</span>
                <input
                  type="url"
                  placeholder="https://"
                  value={form.social?.[key] || ""}
                  onChange={(e) => setForm({ ...form, social: { ...form.social, [key]: e.target.value } })}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="Business">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[#142536]">Business hours</span>
              <input value={form.business_hours} onChange={(e) => setForm({ ...form, business_hours: e.target.value })} className={inputClass} maxLength={120} />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-bold text-[#142536]">Announcement bar (optional, shown at the top of the site)</span>
              <input value={form.announcement_bar} onChange={(e) => setForm({ ...form, announcement_bar: e.target.value })} className={inputClass} maxLength={200} />
            </label>
          </Card>
          <Card title="AI chat assistant">
            <label className="flex items-start gap-3 text-sm text-[#263746]">
              <input type="checkbox" checked={form.ai_assistant_enabled} onChange={(e) => setForm({ ...form, ai_assistant_enabled: e.target.checked })} className="mt-0.5 size-4 accent-[#142536]" />
              <span>
                Use the AI assistant (ChatGPT / OpenAI) in the website chat. It answers only from your published listings and contact details.
                Requires OPENAI_API_KEY on the backend; otherwise the chat uses its built-in answers.
              </span>
            </label>
          </Card>
          <Card title="System status">
            <p className="text-sm text-[#263746]">
              Database: <strong>{health?.database}</strong> · Email codes: <strong>{health?.otp?.email}</strong> · SMS codes: <strong>{health?.otp?.sms}</strong>
            </p>
          </Card>
          <button type="submit" disabled={saving} className={buttonPrimary}>
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Save settings
          </button>
        </div>
      </form>
    </div>
  );
}
