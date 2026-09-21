import { CustomerShell } from "@/components/customer/customer-shell";
import { requireCustomerSession } from "@/lib/customer-auth";
import { countUnreadNotifications, getCustomerNotifications } from "@/lib/notifications";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireCustomerSession();
  const [notifications, unreadCount] = await Promise.all([
    getCustomerNotifications(session.user.id, 7),
    countUnreadNotifications(session.user.id),
  ]);
  return (
    <CustomerShell user={session.user} notifications={notifications} initialUnreadCount={unreadCount} sessionExpiresAt={session.sessionExpiresAt}>
      {children}
    </CustomerShell>
  );
}
