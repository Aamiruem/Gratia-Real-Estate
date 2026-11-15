import { CheckCheck } from "lucide-react";
import NotificationList from "../../components/notifications/NotificationList";
import { AlertsToggle } from "../../components/notifications/NotificationBell";
import useNotifications, { markAllRead } from "../../hooks/useNotifications";
import { AnnounceForm } from "../../pages/LeadsAdmin";
import { buttonSecondary, Card, PageTitle } from "../ui";

export default function NotificationsAdmin({ role }) {
  const notifications = useNotifications();
  const canAnnounce = role === "owner" || role === "admin";

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Communication"
        title="Notifications"
        text="Team notifications (new enquiries, visit requests, callbacks, due follow-ups) and the announcements visitors see. All are saved in the database."
        actions={
          <button type="button" onClick={markAllRead} disabled={!notifications.unread} className={buttonSecondary}>
            <CheckCheck size={15} aria-hidden="true" /> Mark all read
          </button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card title={`History${notifications.unread ? ` · ${notifications.unread} unread` : ""}`} className="!p-0 overflow-hidden">
          <NotificationList items={notifications.items} />
          <div className="border-t border-[#efebe3] bg-[#fbfaf7] px-4 py-3">
            <AlertsToggle notifications={notifications} />
          </div>
        </Card>
        {canAnnounce && <AnnounceForm />}
      </div>
    </div>
  );
}
