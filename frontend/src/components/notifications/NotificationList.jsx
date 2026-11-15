import {
  Bell,
  BellRing,
  Building2,
  CalendarCheck,
  CheckCheck,
  Clapperboard,
  Megaphone,
  MessageSquareText,
  PhoneCall,
  Trash2,
  UserRoundPlus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { markRead, removeNotification } from "../../hooks/useNotifications";
import { timeAgo } from "../../utils/format";

const KIND_ICONS = {
  "lead.visit": { Icon: CalendarCheck, tone: "bg-emerald-100 text-emerald-700" },
  "lead.consultation": { Icon: CalendarCheck, tone: "bg-teal-100 text-teal-700" },
  "lead.callback": { Icon: PhoneCall, tone: "bg-orange-100 text-orange-700" },
  "lead.contact": { Icon: MessageSquareText, tone: "bg-sky-100 text-sky-700" },
  "lead.property_enquiry": { Icon: Building2, tone: "bg-violet-100 text-violet-700" },
  "lead.whatsapp": { Icon: UserRoundPlus, tone: "bg-green-100 text-green-700" },
  "property.added": { Icon: Building2, tone: "bg-amber-100 text-amber-800" },
  "video.added": { Icon: Clapperboard, tone: "bg-rose-100 text-rose-700" },
  announcement: { Icon: Megaphone, tone: "bg-amber-100 text-amber-800" },
};

export function NotificationIcon({ kind }) {
  const { Icon, tone } = KIND_ICONS[kind] ?? { Icon: Bell, tone: "bg-slate-100 text-slate-700" };
  return (
    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}>
      <Icon size={18} aria-hidden="true" />
    </span>
  );
}

export default function NotificationList({ items, onNavigate, compact = false }) {
  if (!items.length) {
    return (
      <div className="px-6 py-10 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#f3ead8] text-[#80602b]">
          <BellRing size={22} aria-hidden="true" />
        </span>
        <p className="mt-3 font-semibold text-[#142536]">You're all caught up</p>
        <p className="mt-1 text-sm text-[#5e6872]">
          New properties, videos and updates on your enquiries will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[#efebe3]">
      {items.map((item) => {
        const content = (
          <>
            <NotificationIcon kind={item.kind} />
            <span className="min-w-0 flex-1">
              <span className={`block text-sm leading-5 text-[#142536] ${item.read ? "font-medium" : "font-bold"}`}>
                {item.title}
              </span>
              {item.body && (
                <span className={`mt-0.5 block text-[13px] leading-5 text-[#4b5966] ${compact ? "line-clamp-2" : ""}`}>
                  {item.body}
                </span>
              )}
              <span className="mt-1 block text-[11px] font-semibold text-[#80602b]">{timeAgo(item.createdAt)}</span>
            </span>
          </>
        );
        return (
          <li key={item.key} className={`group relative flex items-start gap-2 px-4 py-3 transition ${item.read ? "bg-white" : "bg-[#fbf7ee]"}`}>
            {!item.read && <span className="absolute left-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-[#c9a45c]" aria-label="Unread" />}
            {item.link ? (
              <Link
                to={item.link}
                onClick={() => {
                  markRead(item);
                  onNavigate?.();
                }}
                className="flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c9a45c]"
              >
                {content}
              </Link>
            ) : (
              <button type="button" onClick={() => markRead(item)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                {content}
              </button>
            )}
            <span className="flex shrink-0 flex-col gap-1">
              {!item.read && (
                <button
                  type="button"
                  onClick={() => markRead(item)}
                  aria-label={`Mark "${item.title}" as read`}
                  title="Mark as read"
                  className="grid size-8 place-items-center rounded-full text-[#5e6872] transition hover:bg-[#f3ead8] hover:text-[#142536]"
                >
                  <CheckCheck size={15} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeNotification(item)}
                aria-label={`Delete "${item.title}"`}
                title="Delete"
                className="grid size-8 place-items-center rounded-full text-[#5e6872] transition hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
