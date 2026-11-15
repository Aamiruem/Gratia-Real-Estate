import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  KeyRound,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  ExternalLink,
  FileBarChart,
  Globe,
  Inbox,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Settings,
  UserCog,
  Users,
  X,
} from "lucide-react";
import SEO from "../components/SEO";
import Logo from "../components/Logo";
import NotificationBell from "../components/notifications/NotificationBell";
import useOwner, { notifyAuthChanged } from "../hooks/useOwner";
import { authApi } from "../services/authApi";

const Overview = lazy(() => import("./pages/Overview"));
const Properties = lazy(() => import("./pages/Properties"));
const Customers = lazy(() => import("./pages/Customers"));
const Leads = lazy(() => import("../pages/LeadsAdmin"));
const FollowUps = lazy(() => import("./pages/FollowUps"));
const NotificationsAdmin = lazy(() => import("./pages/NotificationsAdmin"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Reports = lazy(() => import("./pages/Reports"));
const Seo = lazy(() => import("./pages/Seo"));
const Team = lazy(() => import("./pages/Team"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Account = lazy(() => import("./pages/Account"));
const CrmDashboard = lazy(() => import("./pages/CrmDashboard"));
const LeadPipeline = lazy(() => import("./pages/LeadPipeline"));

const MANAGERS = ["owner", "admin"];
const MODULES = [
  { to: "/admin", label: "Overview", Icon: LayoutDashboard, end: true },
  { to: "/admin/crm", label: "CRM dashboard", Icon: BarChart3 },
  { to: "/admin/pipeline", label: "Lead pipeline", Icon: Inbox },
  { to: "/admin/properties", label: "Properties", Icon: Building2 },
  { to: "/admin/customers", label: "Customers", Icon: Users },
  { to: "/admin/leads", label: "Leads", Icon: Inbox },
  { to: "/admin/follow-ups", label: "Follow-ups", Icon: CalendarClock },
  { to: "/admin/notifications", label: "Notifications", Icon: Bell },
  { to: "/admin/analytics", label: "Analytics & traffic", Icon: BarChart3 },
  { to: "/admin/reports", label: "Enquiry reports", Icon: FileBarChart },
  { to: "/admin/seo", label: "SEO", Icon: Globe, roles: MANAGERS },
  { to: "/admin/team", label: "Users & team", Icon: UserCog, roles: MANAGERS },
  { to: "/admin/settings", label: "Settings", Icon: Settings, roles: MANAGERS },
  { to: "/admin/account", label: "My account", Icon: KeyRound },
];

export default function AdminApp() {
  const { checked, isStaff, role, user } = useOwner();
  const { pathname, search } = useLocation();

  if (!checked) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f5f3ee]">
        <Loader2 className="animate-spin text-[#c9a45c]" size={32} aria-label="Checking access" />
      </div>
    );
  }
  if (!isStaff) {
    // Private area: not linked publicly and not indexed. Sign in first.
    return <Navigate to={`/video-admin/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  }
  return <AdminShell role={role} user={user} />;
}

function AdminShell({ role, user }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const modules = MODULES.filter((m) => !m.roles || m.roles.includes(role));
  useEffect(() => setMenuOpen(false), [pathname]);

  const signOut = async () => {
    await authApi.logout().catch(() => {});
    notifyAuthChanged();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#f5f3ee] lg:grid lg:grid-cols-[260px_1fr]">
      <SEO title="Admin | Gratia Estates" description="Private admin panel." path="/admin" noindex />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#0f1f2e] text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link to="/admin" aria-label="Admin overview">
            <Logo variant="light" className="h-11 text-[17px]" />
          </Link>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="grid size-9 place-items-center rounded-full hover:bg-white/10 lg:hidden">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Admin">
          <ul className="space-y-0.5">
            {modules.map(({ to, label, Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-[#c9a45c] text-[#142536]" : "text-white/75 hover:bg-white/10 hover:text-white"}`
                  }
                >
                  <Icon size={17} aria-hidden="true" /> {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-1 border-t border-white/10 p-3">
          <Link to="/videos" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white">
            <ExternalLink size={16} aria-hidden="true" /> Video library
          </Link>
          <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white">
            <ExternalLink size={16} aria-hidden="true" /> View website
          </a>
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-white/75 hover:bg-white/10 hover:text-white">
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#e7e2d8] bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open admin menu" className="grid size-10 place-items-center rounded-full border border-[#e7e2d8] lg:hidden">
            <Menu size={19} aria-hidden="true" />
          </button>
          <p className="hidden text-sm text-[#4b5966] sm:block">
            Signed in as <strong className="text-[#142536]">{user?.name || user?.email}</strong>
            <span className="ml-2 rounded-full bg-[#f3ead8] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#80602b]">{role}</span>
          </p>
          <NotificationBell />
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Suspense fallback={<Loader2 className="mx-auto mt-16 animate-spin text-[#c9a45c]" size={28} aria-label="Loading" />}>
            <Routes>
              <Route index element={<Overview role={role} />} />
              <Route path="crm" element={<CrmDashboard />} />
              <Route path="pipeline" element={<LeadPipeline />} />
              <Route path="properties" element={<Properties role={role} />} />
              <Route path="customers" element={<Customers />} />
              <Route path="leads" element={<Leads embedded />} />
              <Route path="follow-ups" element={<FollowUps />} />
              <Route path="notifications" element={<NotificationsAdmin role={role} />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="reports" element={<Reports />} />
              {MANAGERS.includes(role) && <Route path="seo" element={<Seo />} />}
              {MANAGERS.includes(role) && <Route path="team" element={<Team role={role} />} />}
              {MANAGERS.includes(role) && <Route path="settings" element={<SettingsPage />} />}
              <Route path="account" element={<Account />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
