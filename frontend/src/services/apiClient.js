// Every API call goes to "/api" on the same site as the page:
//   - local dev:   Vite proxies /api -> http://127.0.0.1:8000 (vite.config.js)
//   - Vercel:      api/proxy.js forwards /api -> BACKEND_URL
//   - VPS/Docker:  Caddy forwards /api -> the api container (Caddyfile)
// Same-origin calls mean no CORS problems and cookies "just work".
// Set VITE_API_URL only to call a backend on another origin directly.
const apiUrl = (import.meta.env.VITE_API_URL || "/api").trim().replace(/\/+$/, "");

export const backendUrl = apiUrl;

function errorMessageFor(status, data) {
  const detail = data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(", ");
  if (typeof detail === "string") return detail;
  if (status === 404) return "The server is not reachable at this address (404). Check the API proxy settings.";
  if (status === 502 || status === 503 || status === 504)
    return "The server is temporarily unavailable. Please try again in a minute.";
  return `Request failed (${status}).`;
}

export async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Accept: "application/json",
        // CSRF protection: the API refuses signed-in writes without this header.
        "X-Requested-With": "fetch",
        ...options.headers,
      },
    });
  } catch {
    const error = new Error(
      import.meta.env.DEV
        ? 'Cannot reach the backend. Start it with start-backend.bat (or "uvicorn app.main:app --reload --port 8000" in /backend), then try again.'
        : "We couldn't reach the server. Check your connection and try again.",
    );
    error.status = 0;
    throw error;
  }

  if (response.status === 204) return null;

  let data = null;
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  if (isJson) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  // An HTML page instead of JSON means the request never reached the API
  // (e.g. the host served index.html because /api is not proxied).
  if (response.ok && !isJson) {
    const error = new Error("The API is not connected on this site. Check the /api proxy configuration.");
    error.status = 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(errorMessageFor(response.status, data));
    error.status = response.status;
    throw error;
  }

  return data;
}
