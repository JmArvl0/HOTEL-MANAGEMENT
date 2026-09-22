"use client";

import { useEffect, useState } from "react";
import {
  Award,
  Check,
  Coins,
  Crown,
  History,
  ReceiptText,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  LOYALTY_TIERS,
  POINTS_TO_PESO,
  TIER_MULTIPLIERS,
  nextTier,
  normalizeTier,
  spendToNextTier,
  tierLabel,
  tierProgress,
  type LoyaltyTier,
} from "@/lib/loyalty";
import { formatHotelDateTime } from "@/lib/format";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";

type LedgerType = "earned" | "redeemed" | "adjusted" | "expired";
type LedgerRow = {
  id: string;
  points: number;
  transaction_type: LedgerType;
  notes: string | null;
  reservation_id: string | null;
  created_at: string;
};
type LoyaltyData = {
  points: number;
  tier: LoyaltyTier;
  tierLabel: string;
  lifetimeSpend: number;
  nextTier: LoyaltyTier | null;
  nextTierLabel: string | null;
  spendToNext: number;
  progress: number;
  ledger: LedgerRow[];
};

const TIER_DETAILS: Record<LoyaltyTier, { range: string; perk: string }> = {
  silver: { range: "₱0 – ₱19,999 settled spend", perk: "Standard member privileges" },
  gold: { range: "₱20,000 – ₱49,999 settled spend", perk: "Priority early check-in requests" },
  platinum: { range: "₱50,000+ settled spend", perk: "Priority upgrades and enhanced privileges" },
};

function peso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function finiteNonNegative(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function parseLoyaltyData(value: unknown): LoyaltyData | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const tier = normalizeTier(record.tier);
  const lifetimeSpend = finiteNonNegative(record.lifetimeSpend);
  const upcomingTier = nextTier(tier);
  const ledger = Array.isArray(record.ledger)
    ? record.ledger.flatMap((entry): LedgerRow[] => {
        if (!entry || typeof entry !== "object") return [];
        const row = entry as Record<string, unknown>;
        const transactionType = String(row.transaction_type ?? "").toLowerCase();
        if (!["earned", "redeemed", "adjusted", "expired"].includes(transactionType)) return [];
        return [{
          id: String(row.id ?? ""),
          points: Number.isFinite(Number(row.points)) ? Number(row.points) : 0,
          transaction_type: transactionType as LedgerType,
          notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
          reservation_id: row.reservation_id === null || row.reservation_id === undefined ? null : String(row.reservation_id),
          created_at: String(row.created_at ?? ""),
        }];
      })
    : [];

  return {
    points: finiteNonNegative(record.points),
    tier,
    tierLabel: tierLabel(tier),
    lifetimeSpend,
    nextTier: upcomingTier,
    nextTierLabel: upcomingTier ? tierLabel(upcomingTier) : null,
    spendToNext: spendToNextTier(lifetimeSpend, tier),
    progress: tierProgress(lifetimeSpend, tier),
    ledger,
  };
}

function transactionLabel(type: LedgerType) {
  if (type === "earned") return "Earned";
  if (type === "redeemed") return "Redeemed";
  if (type === "expired") return "Expired";
  return "Adjusted";
}

function LoyaltyLoading() {
  return (
    <div className="loyalty-loading" aria-label="Loading loyalty rewards" aria-busy="true">
      <div className="loyalty-kpi-grid" aria-hidden="true">
        {[0, 1, 2].map((item) => <span className="loyalty-skeleton loyalty-skeleton-kpi" key={item} />)}
      </div>
      <div className="loyalty-skeleton loyalty-skeleton-heading" aria-hidden="true" />
      <div className="loyalty-tier-grid" aria-hidden="true">
        {[0, 1, 2].map((item) => <span className="loyalty-skeleton loyalty-skeleton-tier" key={item} />)}
      </div>
      <div className="loyalty-skeleton loyalty-skeleton-ledger" aria-hidden="true" />
      <span className="sr-only">Loading your rewards.</span>
    </div>
  );
}

