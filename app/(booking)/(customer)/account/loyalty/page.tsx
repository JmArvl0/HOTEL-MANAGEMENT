import LoyaltyCardPanel from "@/components/customer/loyalty-card-panel";
import { requireCustomerSession } from "@/lib/customer-auth";

export default async function LoyaltyPage() {
  await requireCustomerSession();

  return (
    <div className="customer-rewards-page">
      <section className="customer-page-title customer-rewards-hero">
        <p className="eyebrow">Haven Rewards</p>
        <h1>Earn points &amp; unlock VIP privileges.</h1>
        <p>Earn points on every stay — spend points for ₱1 off per point on future folios. Points land here automatically at checkout.</p>
      </section>
      <LoyaltyCardPanel />
    </div>
  );
}
