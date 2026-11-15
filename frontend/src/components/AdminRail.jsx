import { Link } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  FileBarChart,
  Globe,
  Inbox,
  LayoutDashboard,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import useOwner from "../hooks/useOwner";

const MANAGERS = ["owner", "admin"];
// Same modules as the admin panel's own sidebar (admin/AdminApp.jsx).
const MODULES = [
  { to: "/admin", label: "Overview", Icon: LayoutDashboard },
  { to: "/admin/leads", label: "Leads", Icon: Inbox },
  { to: "/admin/follow-ups", label: "Follow-ups", Icon: CalendarClock },
  { to: "/admin/properties", label: "Properties", Icon: Building2 },
  { to: "/admin/customers", label: "Customers", Icon: Users },
  { to: "/admin/notifications", label: "Notifications", Icon: Bell },
  { to: "/admin/analytics", label: "Analytics & traffic", Icon: BarChart3 },
  { to: "/admin/reports", label: "Enquiry reports", Icon: FileBarChart },
  { to: "/admin/seo", label: "SEO", Icon: Globe, roles: MANAGERS },
  { to: "/admin/team", label: "Users & team", Icon: UserCog, roles: MANAGERS },
  { to: "/admin/settings", label: "Settings", Icon: Settings, roles: MANAGERS },
];

export const ADMIN_RAIL_WIDTH = "lg:pl-[60px]";

/**
 * Slim admin sidebar on the public website, shown only to signed-in staff on
 * large screens. Hover (or keyboard focus) expands it to show labels.
 */
export default function AdminRail() {
  const { isStaff, role } = useOwner();
  if (!isStaff) return null;
  const modules = MODULES.filter((m) => !m.roles || m.roles.includes(role));

  return (
    <aside
      aria-label="Admin shortcuts"
      className="group/rail fixed inset-y-0 left-0 z-[45] hidden w-[60px] flex-col overflow-hidden bg-[#0f1f2e] pt-[92px] text-white shadow-[8px_0_30px_rgba(13,27,42,.18)] transition-[width] duration-200 focus-within:w-60 hover:w-60 lg:flex"
    >
      <p className="mb-2 whitespace-nowrap px-[18px] text-[10px] font-bold uppercase tracking-[.18em] text-[#e1c98f]">
        <span className="group-hover/rail:hidden group-focus-within/rail:hidden">Admin</span>
        <span className="hidden group-hover/rail:inline group-focus-within/rail:inline">Admin · {role}</span>
      </p>
      <ul className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
        {modules.map(({ to, label, Icon }) => (
          <li key={to}>
            <Link
              to={to}
              title={label}
              className="flex h-11 items-center gap-3 whitespace-nowrap rounded-xl px-[11px] text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:outline-none"
            >
              <Icon size={19} className="shrink-0 text-[#e1c98f]" aria-hidden="true" />
              <span className="opacity-0 transition-opacity group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
