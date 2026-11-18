import { useEffect, useState } from "react";
import { authApi } from "../services/authApi";
import { SESSION_EXPIRED_EVENT } from "../services/apiClient";

// Shared "is the signed-in user the video owner?" state for the whole site.
// Pages announce sign-in / sign-out with notifyAuthChanged() so the header
// updates immediately.
const EVENT = "gratia-auth-changed";
let cached = null; // { checked, isOwner, user }
let inflight = null;
let sessionExpired = false;

async function check() {
  try {
    const session = await authApi.restoreSession();
    const role = session?.role ?? (session?.is_video_admin ? "owner" : null);
    cached = {
      checked: true,
      isOwner: session?.is_video_admin === true,
      // Owner, admin or agent: may open the admin panel.
      isStaff: Boolean(role),
      role,
      user: session?.user ?? null,
    };
  } catch {
    cached = { checked: true, isOwner: false, isStaff: false, role: null, user: null };
  }
  return cached;
}

export function notifyAuthChanged() {
  sessionExpired = false;
  cached = null;
  inflight = null;
  window.dispatchEvent(new Event(EVENT));
}

export default function useOwner() {
  const [state, setState] = useState(cached ?? { checked: false, isOwner: false, isStaff: false, role: null, user: null });

  useEffect(() => {
    let active = true;
    const refresh = () => {
      inflight = inflight ?? check();
      inflight.then((result) => active && setState(result));
    };
    const expireSession = () => {
      if (sessionExpired) return;
      sessionExpired = true;
      cached = null;
      inflight = null;
      refresh();
    };
    if (!cached) refresh();
    window.addEventListener(EVENT, refresh);
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    return () => {
      active = false;
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
    };
  }, []);

  return state;
}
