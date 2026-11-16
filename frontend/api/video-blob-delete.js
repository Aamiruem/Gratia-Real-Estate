import { del } from "@vercel/blob";

async function requireVideoAdmin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host || new URL(origin).host.toLowerCase() !== host.toLowerCase() || req.headers["x-requested-with"] !== "fetch") {
    const error = new Error("The delete request could not be verified.");
    error.statusCode = 403;
    throw error;
  }
  const backend = (process.env.BACKEND_URL || "").trim().replace(/\/+$/, "");
  if (!backend) {
    const error = new Error("Video storage is not connected to the API.");
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch(`${backend}/api/auth/me`, {
    headers: { cookie: req.headers.cookie || "", accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const session = response.ok ? await response.json() : null;
  if (!session?.is_video_admin) {
    const error = new Error("Sign in as the video administrator to delete stored videos.");
    error.statusCode = response.status === 401 ? 401 : 403;
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ detail: "Method not allowed." });
    return;
  }
  try {
    await requireVideoAdmin(req);
    const url = new URL(req.body?.url || "");
    if (!url.hostname.endsWith(".public.blob.vercel-storage.com") || !url.pathname.startsWith("/project-videos/")) {
      res.status(400).json({ detail: "That video is not in the Gratia video library storage." });
      return;
    }
    await del(url.href);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ deleted: true });
  } catch (error) {
    res.status(error.statusCode || 400).json({ detail: error.message || "The stored video could not be deleted." });
  }
}
