import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import ManagerDashboardClient from "@/components/manager/manager-dashboard-client";
import AdminDashboardClient from "@/components/admin/admin-dashboard-client";
import OwnerDashboardClient from "@/components/owner/owner-dashboard-client";

export default async function ManagerDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) redirect("/login");
  if (session.user.role === "guest") redirect("/account");
  if (session.user.role === "owner") return <OwnerDashboardClient user={session.user as typeof session.user & { role: "owner" }}/>;
  if (session.user.role === "admin") return <AdminDashboardClient user={session.user}/>;
  return <ManagerDashboardClient user={session.user}/>;
}
