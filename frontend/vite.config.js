import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { SITE_URL } from "./site.config.js";

export default defineConfig(({ mode }) => {
  // Where the local FastAPI backend runs; the browser only ever talks to /api.
  const backend =
    loadEnv(mode, process.cwd(), "").DEV_BACKEND_URL || "http://127.0.0.1:8000";
  return {
    plugins: [
      react(),
      {
        name: "site-url",
        transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", SITE_URL),
      },
    ],
    define: { __SITE_URL__: JSON.stringify(SITE_URL) },
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": { target: backend, changeOrigin: true, xfwd: true },
      },
    },
    preview: {
      proxy: {
        "/api": { target: backend, changeOrigin: true, xfwd: true },
      },
    },
  };
});
