import { useEffect, useState } from "react";
import { apiRequest } from "../services/apiClient";

// Public website settings from Admin -> Settings (social links, hours,
// announcement bar). Loaded once and shared.
let cached = null;
let pending = null;

export default function useSiteSettings() {
  const [settings, setSettings] = useState(cached);
  useEffect(() => {
    if (cached) return undefined;
    let active = true;
    pending = pending ?? apiRequest("/settings/public").then((data) => (cached = data), () => null);
    pending.then((data) => active && data && setSettings(data));
    return () => {
      active = false;
    };
  }, []);
  return settings;
}
