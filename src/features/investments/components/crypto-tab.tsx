"use client";

import { useState, useMemo } from "react";
import {
  useUsdwPurchases,
  useAddUsdwPurchase,
  useDeleteUsdwPurchase,
  useBtcPurchases,
  useAddBtcPurchase,
  useDeleteBtcPurchase,
  useCryptoSnapshots,
  useUpsertCryptoSnapshot,
  useDeleteCryptoSnapshot,
  useCryptoSettings,
  useUpdateCryptoSellCommission,
  useUpdateCryptoCommissionRate,
  type UsdwPurchase,
  type BtcPurchase,
  type CryptoSnapshot,
} from "@/hooks/use-finance-data";
import EditableCell from "@/components/ui/editable-cell";
import Money from "@/components/ui/money";
import { formatCopInput, parse } from "@/lib/formatters";
import { useTranslation } from "@/hooks/use-translation";

// ── Styles ────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "16px 20px",
};

const btn = (color = "#7c3aed"): React.CSSProperties => ({
  padding: "6px 14px",
  background: color,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
});

const ghost: React.CSSProperties = {
  padding: "6px 14px",
  background: "transparent",
  color: "#6b7280",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};

const input: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

const label: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 4,
  display: "block",
  fontWeight: 500,
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function todayInput(): string {
  return new Date().toISOString().split("T")[0];
}

/** Days between a "YYYY-MM-DD"-ish date string and today. */
function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = new Date().setHours(0, 0, 0, 0);
  return Math.floor((now - then) / 86400000);
}

export function compareSnapshots(a: CryptoSnapshot, b: CryptoSnapshot): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

// ── FIFO cost-basis tracking ─────────────────────────────────────────────

interface UsdwLot { usdw: number; rateCop: number }

/** Walks USDW purchases and BTC exchanges in chronological order, consuming USDW lots
 * FIFO (oldest purchase first) whenever USDW is spent on BTC — the standard "which
 * specific dollars are these" accounting method. Returns what's left (by original
 * purchase rate) and the FIFO-attributed peso cost of everything spent on BTC. */
function fifoUsdwLots(usdwPurchases: UsdwPurchase[], btcPurchases: BtcPurchase[]) {
  type Event =
    | { type: "usdw"; date: number; usdwAmount: number; copAmount: number }
    | { type: "btc"; date: number; usdwAmount: number };

  const events: Event[] = [
    ...usdwPurchases.map(p => ({ type: "usdw" as const, date: new Date(p.date).getTime(), usdwAmount: p.usdwAmount, copAmount: p.copAmount })),
    ...btcPurchases.map(p => ({ type: "btc" as const, date: new Date(p.date).getTime(), usdwAmount: p.usdwAmount })),
  ].sort((a, b) => a.date - b.date);

  const lots: UsdwLot[] = [];
  let btcCostBasisCop = 0;

  for (const ev of events) {
    if (ev.type === "usdw") {
      if (ev.usdwAmount > 0) lots.push({ usdw: ev.usdwAmount, rateCop: ev.copAmount / ev.usdwAmount });
    } else {
      let remaining = ev.usdwAmount;
      while (remaining > 1e-9 && lots.length > 0) {
        const lot = lots[0];
        const consumed = Math.min(lot.usdw, remaining);
        btcCostBasisCop += consumed * lot.rateCop;
        lot.usdw -= consumed;
        remaining -= consumed;
        if (lot.usdw <= 1e-9) lots.shift();
      }
    }
  }

  const usdwHeldDerived = lots.reduce((s, l) => s + l.usdw, 0);
  const usdwCostBasisCop = lots.reduce((s, l) => s + l.usdw * l.rateCop, 0);
  return { usdwHeldDerived, usdwCostBasisCop, btcCostBasisCop };
}

/** Rolls a manually-recorded USDW balance forward by any purchases/exchanges dated *after* it,
 * so buying more USDW (or spending it on BTC) is reflected immediately without having to
 * re-enter your rates/balance every time — only needed once a month to true-up interest earned. */
function rollForwardUsdwBalance(
  balance: number,
  balanceDateMs: number,
  usdwPurchases: UsdwPurchase[],
  btcPurchases: BtcPurchase[]
): number {
  const purchasesAfter = usdwPurchases
    .filter(p => new Date(p.date).getTime() > balanceDateMs)
    .reduce((s, p) => s + p.usdwAmount, 0);
  const spentAfter = btcPurchases
    .filter(p => new Date(p.date).getTime() > balanceDateMs)
    .reduce((s, p) => s + p.usdwAmount, 0);
  return balance + purchasesAfter - spentAfter;
}

