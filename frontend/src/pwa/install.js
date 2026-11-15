// Captures the browser's install prompt as early as possible (it fires once,
// often before React renders) and tracks whether the app is installed.

let deferredPrompt = null;
const listeners = new Set();
const INSTALLED_KEY = "gratia-app-installed";

const notify = () => listeners.forEach((listener) => listener());

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: window-controls-overlay)").matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

export function installState() {
  let installedBefore = false;
  try {
    installedBefore = localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    // ignore
  }
  return {
    standalone: isStandalone(),
    installed: isStandalone() || installedBefore,
    canPrompt: Boolean(deferredPrompt),
  };
}

export function platform() {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || iPadOS;
  const android = /Android/.test(ua);
  const mac = /Macintosh/.test(ua) && !iPadOS;
  const edge = /Edg\//.test(ua);
  const firefox = /Firefox|FxiOS/.test(ua);
  const samsung = /SamsungBrowser/.test(ua);
  const chrome = /Chrome|CriOS/.test(ua) && !edge && !samsung;
  const safari = /Safari/.test(ua) && !chrome && !edge && !firefox && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return { ios, android, mac, edge, firefox, samsung, chrome, safari, windows: /Windows/.test(ua) };
}

export async function promptInstall() {
  if (!deferredPrompt) return "unavailable";
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  notify();
  promptEvent.prompt();
  const { outcome } = await promptEvent.userChoice;
  return outcome; // "accepted" | "dismissed"
}

export function subscribeInstall(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initInstallCapture() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // show our own button instead of the mini-infobar
    deferredPrompt = event;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try {
      localStorage.setItem(INSTALLED_KEY, "1");
    } catch {
      // ignore
    }
    notify();
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", notify);
}
