import { redirect } from "next/navigation";
import { getAuthenticatedSession } from "@/lib/authorization";
import ManagerDashboardClient from "@/components/manager/manager-dashboard-client";
import AdminDashboardClient from "@/components/admin/admin-dashboard-client";
import OwnerDashboardClient from "@/components/owner/owner-dashboard-client";

export default async function ManagerDashboardPage() {
  const session = await getAuthenticatedSession();
  if (!session) redirect("/login");
  if (session.user.role === "guest") redirect("/account");
  if (session.user.role === "owner") return <OwnerDashboardClient user={session.user as typeof session.user & { role: "owner" }} sessionExpiresAt={session.sessionExpiresAt}/>;
  if (session.user.role === "admin") return <AdminDashboardClient user={session.user} sessionExpiresAt={session.sessionExpiresAt}/>;
  return <ManagerDashboardClient user={session.user} sessionExpiresAt={session.sessionExpiresAt}/>;
}