// ── Summary calculations ────────────────────────────────────────────────

export function computeSummary(usdwPurchases: UsdwPurchase[], btcPurchases: BtcPurchase[], snapshots: CryptoSnapshot[]) {
  const totalUsdwSpentOnBtc = btcPurchases.reduce((s, p) => s + p.usdwAmount, 0);
  const totalBtcBought = btcPurchases.reduce((s, p) => s + p.btcAmount, 0);

  // FIFO: the USDW units you still hold are specifically the *last* dollars you bought that
  // haven't been spent yet — not a blend of every purchase you've ever made.
  const { usdwHeldDerived, usdwCostBasisCop, btcCostBasisCop } = fifoUsdwLots(usdwPurchases, btcPurchases);
  // Average rate of the USDW you currently hold (FIFO cost ÷ units held).
  const avgHeldRate = usdwHeldDerived > 0 ? usdwCostBasisCop / usdwHeldDerived : 0;

  const sortedSnaps = [...snapshots].sort(compareSnapshots);
  const latestSnapshot = sortedSnaps.at(-1) ?? null;

  // If you've manually recorded your actual USDW balance (e.g. to reflect interest earned), use
  // that as the base and roll it forward by any purchases/BTC exchanges made since that date —
  // so new activity shows up immediately, and you only need to re-enter your real balance monthly.
  const hasUsdwBalanceOverride = latestSnapshot?.usdwBalance != null;
  const usdwHeld = latestSnapshot?.usdwBalance != null
    ? rollForwardUsdwBalance(
        latestSnapshot.usdwBalance,
        new Date(latestSnapshot.year, latestSnapshot.month - 1, latestSnapshot.day).getTime(),
        usdwPurchases,
        btcPurchases
      )
    : usdwHeldDerived;

  const usdCopRateNow = latestSnapshot?.usdCopRate ?? avgHeldRate;
  const usdGrowthPct = avgHeldRate > 0 ? ((usdCopRateNow / avgHeldRate) - 1) * 100 : 0;
  // Peso value gained/lost purely from the exchange rate moving, on the dollars you actually paid
  // for (excludes interest units — those are counted separately in usdwGainCop below).
  const usdwFxEffectCop = usdwHeldDerived * (usdCopRateNow - avgHeldRate);
  const usdValueCop = usdwHeld * usdCopRateNow;

  // Gain in USD: dollars earned as interest (1 USDW ≈ 1 USD by design) — excludes any peso effect.
  const usdwGainUsd = usdwHeld - usdwHeldDerived;
  // Gain in COP: your *real* peso profit — current value at the latest registered rate minus what
  // you actually paid in pesos for the units you hold. This is usdwFxEffectCop (currency movement
  // on your principal) + the interest units valued at today's rate — which is why it isn't just
  // usdwGainUsd × rate.
  const usdwGainCop = usdValueCop - usdwCostBasisCop;

  // Average price you actually paid per BTC (in USDW), so you can compare it to the current price.
  const avgBtcBuyPriceUsdw = totalBtcBought > 0 ? totalUsdwSpentOnBtc / totalBtcBought : 0;
  const btcPriceUsdNow = latestSnapshot?.btcPriceUsd ?? avgBtcBuyPriceUsdw;
  const btcValueUsd = totalBtcBought * btcPriceUsdNow;
  const btcGrowthPct = totalUsdwSpentOnBtc > 0 ? ((btcValueUsd / totalUsdwSpentOnBtc) - 1) * 100 : 0;
  const btcValueCop = btcValueUsd * usdCopRateNow;
  // Gain in USD: BTC price appreciation at the latest registered price, vs. the USDW you spent.
  const btcGainUsd = btcValueUsd - totalUsdwSpentOnBtc;
  // Gain in COP: real peso profit — current value at the latest rate minus the FIFO peso cost of
  // the specific USDW lots that were spent on this BTC.
  const btcGainCop = btcValueCop - btcCostBasisCop;

  return {
    usdwHeld,
    usdwHeldDerived,
    hasUsdwBalanceOverride,
    usdwCostBasisCop,
    usdwGainUsd,
    usdwGainCop,
    avgHeldRate,
    usdCopRateNow,
    usdGrowthPct,
    usdwFxEffectCop,
    usdValueCop,
    btcHeld: totalBtcBought,
    btcCostUsdw: totalUsdwSpentOnBtc,
    btcCostBasisCop,
    avgBtcBuyPriceUsdw,
    btcPriceUsdNow,
    btcValueUsd,
    btcValueCop,
    btcGrowthPct,
    btcGainUsd,
    btcGainCop,
    latestSnapshot,
  };
}

