import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/booking";

export const metadata = { title: "Reset password — HAVEN" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const callbackUrl = safeInternalPath(params.callbackUrl, "/auth/continue");
  redirect(`/login?view=forgot-password&callbackUrl=${encodeURIComponent(callbackUrl)}${params.booking === "1" ? "&booking=1" : ""}`);
}
