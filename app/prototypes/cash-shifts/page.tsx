import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CashShiftsPrototype from "@/components/prototypes/cash-shifts-prototype";

export const metadata: Metadata = { title: "Cash & Shifts Prototype | Haven Hotel Management" };

export default function CashShiftsPrototypePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CashShiftsPrototype />;
}