/** Portfolio-chart helper: invested COP + current COP value of the crypto position as of a given
 * absolute month (year*12 + monthIndex), using only purchases/snapshots up to that month. */
export function computeCryptoValueAtMonth(
  usdwPurchases: UsdwPurchase[],
  btcPurchases: BtcPurchase[],
  snapshots: CryptoSnapshot[],
  monthAbs: number
): { invested: number; value: number; usdwValue: number; btcValue: number } {
  const relevantUsdw = usdwPurchases.filter(p => {
    const d = new Date(p.date);
    return d.getUTCFullYear() * 12 + d.getUTCMonth() <= monthAbs;
  });
  const relevantBtc = btcPurchases.filter(p => {
    const d = new Date(p.date);
    return d.getUTCFullYear() * 12 + d.getUTCMonth() <= monthAbs;
  });

  const invested = relevantUsdw.reduce((s, p) => s + p.copAmount, 0);
  const btcHeld = relevantBtc.reduce((s, p) => s + p.btcAmount, 0);
  const { usdwHeldDerived, usdwCostBasisCop, btcCostBasisCop } = fifoUsdwLots(relevantUsdw, relevantBtc);
  const avgHeldRate = usdwHeldDerived > 0 ? usdwCostBasisCop / usdwHeldDerived : 0;

  const relevantSnaps = snapshots
    .filter(s => s.year * 12 + (s.month - 1) <= monthAbs)
    .sort(compareSnapshots);
  const latest = relevantSnaps.at(-1) ?? null;
  const usdwHeld = latest?.usdwBalance != null
    ? rollForwardUsdwBalance(
        latest.usdwBalance,
        new Date(latest.year, latest.month - 1, latest.day).getTime(),
        relevantUsdw,
        relevantBtc
      )
    : usdwHeldDerived;

  const usdwValue = latest ? usdwHeld * latest.usdCopRate : usdwHeld * avgHeldRate;
  const btcValue = latest ? btcHeld * latest.btcPriceUsd * latest.usdCopRate : btcCostBasisCop;
  return { invested, value: usdwValue + btcValue, usdwValue, btcValue };
}

/** Sell commission to use: the explicit override if one was ever saved (> 0),
 * otherwise the default 0.1%-style rate applied to the position's current value. */
export function effectiveSellCommission(storedSellCommission: number, currentValue: number, commissionRate: number): number {
  return storedSellCommission > 0 ? storedSellCommission : Math.round(currentValue * commissionRate);
}

// ── Main tab ──────────────────────────────────────────────────────────

