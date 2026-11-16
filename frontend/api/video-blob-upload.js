import { handleUpload } from "@vercel/blob/client";

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
const VIDEO_EXTENSIONS = new Set([
  "3g2", "3gp", "asf", "avi", "f4v", "flv", "gxf", "h264", "h265", "hevc", "m2ts", "m2v", "m4p", "m4v", "mkv", "mov", "mpe", "mpeg", "mpegts", "mpg", "mts", "mxf", "ogv", "ts", "vob", "webm", "wmv",
]);

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host || new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
    const error = new Error("The upload request origin is not allowed.");
    error.statusCode = 403;
    throw error;
  }
  if (req.headers["x-requested-with"] !== "fetch") {
    const error = new Error("The upload request could not be verified.");
    error.statusCode = 403;
    throw error;
  }
}

async function requireVideoAdmin(req) {
  assertSameOrigin(req);
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
    const error = new Error("Sign in as the video administrator to upload videos.");
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
    const result = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        await requireVideoAdmin(req);
        const path = String(pathname || "");
        const extension = path.split(".").pop()?.toLowerCase();
        if (!path.startsWith("project-videos/") || !VIDEO_EXTENSIONS.has(extension)) {
          const error = new Error("Choose a supported video format.");
          error.statusCode = 400;
          throw error;
        }
        return {
          allowedContentTypes: ["video/*", "application/octet-stream"],
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: true,
          validUntil: Date.now() + 15 * 60 * 1000,
        };
      },
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode || 400).json({ detail: error.message || "The upload could not be authorized." });
  }
}
