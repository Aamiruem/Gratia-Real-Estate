// Registers the service worker in production builds only: in development it
// would cache Vite's modules and hide your latest changes.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const register = () =>
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  // Wait for the page to finish loading so it doesn't compete with first paint.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
