// Vercel serverless proxy: https://<site>/api/<path>  ->  BACKEND_URL/<path>
//
// Set BACKEND_URL in Vercel → Project → Settings → Environment Variables,
// e.g. https://gratia-api.onrender.com  (no trailing slash, no /api).
// vercel.json rewrites /api/* to this function. Keeping the API on the same
// origin as the site means session cookies work without cross-site settings.

import videoBlobUpload from "./video-blob-upload.js";
import videoBlobDelete from "./video-blob-delete.js";

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
  const incoming = new URL(req.url, "http://placeholder");
  const path = (incoming.searchParams.get("__path") || "").replace(/^\/+/, "");
  let body = req.body;
  let rawBody;
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    rawBody = body;
    try {
      body = JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : body);
    } catch {
      body = null;
    }
  }
  if ((!body || typeof body !== "object") && req.method !== "GET" && req.method !== "HEAD") {
    rawBody ||= await readBody(req);
    if (rawBody) {
      try {
        body = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody));
      } catch {
        body = null;
      }
    }
  }

  // These requests use the same-origin proxy rewrite, so dispatch them to the
  // Blob handlers here instead of forwarding them to the application API.
  if (path === "video-blob-upload" || String(body?.type || "").startsWith("blob.")) {
    if (!body || typeof body !== "object") {
      res.status(400).json({ detail: "The upload request body must be valid JSON." });
      return;
    }
    req.body = body;
    await videoBlobUpload(req, res);
    return;
  }
  if (path === "video-blob-delete" || (typeof body?.url === "string" && body.url.includes(".public.blob.vercel-storage.com/project-videos/"))) {
    if (!body || typeof body !== "object") {
      res.status(400).json({ detail: "The delete request body must be valid JSON." });
      return;
    }
    req.body = body;
    await videoBlobDelete(req, res);
    return;
  }

  const backend = (process.env.BACKEND_URL || "").trim().replace(/\/+$/, "");
  if (!backend) {
    res.status(503).json({ detail: "The API is not connected yet. Set BACKEND_URL in the Vercel project settings." });
    return;
  }

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
  const requestBody = req.method === "GET" || req.method === "HEAD"
    ? undefined
    : rawBody ?? (body && typeof body === "object" ? JSON.stringify(body) : undefined);

  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: requestBody,
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    let backendHost = "invalid-backend-url";
    try {
      backendHost = new URL(backend).host;
    } catch {
      // Keep malformed or secret-like values out of the public error response.
    }
    console.error("Backend proxy request failed", {
      method: req.method,
      path,
      backendHost,
      error: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown fetch error",
      cause: error?.cause instanceof Error
        ? `${error.cause.name}: ${error.cause.message}${error.cause.code ? ` (${error.cause.code})` : ""}`
        : undefined,
    });
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
