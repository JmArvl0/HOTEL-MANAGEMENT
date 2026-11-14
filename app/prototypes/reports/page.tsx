import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReportsPermissionPrototype from "@/components/prototypes/reports-permission-prototype";

export const metadata: Metadata = { title: "Reports Prototype | Haven Hotel Management" };

export default function ReportsPrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ReportsPermissionPrototype />;
}
