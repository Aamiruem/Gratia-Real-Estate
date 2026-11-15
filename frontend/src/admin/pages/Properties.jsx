import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { adminApi } from "../api";
import { buttonPrimary, buttonSecondary, Card, Empty, ErrorNote, inputClass, Loading, PageTitle, useLoad } from "../ui";
import { toast } from "../../components/Toaster";
import { reloadLiveProperties } from "../../data/liveProperties";

const STATUSES = ["Pre-Launch / New Launch", "Launched", "Under Development", "Ready to Move"];
const BLANK = {
  slug: "",
  name: "",
  developer: "",
  location: "",
  category: "residential",
  type: "Residential",
  configuration: "",
  status: "Launched",
  availability: "available",
  price: "Price on request",
  price_min_cr: "",
  offer: "",
  image: "",
  gallery: "",
  description: "",
  highlights: "",
  seo_title: "",
  seo_description: "",
  featured: false,
  published: false,
  sort_order: 0,
};

const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function toForm(p) {
  return { ...BLANK, ...p, price_min_cr: p.price_min_cr ?? "", gallery: (p.gallery || []).join("\n"), highlights: (p.highlights || []).join("\n") };
}

function toBody(form) {
  const lines = (text) => text.split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    ...form,
    price_min_cr: form.price_min_cr === "" ? null : Number(form.price_min_cr),
    gallery: lines(form.gallery),
    highlights: lines(form.highlights),
    sort_order: Number(form.sort_order) || 0,
  };
}

