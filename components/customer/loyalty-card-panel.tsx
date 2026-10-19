"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  TIER_THRESHOLDS,
  nextTier,
  normalizeTier,
  spendToNextTier,
  tierLabel,
  tierProgress,
  type LoyaltyTier,
} from "@/lib/loyalty";
import { formatHotelDateTime } from "@/lib/format";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import { ModuleSummaryCards, type ModuleSummaryCard } from "@/components/manager/module-summary-cards";

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

const TIER_DETAILS: Record<LoyaltyTier, { range: string; perk: string; perks: string[] }> = {
  silver: {
    range: "₱0 – ₱19,999 settled spend",
    perk: "Standard member privileges",
    perks: [
      "1× points for every ₱100 in settled spend",
      "Member-only rate guarantee across all rooms",
      "Digital key & express mobile check-in",
    ],
  },
  gold: {
    range: "₱20,000 – ₱49,999 settled spend",
    perk: "Priority early check-in requests",
    perks: [
      "1.25× points for every ₱100 spend (+25% bonus)",
      "Priority early check-in & late checkout requests",
      "Complimentary welcome beverage & amenities",
    ],
  },
  platinum: {
    range: "₱50,000+ settled spend",
    perk: "Priority upgrades and enhanced privileges",
    perks: [
      "1.5× points for every ₱100 spend (+50% bonus)",
      "Priority room upgrades upon availability",
      "Dedicated concierge & VIP arrival lounge access",
    ],
  },
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
      <div className="mod-kpis" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => <span className="loyalty-skeleton loyalty-skeleton-kpi" key={item} />)}
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

  const kpis: ModuleSummaryCard[] = [
    {
      label: "Active tier & balance",
      value: `${data.points.toLocaleString("en-PH")} points`,
      hint: `${data.tierLabel} · ${TIER_MULTIPLIERS[data.tier]}× points for every ₱100 in settled stay spend`,
      icon: data.tier === "platinum" ? Crown : Award,
      tone: "gold",
    },
    {
      label: "Lifetime settled spend",
      value: peso(data.lifetimeSpend),
      hint: "Total verified folio spend establishing your tier milestone",
      icon: Coins,
      tone: "gold",
    },
    {
      label: "Tier progress",
      value: data.nextTier ? peso(data.spendToNext) : "Top tier unlocked",
      hint: data.nextTier ? "more to reach " + data.nextTierLabel : "Platinum privileges are active",
      icon: TrendingUp,
      tone: "attention",
      extra: (
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
      ),
    },
    {
      label: "Reward purchasing power",
      value: peso(data.points * POINTS_TO_PESO),
      hint: "Available stay discount · 1 point equals ₱1.00 off",
      icon: WalletCards,
      tone: "today",
    },
  ];

  return (
    <>
      {/* Guest surface: customer tokens (--cp-*) paint the shared card via
          ui-primitives fallback chains. Executive gradients + badges retired
          (fully unified per reference-design Stage 2). */}
      <ModuleSummaryCards cards={kpis} ariaLabel="Rewards summary" />

      <section className="loyalty-comparison" aria-labelledby="loyalty-tiers-heading">
        <header>
          <div>
            <span className="loyalty-section-eyebrow">Tier Privileges</span>
            <h2 id="loyalty-tiers-heading">Compare membership tiers</h2>
            <p>Choose a tier to review how lifetime settled spend unlocks additional privileges.</p>
          </div>
          <span className="loyalty-lifetime-spend" aria-label={`Lifetime spend: ${peso(data.lifetimeSpend)}`}>
            <span className="loyalty-lifetime-spend-icon" aria-hidden="true">
              <Coins size={18} />
            </span>
            <span className="loyalty-lifetime-spend-details">
              <span className="loyalty-lifetime-spend-label">Lifetime spend</span>
              <strong className="loyalty-lifetime-spend-amount">{peso(data.lifetimeSpend)}</strong>
            </span>
            <span className={"loyalty-lifetime-tier-pill tier-" + data.tier}>
              {data.tierLabel} unlocked
            </span>
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
                <div className="loyalty-tier-option-top">
                  <span className={"loyalty-tier-mark tier-" + tier}>
                    {tier === "platinum" ? <Crown aria-hidden="true" size={18} /> : <Award aria-hidden="true" size={18} />}
                  </span>
                  {active ? (
                    <span className="loyalty-active-tier">
                      <Check aria-hidden="true" size={12} /> Active tier
                    </span>
                  ) : (
                    <span className="loyalty-tier-status-hint">
                      {chosen ? "Viewing perks" : "Select to compare"}
                    </span>
                  )}
                </div>
                <div className="loyalty-tier-name-row">
                  <strong>{tierLabel(tier)}</strong>
                  <span className="loyalty-tier-spend-range">{details.range}</span>
                </div>
                <div className="loyalty-tier-multiplier-banner">
                  <b>{TIER_MULTIPLIERS[tier]}× points multiplier</b>
                </div>
                <small className="loyalty-tier-lead-perk">{details.perk}</small>
                <ul className="loyalty-tier-perks-list" aria-label={`${tierLabel(tier)} key privileges`}>
                  {details.perks.map((item, index) => (
                    <li key={index}>
                      <Check aria-hidden="true" size={13} className="loyalty-perk-check" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <div className={"loyalty-tier-detail tier-" + selected} aria-live="polite">
          <div className="loyalty-tier-detail-icon">
            <Sparkles aria-hidden="true" size={20} />
          </div>
          <div className="loyalty-tier-detail-copy">
            <p>
              <strong>{tierLabel(selected)} privileges:</strong> {TIER_DETAILS[selected].perk}. Earn {TIER_MULTIPLIERS[selected]}× points on eligible settled stay spend.
            </p>
            <span className="loyalty-tier-detail-meta">
              {selected === data.tier
                ? "You are currently enjoying these benefits on every stay."
                : selected === "gold" && data.tier === "silver"
                  ? `₱${data.spendToNext.toLocaleString("en-PH")} more settled spend required to unlock Gold status.`
                  : selected === "platinum"
                    ? `₱${TIER_THRESHOLDS.platinum.toLocaleString("en-PH")} in lifetime settled spend required to achieve Platinum status.`
                    : "Base membership tier automatically included with every guest profile."}
            </span>
          </div>
        </div>
      </section>

      <section className="loyalty-how-it-works" aria-labelledby="loyalty-how-heading">
        <header className="loyalty-how-header">
          <span className="loyalty-section-eyebrow">Program Guide</span>
          <h2 id="loyalty-how-heading">How Haven Rewards works</h2>
          <p>A transparent, automated loyalty program designed to reward your return to Haven.</p>
        </header>
        <div className="loyalty-steps-grid">
          <div className="loyalty-step-card">
            <span className="loyalty-step-number">01</span>
            <div className="loyalty-step-content">
              <h3>Stay &amp; Earn</h3>
              <p>Earn 1× to 1.5× points on every ₱100 in settled folio spend. Points credit automatically to your ledger upon checkout.</p>
            </div>
          </div>
          <div className="loyalty-step-card">
            <span className="loyalty-step-number">02</span>
            <div className="loyalty-step-content">
              <h3>Ascend Tiers</h3>
              <p>Unlock Gold at ₱20,000 and Platinum at ₱50,000 lifetime spend for boosted multipliers and VIP room privileges.</p>
            </div>
          </div>
          <div className="loyalty-step-card">
            <span className="loyalty-step-number">03</span>
            <div className="loyalty-step-content">
              <h3>Redeem 1:1</h3>
              <p>Redeem your points directly during checkout for ₱1.00 off per point against room charges and stay folios.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="loyalty-ledger-card" aria-labelledby="loyalty-history-heading">
        <header>
          <div className="loyalty-ledger-head-left">
            <span className="loyalty-section-icon"><History aria-hidden="true" size={20} /></span>
            <div>
              <h2 id="loyalty-history-heading">Points transaction history</h2>
              <p>A clear record of points earned, redeemed, adjusted, or expired.</p>
            </div>
          </div>
          {data.ledger.length > 0 && (
            <span className="loyalty-ledger-count">
              {data.ledger.length} {data.ledger.length === 1 ? "entry" : "entries"}
            </span>
          )}
        </header>

        {data.ledger.length === 0 ? (
          <div className="loyalty-empty">
            <span className="loyalty-empty-icon"><ReceiptText aria-hidden="true" size={26} /></span>
            <h3>Your points story starts after checkout</h3>
            <p>Eligible points will appear here automatically once a completed stay is settled.</p>
            <Link href="/account/find-room" className="btn btn-soft loyalty-empty-cta">
              <Sparkles aria-hidden="true" size={14} />
              Book your next stay to start earning
            </Link>
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
                        <div className="loyalty-activity-cell">
                          <span className={"loyalty-transaction-badge type-" + row.transaction_type}>{transactionLabel(row.transaction_type)}</span>
                          {row.notes ? <small className="loyalty-activity-notes">{row.notes}</small> : null}
                        </div>
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
        <div className="loyalty-error-icon">
          <Award aria-hidden="true" size={24} />
        </div>
        <div className="loyalty-error-copy">
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