export default function CryptoTab() {
  const { t } = useTranslation();
  const { data: usdwPurchases = [] } = useUsdwPurchases();
  const { data: btcPurchases = [] } = useBtcPurchases();
  const { data: snapshots = [] } = useCryptoSnapshots();
  const { data: settings } = useCryptoSettings();

  const addUsdwMut = useAddUsdwPurchase();
  const deleteUsdwMut = useDeleteUsdwPurchase();
  const addBtcMut = useAddBtcPurchase();
  const deleteBtcMut = useDeleteBtcPurchase();
  const upsertSnapMut = useUpsertCryptoSnapshot();
  const deleteSnapMut = useDeleteCryptoSnapshot();
  const updateSellCommMut = useUpdateCryptoSellCommission();
  const updateRateMut = useUpdateCryptoCommissionRate();

  const summary = useMemo(
    () => computeSummary(usdwPurchases, btcPurchases, snapshots),
    [usdwPurchases, btcPurchases, snapshots]
  );

  const commissionRate = settings?.commissionRate ?? 0.001;
  const totalInvested = useMemo(() => usdwPurchases.reduce((s, p) => s + p.copAmount, 0), [usdwPurchases]);
  const totalCurrentValue = summary.usdValueCop + summary.btcValueCop;
  const sellCommission = effectiveSellCommission(settings?.sellCommission ?? 0, totalCurrentValue, commissionRate);
  const totalGain = totalCurrentValue - totalInvested;
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const netIfSold = totalGain - sellCommission;
  const netIfSoldPct = totalInvested > 0 ? (netIfSold / totalInvested) * 100 : 0;

  const latestSnapIso = summary.latestSnapshot
    ? `${summary.latestSnapshot.year}-${String(summary.latestSnapshot.month).padStart(2, "0")}-${String(summary.latestSnapshot.day).padStart(2, "0")}`
    : null;
  const daysSinceUpdate = latestSnapIso ? daysSince(latestSnapIso) : 0;
  const staleColor = daysSinceUpdate > 35 ? "#dc2626" : daysSinceUpdate > 20 ? "#d97706" : "#9ca3af";

  const [showUsdwForm, setShowUsdwForm] = useState(false);
  const [showBtcForm, setShowBtcForm] = useState(false);
  const [showSnapForm, setShowSnapForm] = useState(false);

  return (
    <>
      {/* Position summary */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>{t("crypto.positionTitle")}</div>
        <StatRow label={t("crypto.invested")} value={<Money amount={totalInvested} />} />
        <StatRow label={t("crypto.currentValue")} value={<Money amount={totalCurrentValue} />} valueColor="#059669" />
        <StatRow
          label={t("crypto.gainLoss")}
          value={<>{totalGain >= 0 ? "+" : ""}<Money amount={totalGain} /> ({totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(2)}%)</>}
          valueColor={totalGain >= 0 ? "#059669" : "#dc2626"}
        />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, alignItems: "center" }}>
          <span style={{ color: "#6b7280" }}>
            {t("crypto.sellCommission")} <span style={{ color: "#9ca3af" }}>{t("crypto.defaultPct", { pct: (commissionRate * 100).toFixed(2) })}</span>
          </span>
          <EditableCell
            value={sellCommission}
            edited={(settings?.sellCommission ?? 0) > 0}
            onChange={v => updateSellCommMut.mutate(v)}
          />
        </div>
        <StatRow
          label={t("crypto.netIfSold")}
          value={<>{netIfSold >= 0 ? "+" : ""}<Money amount={netIfSold} /> ({netIfSoldPct >= 0 ? "+" : ""}{netIfSoldPct.toFixed(2)}%)</>}
          valueColor={netIfSold >= 0 ? "#059669" : "#dc2626"}
        />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, alignItems: "center" }}>
          <span style={{ color: "#6b7280" }}>{t("crypto.defaultExchangeCommission")}</span>
          <PercentEditableCell value={commissionRate} onChange={v => updateRateMut.mutate(v)} />
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>
            {t("crypto.usdwTitle")}
            {summary.hasUsdwBalanceOverride && (
              <span style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>{t("crypto.manualBalanceNote")}</span>
            )}
          </div>
          <StatRow label={t("crypto.held")} value={<Money amount={summary.usdwHeld} currency="USDW" />} />
          <StatRow label={t("crypto.invested")} value={<Money amount={summary.usdwCostBasisCop} />} />
          <StatRow label={t("crypto.valueInCop")} value={<Money amount={summary.usdValueCop} />} valueColor="#059669" />
          <StatRow label={t("crypto.avgBuyRatePerUsd")} value={summary.avgHeldRate > 0 ? <Money amount={summary.avgHeldRate} /> : "—"} />

          <SectionLabel>{t("crypto.performance")}</SectionLabel>
          <StatRow
            label={t("crypto.currencyEffectCop")}
            value={summary.avgHeldRate > 0
              ? <>{summary.usdwFxEffectCop >= 0 ? "+" : ""}<Money amount={summary.usdwFxEffectCop} /> ({summary.usdGrowthPct >= 0 ? "+" : ""}{summary.usdGrowthPct.toFixed(2)}%)</>
              : "—"}
            valueColor={summary.usdwFxEffectCop >= 0 ? "#059669" : "#dc2626"}
          />
          <StatRow
            label={t("crypto.gainLossUsd")}
            value={summary.usdwHeldDerived > 0 || summary.hasUsdwBalanceOverride
              ? <>{summary.usdwGainUsd >= 0 ? "+" : ""}<Money amount={summary.usdwGainUsd} currency="USDW" /></>
              : "—"}
            valueColor={summary.usdwGainUsd >= 0 ? "#059669" : "#dc2626"}
          />
          <StatRow
            label={t("crypto.gainLossCop")}
            value={summary.usdwHeldDerived > 0 || summary.hasUsdwBalanceOverride
              ? <>{summary.usdwGainCop >= 0 ? "+" : ""}<Money amount={summary.usdwGainCop} /></>
              : "—"}
            valueColor={summary.usdwGainCop >= 0 ? "#059669" : "#dc2626"}
          />
        </div>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>{t("crypto.btcTitle")}</div>
          <StatRow label={t("crypto.held")} value={<Money amount={summary.btcHeld} currency="BTC" />} />
          <StatRow label={t("crypto.investedUsd")} value={summary.btcCostUsdw > 0 ? <Money amount={summary.btcCostUsdw} currency="USDW" /> : "—"} />
          <StatRow label={t("crypto.investedCop")} value={summary.btcCostUsdw > 0 ? <Money amount={summary.btcCostBasisCop} /> : "—"} />
          <StatRow label={t("crypto.avgBuyPricePerBtc")} value={summary.avgBtcBuyPriceUsdw > 0 ? <Money amount={summary.avgBtcBuyPriceUsdw} currency="USDW" /> : "—"} />
          <StatRow label={t("crypto.btcPrice")} value={summary.btcPriceUsdNow > 0 ? <Money amount={summary.btcPriceUsdNow} currency="USD" /> : "—"} />
          <StatRow label={t("crypto.valueInUsd")} value={<Money amount={summary.btcValueUsd} currency="USD" />} valueColor="#059669" />
          <StatRow label={t("crypto.valueInCop")} value={<Money amount={summary.btcValueCop} />} valueColor="#059669" />

          <SectionLabel>{t("crypto.performance")}</SectionLabel>
          <StatRow
            label={t("crypto.growthSincePurchase")}
            value={summary.btcCostUsdw > 0 ? `${summary.btcGrowthPct >= 0 ? "+" : ""}${summary.btcGrowthPct.toFixed(2)}%` : "—"}
            valueColor={summary.btcGrowthPct >= 0 ? "#059669" : "#dc2626"}
          />
          <StatRow
            label={t("crypto.gainLossUsd")}
            value={summary.btcCostUsdw > 0
              ? <>{summary.btcGainUsd >= 0 ? "+" : ""}<Money amount={summary.btcGainUsd} currency="USD" /></>
              : "—"}
            valueColor={summary.btcGainUsd >= 0 ? "#059669" : "#dc2626"}
          />
          <StatRow
            label={t("crypto.gainLossCop")}
            value={summary.btcCostUsdw > 0
              ? <>{summary.btcGainCop >= 0 ? "+" : ""}<Money amount={summary.btcGainCop} /></>
              : "—"}
            valueColor={summary.btcGainCop >= 0 ? "#059669" : "#dc2626"}
          />
        </div>
      </div>

      {/* Rates snapshot */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showSnapForm ? 12 : 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("crypto.ratesTitle")}</div>
            {summary.latestSnapshot && latestSnapIso && (
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                {t("crypto.lastUpdated")} {fmtDate(latestSnapIso)}
                {" "}<span style={{ color: staleColor, fontWeight: 600 }}>
                  ({daysSinceUpdate === 0 ? t("crypto.daysAgoToday") : daysSinceUpdate === 1 ? t("crypto.daysAgoOne") : t("crypto.daysAgoMany", { days: daysSinceUpdate })})
                </span>
                {" · "}{t("crypto.usdCopRateInline")} <strong>{<Money amount={summary.latestSnapshot.usdCopRate} />}</strong>
                {" · "}{t("crypto.btcInline")} <strong>{<Money amount={summary.latestSnapshot.btcPriceUsd} currency="USD" />}</strong>
              </div>
            )}
          </div>
          {!showSnapForm && <button onClick={() => setShowSnapForm(true)} style={btn()}>{t("crypto.updateRates")}</button>}
        </div>
        {showSnapForm && (
          <SnapshotForm
            onSave={data => { upsertSnapMut.mutate(data); setShowSnapForm(false); }}
            onCancel={() => setShowSnapForm(false)}
            loading={upsertSnapMut.isPending}
          />
        )}
        {snapshots.length > 0 && (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {[t("crypto.colDate"), t("crypto.colUsdCop"), t("crypto.colBtcUsd"), t("crypto.colUsdwBalance"), ""].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...snapshots].sort(compareSnapshots).reverse().map(s => (
                  <tr key={s.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "7px 10px" }}>{fmtDate(`${s.year}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`)}</td>
                    <td style={{ padding: "7px 10px" }}>{<Money amount={s.usdCopRate} />}</td>
                    <td style={{ padding: "7px 10px" }}>{<Money amount={s.btcPriceUsd} currency="USD" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{s.usdwBalance != null ? <Money amount={s.usdwBalance} currency="USDW" /> : "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>
                      <button
                        onClick={() => deleteSnapMut.mutate({ day: s.day, month: s.month, year: s.year })}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 11 }}
                      >✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* USDW purchases */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showUsdwForm ? 12 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("crypto.usdwPurchasesTitle")}</div>
          {!showUsdwForm && <button onClick={() => setShowUsdwForm(true)} style={btn()}>{t("crypto.addPurchase")}</button>}
        </div>
        {showUsdwForm && (
          <UsdwPurchaseForm
            onSave={data => { addUsdwMut.mutate(data); setShowUsdwForm(false); }}
            onCancel={() => setShowUsdwForm(false)}
            loading={addUsdwMut.isPending}
            commissionRate={commissionRate}
          />
        )}
        {usdwPurchases.length === 0 ? (
          <div style={{ padding: "12px 0", color: "#9ca3af", fontSize: 12 }}>{t("crypto.noEntries")}</div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {[t("crypto.colDate"), t("crypto.colCopPaid"), t("crypto.colCommission"), t("crypto.colUsdwReceived"), t("crypto.colImpliedRate"), t("crypto.colNotes"), ""].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...usdwPurchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (
                  <tr key={p.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "7px 10px" }}>{fmtDate(p.date)}</td>
                    <td style={{ padding: "7px 10px" }}>{<Money amount={p.copAmount} />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{<Money amount={p.commissionCop} />}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600 }}>{<Money amount={p.usdwAmount} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{<Money amount={p.copAmount / p.usdwAmount} />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{p.notes || "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>
                      <button
                        onClick={() => deleteUsdwMut.mutate(p.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 11 }}
                      >✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* BTC purchases */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showBtcForm ? 12 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("crypto.btcExchangesTitle")}</div>
          {!showBtcForm && <button onClick={() => setShowBtcForm(true)} style={btn()}>{t("crypto.addExchange")}</button>}
        </div>
        {showBtcForm && (
          <BtcPurchaseForm
            onSave={data => { addBtcMut.mutate(data); setShowBtcForm(false); }}
            onCancel={() => setShowBtcForm(false)}
            loading={addBtcMut.isPending}
            commissionRate={commissionRate}
            availableUsdw={summary.usdwHeld}
          />
        )}
        {btcPurchases.length === 0 ? (
          <div style={{ padding: "12px 0", color: "#9ca3af", fontSize: 12 }}>{t("crypto.noEntries")}</div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {[t("crypto.colDate"), t("crypto.colUsdwIn"), t("crypto.colCommission"), t("crypto.btcPrice"), t("crypto.colBtcReceived"), t("crypto.colNotes"), ""].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...btcPurchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (
                  <tr key={p.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "7px 10px" }}>{fmtDate(p.date)}</td>
                    <td style={{ padding: "7px 10px" }}>{<Money amount={p.usdwAmount} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{<Money amount={p.commissionUsdw} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{<Money amount={p.btcPriceUsdw} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600 }}>{<Money amount={p.btcAmount} currency="BTC" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{p.notes || "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>
                      <button
                        onClick={() => deleteBtcMut.mutate(p.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 11 }}
                      >✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function StatRow({ label: l, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
      <span style={{ color: "#6b7280" }}>{l}</span>
      <span style={{ fontWeight: 600, color: valueColor ?? "#1f2937" }}>{value}</span>
    </div>
  );
}

/** Small uppercase divider used to group related StatRows within a card. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.04em", textTransform: "uppercase",
      marginTop: 10, marginBottom: 4, paddingTop: 8, borderTop: "1px solid #f3f4f6",
    }}>
      {children}
    </div>
  );
}

/** Click-to-edit percentage (stored internally as a decimal rate, e.g. 0.001 = 0.10%). */
function PercentEditableCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  function start() {
    setText(String(value * 100));
    setEditing(true);
  }

  function done() {
    const pct = Number(text.replace(",", "."));
    if (!isNaN(pct) && pct >= 0) onChange(pct / 100);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={done}
        onKeyDown={e => { if (e.key === "Enter") done(); if (e.key === "Escape") setEditing(false); }}
        style={{ width: 70, padding: "3px 6px", borderRadius: 6, border: "2px solid #6366f1", fontSize: 12, textAlign: "right", outline: "none" }}
      />
    );
  }

  return (
    <span
      onClick={start}
      title={t("crypto.clickToEdit")}
      style={{
        cursor: "text", padding: "3px 8px", borderRadius: 6,
        background: value > 0 ? "#ede9fe" : "#f9fafb",
        color: value > 0 ? "#4f46e5" : "#9ca3af",
        fontWeight: value > 0 ? 700 : 400, fontSize: 12,
        display: "inline-block", minWidth: 50, textAlign: "right",
        border: "1px dashed", borderColor: value > 0 ? "#a5b4fc" : "#e5e7eb",
      }}
    >
      {(value * 100).toFixed(2)}%
    </span>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────

function UsdwPurchaseForm({ onSave, onCancel, loading, commissionRate }: {
  onSave: (data: { date: string; copAmount: number; commissionCop: number; usdwAmount: number; notes?: string }) => void;
  onCancel: () => void;
  loading: boolean;
  commissionRate: number;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayInput());
  const [copAmount, setCopAmount] = useState("");
  const [commissionCop, setCommissionCop] = useState("0");
  const [commissionTouched, setCommissionTouched] = useState(false);
  const [usdwAmount, setUsdwAmount] = useState("");
  const [notes, setNotes] = useState("");

  function handleCopAmountChange(raw: string) {
    const formatted = formatCopInput(raw);
    setCopAmount(formatted);
    if (!commissionTouched) {
      const cop = parse(formatted);
      const defaultComm = Math.round(cop * commissionRate * 100) / 100;
      setCommissionCop(defaultComm > 0 ? formatCopInput(String(defaultComm).replace(".", ",")) : "0");
    }
  }

  function handleSubmit() {
    const cop = parse(copAmount);
    const comm = parse(commissionCop);
    const usdw = Number(usdwAmount);
    if (!date || !cop || !usdw) return;
    onSave({ date, copAmount: cop, commissionCop: comm, usdwAmount: usdw, notes });
  }

  return (
    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <span style={label}>{t("crypto.colDate")}</span>
          <input style={input} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.copPaidTotal")}</span>
          <input style={input} placeholder={t("crypto.placeholderCopAmount")} value={copAmount}
            onChange={e => handleCopAmountChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.commissionCopLabel")} <span style={{ color: "#9ca3af" }}>{t("crypto.defaultPct", { pct: (commissionRate * 100).toFixed(2) })}</span></span>
          <input style={input} placeholder={t("crypto.placeholderZero")} value={commissionCop}
            onChange={e => {
              setCommissionTouched(true);
              setCommissionCop(formatCopInput(e.target.value));
            }} />
        </div>
        <div>
          <span style={label}>{t("crypto.colUsdwReceived")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderUsdwAmount")} value={usdwAmount} onChange={e => setUsdwAmount(e.target.value)} />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <span style={label}>{t("crypto.colNotes")}</span>
        <input style={input} placeholder={t("crypto.optional")} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSubmit} style={btn()} disabled={loading}>{loading ? t("crypto.saving") : t("crypto.save")}</button>
        <button onClick={onCancel} style={ghost}>{t("crypto.cancel")}</button>
      </div>
    </div>
  );
}

function BtcPurchaseForm({ onSave, onCancel, loading, commissionRate, availableUsdw }: {
  onSave: (data: { date: string; usdwAmount: number; commissionUsdw: number; btcPriceUsdw: number; btcAmount: number; notes?: string }) => void;
  onCancel: () => void;
  loading: boolean;
  commissionRate: number;
  availableUsdw: number;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayInput());
  const [usdwAmount, setUsdwAmount] = useState("");
  const [commissionUsdw, setCommissionUsdw] = useState("0");
  const [commissionTouched, setCommissionTouched] = useState(false);
  const [btcPriceUsdw, setBtcPriceUsdw] = useState("");
  const [btcAmount, setBtcAmount] = useState("");
  // Tracks which of price/received the user is driving, so the other one is the derived field.
  const [lastEdited, setLastEdited] = useState<"price" | "received" | null>(null);

  // Net USDW actually converted to BTC (the commission is taken off the top).
  function netUsdw(usdwStr: string, commStr: string): number {
    const usdw = Number(usdwStr) || 0;
    const comm = Number(commStr) || 0;
    return Math.max(usdw - comm, 0);
  }

  function handleUsdwAmountChange(raw: string) {
    setUsdwAmount(raw);
    let nextCommission = commissionUsdw;
    if (!commissionTouched) {
      const usdw = Number(raw);
      nextCommission = usdw > 0 ? (usdw * commissionRate).toFixed(4) : "0";
      setCommissionUsdw(nextCommission);
    }
    const net = netUsdw(raw, nextCommission);
    if (lastEdited === "price") {
      const price = Number(btcPriceUsdw);
      if (net > 0 && price > 0) setBtcAmount((net / price).toFixed(8));
    } else if (lastEdited === "received") {
      const received = Number(btcAmount);
      if (net > 0 && received > 0) setBtcPriceUsdw((net / received).toFixed(2));
    }
  }

  function handleCommissionChange(raw: string) {
    setCommissionTouched(true);
    setCommissionUsdw(raw);
    const net = netUsdw(usdwAmount, raw);
    if (lastEdited === "price") {
      const price = Number(btcPriceUsdw);
      if (net > 0 && price > 0) setBtcAmount((net / price).toFixed(8));
    } else if (lastEdited === "received") {
      const received = Number(btcAmount);
      if (net > 0 && received > 0) setBtcPriceUsdw((net / received).toFixed(2));
    }
  }

  function handlePriceChange(raw: string) {
    setBtcPriceUsdw(raw);
    setLastEdited("price");
    const net = netUsdw(usdwAmount, commissionUsdw);
    const price = Number(raw);
    if (net > 0 && price > 0) setBtcAmount((net / price).toFixed(8));
  }

  function handleReceivedChange(raw: string) {
    setBtcAmount(raw);
    setLastEdited("received");
    const net = netUsdw(usdwAmount, commissionUsdw);
    const received = Number(raw);
    if (net > 0 && received > 0) setBtcPriceUsdw((net / received).toFixed(2));
  }

  const usdwExceedsAvailable = Number(usdwAmount) > availableUsdw;

  function handleSubmit() {
    const usdw = Number(usdwAmount);
    const comm = Number(commissionUsdw) || 0;
    const price = Number(btcPriceUsdw);
    const btc = Number(btcAmount);
    if (!date || !usdw || !price || !btc || usdwExceedsAvailable) return;
    onSave({ date, usdwAmount: usdw, commissionUsdw: comm, btcPriceUsdw: price, btcAmount: btc });
  }

  return (
    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <span style={label}>{t("crypto.colDate")}</span>
          <input style={input} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.usdwInTotal")} <span style={{ color: "#9ca3af" }}>{t("crypto.availableLabel")} {<Money amount={availableUsdw} currency="USDW" />}</span></span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderUsdwAmount")} value={usdwAmount} onChange={e => handleUsdwAmountChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.commissionUsdwLabel")} <span style={{ color: "#9ca3af" }}>{t("crypto.defaultPct", { pct: (commissionRate * 100).toFixed(2) })}</span></span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderZero")} value={commissionUsdw}
            onChange={e => handleCommissionChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.btcPriceUsdwLabel")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderBtcPrice")} value={btcPriceUsdw} onChange={e => handlePriceChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.colBtcReceived")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderBtcReceived")} value={btcAmount} onChange={e => handleReceivedChange(e.target.value)} />
        </div>
      </div>
      {usdwExceedsAvailable && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 12 }}>
          {t("crypto.onlyAvailablePrefix")} {<Money amount={availableUsdw} currency="USDW" />} {t("crypto.onlyAvailableSuffix")}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSubmit}
          style={{ ...btn(), opacity: usdwExceedsAvailable ? 0.5 : 1, cursor: usdwExceedsAvailable ? "not-allowed" : "pointer" }}
          disabled={loading || usdwExceedsAvailable}
        >{loading ? t("crypto.saving") : t("crypto.save")}</button>
        <button onClick={onCancel} style={ghost}>{t("crypto.cancel")}</button>
      </div>
    </div>
  );
}

function SnapshotForm({ onSave, onCancel, loading }: {
  onSave: (data: { day: number; month: number; year: number; usdCopRate: number; btcPriceUsd: number; usdwBalance?: number }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayInput());
  const [usdCopRate, setUsdCopRate] = useState("");
  const [btcPriceUsd, setBtcPriceUsd] = useState("");
  const [usdwBalance, setUsdwBalance] = useState("");

  function handleSubmit() {
    const rate = parse(usdCopRate);
    const btcPrice = Number(btcPriceUsd);
    if (!date || !rate || !btcPrice) return;
    const [y, m, d] = date.split("-").map(Number);
    const balance = usdwBalance.trim() ? Number(usdwBalance) : undefined;
    onSave({ day: d, month: m, year: y, usdCopRate: rate, btcPriceUsd: btcPrice, usdwBalance: balance });
  }

  return (
    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <span style={label}>{t("crypto.colDate")}</span>
          <input style={input} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.usdCopRateLabel")}</span>
          <input style={input} placeholder={t("crypto.placeholderUsdCopRate")} value={usdCopRate}
            onChange={e => setUsdCopRate(formatCopInput(e.target.value))} />
        </div>
        <div>
          <span style={label}>{t("crypto.btcPriceUsdLabel")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderBtcPrice")} value={btcPriceUsd} onChange={e => setBtcPriceUsd(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.colUsdwBalance")} <span style={{ color: "#9ca3af" }}>{t("crypto.usdwBalanceNote")}</span></span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderUsdwBalance")} value={usdwBalance} onChange={e => setUsdwBalance(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSubmit} style={btn()} disabled={loading}>{loading ? t("crypto.saving") : t("crypto.save")}</button>
        <button onClick={onCancel} style={ghost}>{t("crypto.cancel")}</button>
      </div>
    </div>
  );
}
