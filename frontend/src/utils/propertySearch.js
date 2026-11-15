import { projects } from "../data/projects";

// "₹2.85 Cr* onwards" -> 2.85, "₹95 Lakh" -> 0.95, "Price on request" -> null
export function priceInCrore(price) {
  const text = String(price || "").replace(/,/g, "");
  const crore = text.match(/([\d.]+)\s*Cr/i);
  if (crore) return Number(crore[1]);
  const lakh = text.match(/([\d.]+)\s*(?:L\b|Lakh|Lac)/i);
  if (lakh) return Number(lakh[1]) / 100;
  return null;
}

export const BUDGET_RANGES = [
  { id: "under-2", label: "Under ₹2 Cr", min: 0, max: 2 },
  { id: "2-3", label: "₹2 – 3 Cr", min: 2, max: 3 },
  { id: "3-5", label: "₹3 – 5 Cr", min: 3, max: 5 },
  { id: "5-10", label: "₹5 – 10 Cr", min: 5, max: 10 },
  { id: "10-plus", label: "₹10 Cr +", min: 10, max: Infinity },
];

export const PROPERTY_TYPES = [
  { id: "residential", label: "All residential" },
  { id: "apartment", label: "Apartments / flats" },
  { id: "luxury", label: "Luxury homes" },
  { id: "villa", label: "Villas / floors" },
  { id: "plot", label: "Plots" },
  { id: "commercial", label: "Commercial" },
];

export const CONFIGURATIONS = [
  { id: "1", label: "1 BHK" },
  { id: "2", label: "2 BHK" },
  { id: "3", label: "3 BHK" },
  { id: "4", label: "4 BHK" },
  { id: "5", label: "5+ BHK / Penthouse" },
];

// "Sector 32, Sohna, Gurgaon" -> "Sector 32, Sohna"
export const shortLocation = (location) => String(location || "").replace(/,?\s*Gurgaon$/i, "");

export const getLocations = () => [...new Set(projects.map((p) => shortLocation(p.location)).filter(Boolean))].sort(
  (a, b) => (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0),
);

export const isCommercial = (project) =>
  project.category === "commercial" || /commercial|office|retail|shop/.test(String(project.type).toLowerCase());

export function matchesType(project, type) {
  if (!type) return true;
  const kind = String(project.type).toLowerCase();
  const text = `${kind} ${project.configuration || ""} ${project.description || ""}`.toLowerCase();
  if (type === "commercial") return isCommercial(project);
  if (isCommercial(project)) return false;
  if (type === "residential") return true;
  if (type === "villa") return /villa|independent|builder floor/.test(text);
  if (type === "plot") return /\bplots?\b/.test(text);
  if (type === "apartment") return !/villa|\bplots?\b/.test(kind);
  return text.includes(type);
}

// "3, 4 BHK" matches 3 and 4. Listings without a configuration stay visible:
// the advisor confirms the unit mix.
export function matchesConfiguration(project, config) {
  if (!config) return true;
  const text = String(project.configuration || "");
  if (!text.trim()) return true;
  const sizes = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  return config === "5" ? sizes.some((n) => n >= 5) || /penthouse/i.test(text) : sizes.includes(Number(config));
}

export function filterProjects(list, { location = "", budget = "", type = "", config = "", q = "" } = {}) {
  const range = BUDGET_RANGES.find((r) => r.id === budget);
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((project) => {
    if (location && !project.location.toLowerCase().includes(location.toLowerCase())) return false;
    if (range) {
      const price = priceInCrore(project.price);
      // "Price on request" projects stay visible: ask the advisor.
      if (price !== null && (price < range.min || price >= range.max)) return false;
    }
    if (!matchesType(project, type)) return false;
    if (!matchesConfiguration(project, config)) return false;
    if (terms.length) {
      const haystack = [project.name, project.developer, project.location, project.type, project.status, ...(project.highlights || [])]
        .join(" ")
        .toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });
}
