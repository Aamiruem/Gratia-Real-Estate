import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { initInstallCapture } from "./pwa/install";
import { registerServiceWorker } from "./pwa/registerServiceWorker";
import "./index.css";

// Must run before the browser fires its one-time install prompt.
initInstallCapture();
registerServiceWorker();

// After a new deployment, an open tab may ask for a page chunk that no longer
// exists. Reload once to pick up the new version (never in a loop, never offline).
window.addEventListener("vite:preloadError", (event) => {
  if (!navigator.onLine) return;
  try {
    const last = Number(sessionStorage.getItem("gratia-chunk-reload") || 0);
    if (Date.now() - last < 15_000) return;
    sessionStorage.setItem("gratia-chunk-reload", String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
