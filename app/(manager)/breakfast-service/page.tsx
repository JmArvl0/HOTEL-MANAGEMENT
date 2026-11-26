import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedSession } from "@/lib/authorization";
import { BreakfastServiceForm } from "@/components/customer/breakfast-service-form";
import "@/components/customer/breakfast-pass.css";

export default async function BreakfastServicePage() {
  const session = await getAuthenticatedSession();
  if (!session) redirect("/login");
  if (!["front_desk", "manager"].includes(session.user.role)) redirect("/manager_dashboard");
  return <main className="breakfast-service">
    <Link href="/manager_dashboard">Back to hotel workspace</Link>
    <h1>Breakfast service</h1>
    <p>Check the guest’s breakfast pass, then record how many meals were served.</p>
    <BreakfastServiceForm />
  </main>;
}
