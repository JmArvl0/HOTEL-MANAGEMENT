import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import ManagerDashboardClient from "@/components/manager/manager-dashboard-client";

export default async function ManagerDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "guest") redirect("/account");
  return <ManagerDashboardClient user={session.user}/>;
}
