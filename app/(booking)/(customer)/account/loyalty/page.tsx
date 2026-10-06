import Link from "next/link";
import { Sparkles } from "lucide-react";
import LoyaltyCardPanel from "@/components/customer/loyalty-card-panel";
import { requireCustomerSession } from "@/lib/customer-auth";

export default async function LoyaltyPage() {
  await requireCustomerSession();

  return (
    <div className="customer-rewards-page">
      <section className="customer-page-title split customer-rewards-hero">
        <div>
          <p className="eyebrow">Haven Rewards</p>
          <h1>Earn points &amp; unlock VIP privileges.</h1>
          <p>Earn points on every stay — spend points for ₱1 off per point on future folios. Points land here automatically at checkout.</p>
        </div>
        <Link href="/account/find-room" className="btn btn-accent customer-rewards-cta">
          <Sparkles size={14} aria-hidden="true" />
          <span>Book stay to earn</span>
        </Link>
      </section>
      <LoyaltyCardPanel />
    </div>
  );
}
