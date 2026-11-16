import { apiRequest } from "../services/apiClient";
import { upload } from "@vercel/blob/client";

export const MAX_VIDEO_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

export function getYouTubeVideoId(value) {
  let parsedUrl;

  try {
    parsedUrl = new URL(value);
  } catch {
    return "";
  }

  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  if (
    ![
      "youtube.com",
      "m.youtube.com",
      "youtube-nocookie.com",
      "youtu.be",
    ].includes(host)
  ) {
    return "";
  }

  let videoId = "";
  if (host === "youtu.be") {
    videoId = parsedUrl.pathname.split("/").filter(Boolean)[0] || "";
  } else if (parsedUrl.pathname === "/watch") {
    videoId = parsedUrl.searchParams.get("v") || "";
  } else {
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live"].includes(segments[0])) {
      videoId = segments[1] || "";
    }
  }

  return /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : "";
}

const FILE_TYPES = /\.(mp4|webm|ogg|ogv|mov|m4v|mkv|avi|flv|mpe|mpeg|mpegts|mpg|mts|m2ts|m2v|m4p|ts|wmv|3gp|3g2|asf|f4v|gxf|h264|h265|hevc|mxf|vob)(\?.*)?$/i;

/**
 * Works out how to play a video link. Supported:
 *  - YouTube: watch, Shorts, live, embed and youtu.be links
 *  - Vimeo: vimeo.com/123 and player.vimeo.com/video/123
 *  - Direct video files: common web and device video formats
 * Returns null for anything else.
 */
export function getVideoSource(value) {
  const youtubeId = getYouTubeVideoId(value);
  if (youtubeId) {
    return {
      type: "youtube",
      id: youtubeId,
      thumbnail: `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`,
      fallbackThumbnail: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol === "blob:") return { type: "file", src: url.href, thumbnail: "" };
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part));
    return id ? { type: "vimeo", id, thumbnail: "" } : null;
  }
  // Instagram only permits embeds for individual posts/Reels, not profile URLs.
  if (["instagram.com", "instagr.am"].includes(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (["reel", "reels", "p", "tv"].includes(segments[0]) && segments[1]) {
      return { type: "instagram", id: segments[1], src: `https://www.instagram.com/${segments[0]}/${segments[1]}/embed/` };
    }
    return null;
  }
  if (FILE_TYPES.test(url.pathname)) {
    return { type: "file", src: url.href, thumbnail: "" };
  }
  return null;
}

const VIDEO_EXTENSIONS = new Set([
  "3g2", "3gp", "asf", "avi", "f4v", "flv", "gxf", "h264", "h265", "hevc", "m2ts", "m2v", "m4p", "m4v", "mkv", "mov", "mp4", "mpe", "mpeg", "mpegts", "mpg", "mts", "mxf", "ogv", "ts", "vob", "webm", "wmv",
]);
const VIDEO_CONTENT_TYPES = {
  "3g2": "video/3gpp2", "3gp": "video/3gpp", avi: "video/x-msvideo", m2ts: "video/mp2t", m4v: "video/mp4",
  mkv: "video/x-matroska", mov: "video/quicktime", mp4: "video/mp4", mpe: "video/mpeg", mpeg: "video/mpeg",
  mpegts: "video/mp2t", mpg: "video/mpeg", mts: "video/mp2t", ogv: "video/ogg", ts: "video/mp2t", webm: "video/webm",
};

export async function uploadVideoFile(file, onProgress) {
  const extension = String(file.name.split(".").pop() || "").toLowerCase();
  if (!file.type.startsWith("video/") && !VIDEO_EXTENSIONS.has(extension)) {
    throw new Error("Choose a video file (MP4, MOV, WebM, MKV, AVI, and other common video formats).");
  }
  if (file.size <= 0 || file.size > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error("Video files must be smaller than 5 GB.");
  }

  const safeName = file.name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-120) || `video.${extension || "bin"}`;

  return upload(`project-videos/${crypto.randomUUID()}-${safeName}`, file, {
    access: "public",
    contentType: VIDEO_CONTENT_TYPES[extension] || file.type || "application/octet-stream",
    handleUploadUrl: "/api/video-blob-upload",
    headers: { "X-Requested-With": "fetch" },
    multipart: file.size > 100 * 1024 * 1024,
    onUploadProgress: onProgress,
  });
}

export async function deleteUploadedVideo(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (!parsed.hostname.endsWith(".public.blob.vercel-storage.com") || !parsed.pathname.startsWith("/project-videos/")) return;

  const response = await fetch("/api/video-blob-delete", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
    },
    body: JSON.stringify({ url: parsed.href }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || "The stored video could not be removed.");
  }
}

// A stable key for likes/saves: the YouTube ID, or a short hash of other links.
export function getVideoKey(value) {
  const source = getVideoSource(value);
  if (!source) return "";
  if (source.type === "youtube") return source.id;
  let hash = 0;
  for (const ch of value) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `v${hash.toString(36).padStart(10, "0").slice(-10)}`;
}

function normalizeVideo(video) {
  return {
    id: video.id,
    title: video.title,
    url: video.url,
    description: video.description || "",
    projectSlug: video.project_slug || "",
  };
}

export async function fetchVideos() {
  try {
    const data = await apiRequest("/videos");
    return { videos: data.map(normalizeVideo), error: "" };
  } catch (error) {
    return { videos: [], error: error.message };
  }
}

export async function saveVideo(video) {
  try {
    await apiRequest(`/videos/${encodeURIComponent(video.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        id: video.id,
        title: video.title,
        url: video.url,
        description: video.description || "",
        project_slug: video.projectSlug || null,
      }),
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
}

export async function saveVideos(videos) {
  try {
    await apiRequest("/videos", {
      method: "PUT",
      body: JSON.stringify(
        videos.map((video) => ({
          id: video.id,
          title: video.title,
          url: video.url,
          description: video.description || "",
          project_slug: video.projectSlug || null,
        })),
      ),
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
}

export async function removeVideo(id) {
  try {
    await apiRequest(`/videos/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
}