function LoyaltyContent({ data }: { data: LoyaltyData }) {
  const [selectedTier, setSelectedTier] = useState<LoyaltyTier | null>(null);
  const selected = selectedTier ?? data.tier;
  const progressPercent = Math.round(data.progress * 100);
  const pagination = useTablePagination(data.ledger, 8);

  return (
    <>
      <section className="loyalty-kpi-grid" aria-label="Rewards summary">
        <article className="loyalty-kpi-card">
          <span className="loyalty-kpi-icon"><Award aria-hidden="true" size={21} /></span>
          <div>
            <small>Active tier &amp; balance</small>
            <span className={"loyalty-tier-badge tier-" + data.tier}>{data.tierLabel}</span>
            <strong>{data.points.toLocaleString("en-PH")} <em>points</em></strong>
            <p>{TIER_MULTIPLIERS[data.tier]}× points for every ₱100 in settled stay spend</p>
          </div>
        </article>

        <article className="loyalty-kpi-card">
          <span className="loyalty-kpi-icon"><TrendingUp aria-hidden="true" size={21} /></span>
          <div>
            <small>Tier progress</small>
            <strong>{data.nextTier ? peso(data.spendToNext) : "Top tier unlocked"}</strong>
            <p>{data.nextTier ? "more to reach " + data.nextTierLabel : "Platinum privileges are active"}</p>
            <div
              className="loyalty-progress"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={data.nextTier ? "Progress to " + data.nextTierLabel : "Top loyalty tier reached"}
            >
              <span style={{ transform: "scaleX(" + data.progress + ")" }} />
            </div>
          </div>
        </article>

        <article className="loyalty-kpi-card">
          <span className="loyalty-kpi-icon"><WalletCards aria-hidden="true" size={21} /></span>
          <div>
            <small>Reward purchasing power</small>
            <strong>{peso(data.points * POINTS_TO_PESO)}</strong>
            <p>Available stay discount · 1 point equals ₱1.00 off</p>
          </div>
        </article>
      </section>

      <section className="loyalty-comparison" aria-labelledby="loyalty-tiers-heading">
        <header>
          <div>
            <h2 id="loyalty-tiers-heading">Compare membership tiers</h2>
            <p>Choose a tier to review how lifetime settled spend unlocks additional privileges.</p>
          </div>
          <span className="loyalty-lifetime-spend">
            <Coins aria-hidden="true" size={17} />
            <span>Lifetime spend <strong>{peso(data.lifetimeSpend)}</strong></span>
          </span>
        </header>

        <div className="loyalty-tier-grid" role="group" aria-label="Membership tiers">
          {LOYALTY_TIERS.map((tier) => {
            const active = tier === data.tier;
            const chosen = tier === selected;
            const details = TIER_DETAILS[tier];
            return (
              <button
                type="button"
                className={"loyalty-tier-option tier-" + tier + (active ? " is-active" : "") + (chosen ? " is-selected" : "")}
                key={tier}
                aria-pressed={chosen}
                onClick={() => setSelectedTier(tier)}
              >
                <span className="loyalty-tier-option-top">
                  <span className={"loyalty-tier-mark tier-" + tier}>
                    {tier === "platinum" ? <Crown aria-hidden="true" size={18} /> : <Award aria-hidden="true" size={18} />}
                  </span>
                  {active ? <span className="loyalty-active-tier"><Check aria-hidden="true" size={12} /> Active tier</span> : null}
                </span>
                <strong>{tierLabel(tier)}</strong>
                <span>{details.range}</span>
                <b>{TIER_MULTIPLIERS[tier]}× points multiplier</b>
                <small>{details.perk}</small>
              </button>
            );
          })}
        </div>

        <div className={"loyalty-tier-detail tier-" + selected} aria-live="polite">
          <Sparkles aria-hidden="true" size={18} />
          <p><strong>{tierLabel(selected)} privileges:</strong> {TIER_DETAILS[selected].perk}. Earn {TIER_MULTIPLIERS[selected]}× points on eligible settled stay spend.</p>
        </div>
      </section>

      <section className="loyalty-ledger-card" aria-labelledby="loyalty-history-heading">
        <header>
          <span className="loyalty-section-icon"><History aria-hidden="true" size={20} /></span>
          <div>
            <h2 id="loyalty-history-heading">Points transaction history</h2>
            <p>A clear record of points earned, redeemed, adjusted, or expired.</p>
          </div>
        </header>

        {data.ledger.length === 0 ? (
          <div className="loyalty-empty">
            <span><ReceiptText aria-hidden="true" size={25} /></span>
            <h3>Your points story starts after checkout</h3>
            <p>Eligible points will appear here automatically once a completed stay is settled.</p>
          </div>
        ) : (
          <>
            <div className="loyalty-table-wrap">
              <table className="loyalty-ledger-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Reservation ref</th>
                    <th scope="col">Activity</th>
                    <th scope="col">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.rows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Date"><time dateTime={row.created_at}>{formatHotelDateTime(row.created_at)}</time></td>
                      <td data-label="Reservation ref"><span className="loyalty-reference">{row.reservation_id ?? "Account adjustment"}</span></td>
                      <td data-label="Activity">
                        <span className={"loyalty-transaction-badge type-" + row.transaction_type}>{transactionLabel(row.transaction_type)}</span>
                        {row.notes ? <small>{row.notes}</small> : null}
                      </td>
                      <td data-label="Points" className={row.points > 0 ? "points-positive" : "points-negative"}>
                        {row.points > 0 ? "+" : ""}{row.points.toLocaleString("en-PH")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={pagination.page}
              pageCount={pagination.pageCount}
              start={pagination.start}
              end={pagination.end}
              total={pagination.total}
              noun="transactions"
              onPageChange={pagination.setPage}
              note="Newest activity first"
            />
          </>
        )}
      </section>
    </>
  );
}

export default function LoyaltyCardPanel() {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/account/loyalty", { cache: "no-store", signal: controller.signal });
        const body: unknown = await response.json();
        const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
        const parsed = parseLoyaltyData(payload.data);
        if (!response.ok || !parsed) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load loyalty rewards.");
        setData(parsed);
        setError("");
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Unable to load loyalty rewards.");
      }
    }
    void load();
    return () => controller.abort();
  }, [retryToken]);

  if (error) {
    return (
      <section className="loyalty-error" role="alert">
        <Award aria-hidden="true" size={26} />
        <div>
          <h2>We couldn&apos;t load your rewards</h2>
          <p>{error} Check your connection and try again.</p>
        </div>
        <button className="btn btn-soft" type="button" onClick={() => { setError(""); setRetryToken((value) => value + 1); }}>Try again</button>
      </section>
    );
  }

  if (!data) return <LoyaltyLoading />;
  return <LoyaltyContent data={data} />;
}
