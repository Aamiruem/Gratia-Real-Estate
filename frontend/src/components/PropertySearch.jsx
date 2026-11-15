import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { track } from "../analytics/analytics";
import { Banknote, Building2, MapPin, Search } from "lucide-react";
import { BedDouble } from "lucide-react";
import { BUDGET_RANGES, CONFIGURATIONS, getLocations, PROPERTY_TYPES } from "../utils/propertySearch";

/** Location + budget + property type search that opens the filtered Projects page. */
export default function PropertySearch({ initial = {}, className = "", compact = false }) {
  const navigate = useNavigate();
  const [values, setValues] = useState({
    location: initial.location || "",
    budget: initial.budget || "",
    type: initial.type || "",
    config: initial.config || "",
  });

  const submit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
    track("search", { detail: [values.location, values.budget, values.type, values.config].filter(Boolean).join(" | ") || "all" });
    if (initial.stage) params.set("stage", initial.stage);
    navigate(`/projects${params.toString() ? `?${params}` : ""}#results`);
  };

  const fields = [
    { id: "location", label: "Location", Icon: MapPin, placeholder: "Any location", options: getLocations().map((l) => ({ id: l, label: l })) },
    { id: "budget", label: "Budget", Icon: Banknote, placeholder: "Any budget", options: BUDGET_RANGES },
    { id: "type", label: "Property type", Icon: Building2, placeholder: "Any type", options: PROPERTY_TYPES },
    { id: "config", label: "Configuration", Icon: BedDouble, placeholder: "Any BHK", options: CONFIGURATIONS },
  ];

  return (
    <form
      onSubmit={submit}
      role="search"
      aria-label="Search properties by location, budget and type"
      className={`grid gap-2 rounded-3xl border border-[#e7e2d8] bg-white p-2 shadow-[0_18px_50px_rgba(20,37,54,.10)] sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] ${className}`}
    >
      {fields.map(({ id, label, Icon, placeholder, options }) => (
        <label
          key={id}
          className={`flex items-center gap-3 rounded-2xl px-3 transition focus-within:bg-[#f7f4ed] hover:bg-[#fbfaf7] ${compact ? "py-1.5" : "py-2.5"}`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f3ead8] text-[#80602b]">
            <Icon size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[.14em] text-[#80602b]">{label}</span>
            <select
              value={values[id]}
              onChange={(event) => setValues((current) => ({ ...current, [id]: event.target.value }))}
              className="-ml-1 w-full cursor-pointer border-0 bg-transparent p-0 pl-0.5 text-sm font-semibold text-[#142536] outline-none focus:ring-0"
            >
              <option value="">{placeholder}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        </label>
      ))}
      <button
        type="submit"
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#142536] px-6 sm:col-span-2 lg:col-span-1 text-sm font-bold text-white transition hover:bg-[#c9a45c] hover:text-[#142536]"
      >
        <Search size={17} aria-hidden="true" /> Search
      </button>
    </form>
  );
}
