import { useSyncExternalStore } from "react";
import { apiRequest } from "../services/apiClient";
import { projects } from "./projects";

/*
 * Live property listings.
 *
 * The site renders immediately with the listings bundled in data/projects.js
 * (also used for search-engine pages at build time). Once the backend answers,
 * the same `projects` array is refreshed in place with what is published in
 * the admin panel, so every page that imports it shows the live data.
 */

let version = 0;
const listeners = new Set();

function normalize(item) {
  return {
    slug: item.slug,
    name: item.name,
    developer: item.developer || "",
    location: item.location,
    category: item.category || "residential",
    type: item.type || "Residential",
    configuration: item.configuration || "",
    status: item.status || "",
    availability: item.availability || "available",
    price: item.price || "Price on request",
    priceMinCr: item.price_min_cr ?? null,
    offer: item.offer || "",
    image: item.image || "",
    gallery: Array.isArray(item.gallery) ? item.gallery : [],
    description: item.description || "",
    highlights: Array.isArray(item.highlights) ? item.highlights : [],
    seoTitle: item.seo_title || "",
    seoDescription: item.seo_description || "",
    featured: Boolean(item.featured),
    updatedAt: item.updated_at,
  };
}

let loading = null;

export function loadLiveProperties() {
  loading =
    loading ??
    apiRequest("/properties")
      .then((items) => {
        if (!Array.isArray(items) || !items.length) return;
        projects.splice(0, projects.length, ...items.map(normalize));
        version += 1;
        listeners.forEach((listener) => listener());
      })
      .catch(() => {
        // Backend unreachable: keep the bundled listings.
      });
  return loading;
}

/** Forces a reload (used by the admin panel after editing listings). */
export function reloadLiveProperties() {
  loading = null;
  return loadLiveProperties();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the caller when live listings arrive. Returns a version number. */
export function usePropertiesVersion() {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

export const AVAILABILITY_LABELS = { available: "Available", limited: "Limited units", sold_out: "Sold out" };

/** Featured listings: those marked featured in the admin panel, else the first ones. */
export function featuredProjects(limit = 8) {
  const marked = projects.filter((p) => p.featured);
  return (marked.length ? marked : projects).slice(0, limit);
}
