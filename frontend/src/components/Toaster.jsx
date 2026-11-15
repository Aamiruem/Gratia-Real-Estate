import { useEffect, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

// Tiny global toast: call toast("Link copied") from anywhere.
const EVENT = "gratia-toast";
let nextId = 1;

export function toast(message, type = "success") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: nextId++, message, type } }));
}

const STYLES = {
  success: { Icon: CheckCircle2, tone: "text-emerald-600" },
  info: { Icon: Info, tone: "text-sky-600" },
  error: { Icon: TriangleAlert, tone: "text-rose-600" },
};

export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (event) => {
      const item = event.detail;
      setItems((current) => [...current.slice(-2), item]);
      window.setTimeout(() => setItems((current) => current.filter((t) => t.id !== item.id)), 3500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[120] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {items.map(({ id, message, type }) => {
        const { Icon, tone } = STYLES[type] ?? STYLES.info;
        return (
          <div
            key={id}
            className="toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-[#e7e2d8] bg-white px-4 py-3 text-sm font-semibold text-[#142536] shadow-[0_18px_40px_rgba(13,27,42,.18)]"
          >
            <Icon size={18} className={`shrink-0 ${tone}`} aria-hidden="true" />
            <span>{message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setItems((current) => current.filter((t) => t.id !== id))}
              className="ml-1 grid size-6 place-items-center rounded-full text-[#68717a] hover:bg-[#f3f1ec]"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
