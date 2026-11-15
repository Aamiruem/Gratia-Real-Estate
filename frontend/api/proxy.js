// Vercel serverless proxy: https://<site>/api/<path>  ->  BACKEND_URL/<path>
//
// Set BACKEND_URL in Vercel → Project → Settings → Environment Variables,
// e.g. https://gratia-api.onrender.com  (no trailing slash, no /api).
// vercel.json rewrites /api/* to this function. Keeping the API on the same
// origin as the site means session cookies work without cross-site settings.

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "content-encoding",
  "accept-encoding",
]);

async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export default async function handler(req, res) {
  const backend = (process.env.BACKEND_URL || "").trim().replace(/\/+$/, "");
  if (!backend) {
    res.status(503).json({ detail: "The API is not connected yet. Set BACKEND_URL in the Vercel project settings." });
    return;
  }

  const incoming = new URL(req.url, "http://placeholder");
  const path = (incoming.searchParams.get("__path") || "").replace(/^\/+/, "");
  incoming.searchParams.delete("__path");
  const query = incoming.searchParams.toString();
  // Keep the /api prefix: the backend accepts it and scopes cookies to it.
  const target = `${backend}/api/${path}${query ? `?${query}` : ""}`;

  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(name.toLowerCase()) && value !== undefined) headers[name] = Array.isArray(value) ? value.join(", ") : value;
  }
  headers["x-forwarded-host"] = req.headers.host || "";
  headers["x-forwarded-proto"] = "https";

  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: await readBody(req),
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    res.status(502).json({ detail: "The API server did not respond. It may be starting up; please try again in a moment." });
    return;
  }

  res.status(upstream.status);
  upstream.headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (lower !== "set-cookie" && !HOP_BY_HOP.has(lower)) res.setHeader(name, value);
  });
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length) res.setHeader("set-cookie", cookies);
  res.setHeader("cache-control", upstream.headers.get("cache-control") || "no-store");
  res.end(Buffer.from(await upstream.arrayBuffer()));
}
