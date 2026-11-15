// A random key that identifies this browser to the notification system, so a
// visitor's own enquiry updates (saved in the database) show in their bell.
// It contains no personal information and is never used for analytics.
const KEY = "gratia-device-key";

export function getDeviceKey() {
  try {
    let value = localStorage.getItem(KEY);
    if (!value || !/^[A-Za-z0-9_-]{32,80}$/.test(value)) {
      const bytes = crypto.getRandomValues(new Uint8Array(30));
      value = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 48);
      localStorage.setItem(KEY, value);
    }
    return value;
  } catch {
    return null;
  }
}
