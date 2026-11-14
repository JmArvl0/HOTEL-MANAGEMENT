"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function PaymentRecovery({ title, detail }: { title: string; detail: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <section className="my-stay-payment-recovery" role="status">
    <h2>{title}</h2><p>{detail}</p>
    <p>Your reservation is not confirmed. Your room remains held only until the deadline shown above. If it expires, search again for current availability.</p>
    <div className="btn-row"><button type="button" className="btn btn-accent" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Checking…" : "Retry checkout"}</button><Link className="btn btn-soft" href="/account/help">Contact Front Desk</Link></div>
    <Link href="/account">Return to My Stay</Link>
  </section>;
}
