import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { SITE_URL } from "./site.config.js";

export default defineConfig(({ mode }) => {
  // Where the local FastAPI backend runs; the browser only ever talks to /api.
  const backend =
    loadEnv(mode, process.cwd(), "").DEV_BACKEND_URL || "http://127.0.0.1:8000";
  // When the backend isn't running, answer with a clear 503 instead of the
  // proxy's bare 500, so the site can tell visitors what's wrong.
  const apiProxy = {
    target: backend,
    changeOrigin: true,
    xfwd: true,
    configure(proxy) {
      proxy.on("error", (error, _req, res) => {
        if (!res || res.headersSent || typeof res.writeHead !== "function") return;
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            detail: `The backend isn't running at ${backend}. Start it with start-backend.bat (or "python main.py" in backend/app), then try again.`,
            code: "backend_unreachable",
          }),
        );
      });
    },
  };
  return {
    plugins: [
      react(),
      {
        name: "site-url",
        transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", SITE_URL),
      },
    ],
    define: { __SITE_URL__: JSON.stringify(SITE_URL) },
    build: {
      rollupOptions: {
        output: {
          // React rarely changes: a separate file stays cached across deploys.
          manualChunks(id) {
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|turbo-stream|cookie|set-cookie-parser)[\\/]/.test(id)) {
              return "react";
            }
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: { "/api": apiProxy },
    },
    preview: {
      proxy: { "/api": apiProxy },
    },
  };
});