export default function Properties({ role }) {
  const canEdit = role === "owner" || role === "admin";
  const { data, error, loading, reload } = useLoad(() => adminApi.properties());
  const [editing, setEditing] = useState(null); // null | "new" | property

  const afterChange = (message) => {
    toast(message);
    setEditing(null);
    reload();
    reloadLiveProperties();
  };

  const quick = async (property, changes, message) => {
    try {
      await adminApi.updateProperty(property.id, toBody({ ...toForm(property), ...changes }));
      afterChange(message);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const remove = async (property) => {
    if (!window.confirm?.(`Delete ${property.name}? This cannot be undone. (Tip: unpublish instead to hide it.)`)) return;
    try {
      await adminApi.deleteProperty(property.id);
      afterChange("Property deleted");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Listings"
        title="Properties"
        text="Add, edit, publish and unpublish listings. Publishing, price, availability and offer changes notify visitors automatically."
        actions={
          canEdit && (
            <button type="button" className={buttonPrimary} onClick={() => setEditing("new")}>
              <Plus size={15} aria-hidden="true" /> Add property
            </button>
          )
        }
      />
      <ErrorNote error={error} />
      {editing && <Editor initial={editing === "new" ? BLANK : toForm(editing)} id={editing === "new" ? null : editing.id} onClose={() => setEditing(null)} onSaved={afterChange} />}
      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <Empty>No properties yet. Add your first listing.</Empty>
      ) : (
        <ul className="grid gap-3">
          {data.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 rounded-2xl border border-[#e7e2d8] bg-white p-3 shadow-sm sm:flex-row sm:items-center">
              {p.image ? <img src={p.image} alt="" loading="lazy" className="h-20 w-full rounded-xl object-cover sm:w-32" /> : <div className="h-20 w-32 rounded-xl bg-[#f3f1ec]" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-[#142536]">{p.name}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.published ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                    {p.published ? "Published" : "Draft"}
                  </span>
                  {p.featured && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">Featured</span>}
                  <span className="rounded-full bg-[#f3ead8] px-2 py-0.5 text-[11px] font-bold capitalize text-[#80602b]">{p.category}</span>
                </div>
                <p className="mt-0.5 text-sm text-[#4b5966]">
                  {p.location} · {p.status} · {p.price}
                  {p.configuration ? ` · ${p.configuration}` : ""}
                </p>
                {p.offer && <p className="text-xs font-semibold text-rose-700">Offer: {p.offer}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.published && (
                  <Link to={`/projects/${p.slug}`} target="_blank" className={buttonSecondary} aria-label={`View ${p.name} on the website`}>
                    View
                  </Link>
                )}
                {canEdit && (
                  <>
                    <button type="button" className={buttonSecondary} onClick={() => setEditing(p)}>
                      <Pencil size={14} aria-hidden="true" /> Edit
                    </button>
                    <button type="button" className={buttonSecondary} onClick={() => quick(p, { published: !p.published }, p.published ? "Unpublished" : "Published")}>
                      {p.published ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                      {p.published ? "Unpublish" : "Publish"}
                    </button>
                    <button type="button" className={buttonSecondary} onClick={() => quick(p, { featured: !p.featured }, p.featured ? "Removed from featured" : "Marked as featured")} aria-label={p.featured ? "Remove from featured" : "Mark as featured"}>
                      <Star size={14} className={p.featured ? "fill-amber-400 text-amber-500" : ""} aria-hidden="true" />
                    </button>
                    <button type="button" className={`${buttonSecondary} hover:!border-rose-300 hover:!text-rose-700`} onClick={() => remove(p)} aria-label={`Delete ${p.name}`}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Editor({ initial, id, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "name" && !id && (!current.slug || current.slug === slugify(current.name)) ? { slug: slugify(value) } : {}),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (id) await adminApi.updateProperty(id, toBody(form));
      else await adminApi.createProperty(toBody(form));
      onSaved(id ? "Property saved" : "Property added");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (label, name, props = {}) => (
    <label className={`block ${props.wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-bold text-[#142536]">{label}</span>
      {props.textarea ? (
        <textarea value={form[name]} onChange={set(name)} rows={props.rows || 3} className={`${inputClass} !h-auto py-2.5`} placeholder={props.placeholder} />
      ) : props.options ? (
        <select value={form[name]} onChange={set(name)} className={inputClass}>
          {props.options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      ) : (
        <input value={form[name]} onChange={set(name)} className={inputClass} type={props.type || "text"} step={props.step} required={props.required} placeholder={props.placeholder} />
      )}
      {props.hint && <span className="mt-1 block text-[11px] text-[#5e6872]">{props.hint}</span>}
    </label>
  );

  return (
    <Card title={id ? `Edit: ${initial.name}` : "Add a property"} action={<button type="button" onClick={onClose} aria-label="Close editor" className="grid size-8 place-items-center rounded-full hover:bg-[#f3f1ec]"><X size={16} aria-hidden="true" /></button>}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {field("Name *", "name", { required: true })}
        {field("Web address (slug) *", "slug", { required: true, hint: "Lowercase and hyphens, e.g. dlf-privana-north → /projects/dlf-privana-north" })}
        {field("Developer", "developer")}
        {field("Location *", "location", { required: true, placeholder: "e.g. Sector 76, Gurgaon" })}
        {field("Category", "category", { options: [["residential", "Residential"], ["commercial", "Commercial"]] })}
        {field("Property type", "type", { placeholder: "e.g. Luxury Residential, Villa, Office, Retail" })}
        {field("Configuration", "configuration", { placeholder: "e.g. 3, 4 BHK" })}
        {field("Construction status", "status", { options: STATUSES.map((s) => [s, s]) })}
        {field("Availability", "availability", { options: [["available", "Available"], ["limited", "Limited units"], ["sold_out", "Sold out"]] })}
        {field("Price (as shown)", "price", { placeholder: "₹2.85 Cr* onwards" })}
        {field("Starting price in crore (for budget search)", "price_min_cr", { type: "number", step: "0.01", placeholder: "2.85" })}
        {field("Current offer", "offer", { placeholder: "Leave empty if none" })}
        {field("Main image URL", "image", { wide: true, hint: "https:// image address. Use a real photo of this project." })}
        {field("Gallery image URLs (one per line)", "gallery", { textarea: true, wide: true })}
        {field("Description", "description", { textarea: true, rows: 5, wide: true })}
        {field("Highlights (one per line)", "highlights", { textarea: true, wide: true })}
        {field("SEO title (optional)", "seo_title", { hint: "Up to ~60 characters. Default: name + location." })}
        {field("SEO description (optional)", "seo_description", { hint: "Up to ~155 characters." })}
        {field("Sort order", "sort_order", { type: "number", hint: "Lower numbers appear first." })}
        <div className="flex flex-wrap items-center gap-5 pt-6">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#142536]">
            <input type="checkbox" checked={form.published} onChange={set("published")} className="size-4 accent-[#142536]" /> Published
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#142536]">
            <input type="checkbox" checked={form.featured} onChange={set("featured")} className="size-4 accent-[#142536]" /> Featured on home page
          </label>
        </div>
        <div className="sm:col-span-2">
          <ErrorNote error={error} />
          <div className="mt-2 flex gap-2">
            <button type="submit" disabled={saving} className={buttonPrimary}>
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {id ? "Save changes" : "Add property"}
            </button>
            <button type="button" onClick={onClose} className={buttonSecondary}>
              Cancel
            </button>
          </div>
        </div>
      </form>
    </Card>
  );
}
