"use client";

import { useState, useMemo } from "react";
import {
  useUsdwPurchases,
  useAddUsdwPurchase,
  useDeleteUsdwPurchase,
  useUsdwSales,
  useAddUsdwSale,
  useDeleteUsdwSale,
  useBtcPurchases,
  useAddBtcPurchase,
  useDeleteBtcPurchase,
  useSolPurchases,
  useAddSolPurchase,
  useDeleteSolPurchase,
  useBtcSales,
  useAddBtcSale,
  useDeleteBtcSale,
  useSolSales,
  useAddSolSale,
  useDeleteSolSale,
  useCryptoSnapshots,
  useUpsertCryptoSnapshot,
  useDeleteCryptoSnapshot,
  useCryptoSettings,
  useUpdateCryptoSellCommission,
  useUpdateCryptoCommissionRate,
  useUpdateBtcTargetGrowthPct,
  useUpdateSolTargetGrowthPct,
  type UsdwPurchase,
  type BtcPurchase,
  type SolPurchase,
  type BtcSale,
  type SolSale,
  type UsdwSale,
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

/** Walks USDW purchases, every crypto exchange that spends USDW (BTC, SOL, ...), and every
 * USDW "receipt" (e.g. proceeds re-entering the pool from a BTC/SOL sale) in chronological
 * order, consuming USDW lots FIFO (oldest purchase first) — the standard "which specific
 * dollars are these" accounting method. Returns what's left (by original purchase rate), the
 * FIFO-attributed peso cost of everything spent (by asset kind, and per individual spend event
 * — the latter lets a caller build per-purchase cost basis for a specific BTC/SOL lot). */
function fifoUsdwLots(
  usdwPurchases: UsdwPurchase[],
  spends: Array<{ id: string; date: string; usdwAmount: number; kind: string }>,
  receipts: Array<{ date: string; usdwAmount: number; copValue: number }> = []
) {
  type Event =
    | { type: "usdw"; date: number; usdwAmount: number; copAmount: number }
    | { type: "spend"; date: number; usdwAmount: number; kind: string; id: string };

  const events: Event[] = [
    ...usdwPurchases.map(p => ({ type: "usdw" as const, date: new Date(p.date).getTime(), usdwAmount: p.usdwAmount, copAmount: p.copAmount })),
    ...receipts.map(r => ({ type: "usdw" as const, date: new Date(r.date).getTime(), usdwAmount: r.usdwAmount, copAmount: r.copValue })),
    ...spends.map(p => ({ type: "spend" as const, date: new Date(p.date).getTime(), usdwAmount: p.usdwAmount, kind: p.kind, id: p.id })),
  ].sort((a, b) => a.date - b.date);

  const lots: UsdwLot[] = [];
  const costBasisByKind: Record<string, number> = {};
  const costByEventId: Record<string, number> = {};

  for (const ev of events) {
    if (ev.type === "usdw") {
      if (ev.usdwAmount > 0) lots.push({ usdw: ev.usdwAmount, rateCop: ev.copAmount / ev.usdwAmount });
    } else {
      let remaining = ev.usdwAmount;
      while (remaining > 1e-9 && lots.length > 0) {
        const lot = lots[0];
        const consumed = Math.min(lot.usdw, remaining);
        const cost = consumed * lot.rateCop;
        costBasisByKind[ev.kind] = (costBasisByKind[ev.kind] ?? 0) + cost;
        costByEventId[ev.id] = (costByEventId[ev.id] ?? 0) + cost;
        lot.usdw -= consumed;
        remaining -= consumed;
        if (lot.usdw <= 1e-9) lots.shift();
      }
    }
  }

  const usdwHeldDerived = lots.reduce((s, l) => s + l.usdw, 0);
  const usdwCostBasisCop = lots.reduce((s, l) => s + l.usdw * l.rateCop, 0);
  return { usdwHeldDerived, usdwCostBasisCop, costBasisByKind, costByEventId };
}

interface AssetLot { amount: number; usdwCost: number; copCost: number }

/** FIFO-matches sales against buy lots of a single crypto asset (oldest units sold first), so a
 * partial sell realizes gain only on the specific units it closes out — not a blend of your
 * whole position. Returns the cost basis of what's left (for unrealized gain) plus the
 * cumulative realized gain/loss from everything already sold. */
function fifoAssetLots(
  buys: Array<{ date: string; amount: number; usdwCost: number; copCost: number }>,
  sells: Array<{ id: string; date: string; amount: number; usdwReceived: number; copReceived: number }>
) {
  type Event =
    | { type: "buy"; date: number; amount: number; usdwCost: number; copCost: number }
    | { type: "sell"; date: number; id: string; amount: number; usdwReceived: number; copReceived: number };

  const events: Event[] = [
    ...buys.map(b => ({ type: "buy" as const, date: new Date(b.date).getTime(), amount: b.amount, usdwCost: b.usdwCost, copCost: b.copCost })),
    ...sells.map(s => ({ type: "sell" as const, date: new Date(s.date).getTime(), id: s.id, amount: s.amount, usdwReceived: s.usdwReceived, copReceived: s.copReceived })),
  ].sort((a, b) => a.date - b.date);

  const lots: AssetLot[] = [];
  let realizedGainUsdw = 0;
  let realizedGainCop = 0;
  let totalUsdwReceived = 0;
  let totalCopReceived = 0;
  const realizedGainUsdwById: Record<string, number> = {};
  const realizedGainCopById: Record<string, number> = {};

  for (const ev of events) {
    if (ev.type === "buy") {
      if (ev.amount > 0) lots.push({ amount: ev.amount, usdwCost: ev.usdwCost, copCost: ev.copCost });
    } else {
      let remaining = ev.amount;
      let costBasisUsdw = 0;
      let costBasisCop = 0;
      while (remaining > 1e-12 && lots.length > 0) {
        const lot = lots[0];
        const consumed = Math.min(lot.amount, remaining);
        const frac = consumed / lot.amount;
        const consumedUsdwCost = lot.usdwCost * frac;
        const consumedCopCost = lot.copCost * frac;
        costBasisUsdw += consumedUsdwCost;
        costBasisCop += consumedCopCost;
        lot.amount -= consumed;
        lot.usdwCost -= consumedUsdwCost;
        lot.copCost -= consumedCopCost;
        remaining -= consumed;
        if (lot.amount <= 1e-12) lots.shift();
      }
      totalUsdwReceived += ev.usdwReceived;
      totalCopReceived += ev.copReceived;
      const gainUsdw = ev.usdwReceived - costBasisUsdw;
      const gainCop = ev.copReceived - costBasisCop;
      realizedGainUsdw += gainUsdw;
      realizedGainCop += gainCop;
      realizedGainUsdwById[ev.id] = gainUsdw;
      realizedGainCopById[ev.id] = gainCop;
    }
  }

  const heldAmount = lots.reduce((s, l) => s + l.amount, 0);
  const costBasisUsdwHeld = lots.reduce((s, l) => s + l.usdwCost, 0);
  const costBasisCopHeld = lots.reduce((s, l) => s + l.copCost, 0);

  return {
    heldAmount, costBasisUsdwHeld, costBasisCopHeld, realizedGainUsdw, realizedGainCop, totalUsdwReceived, totalCopReceived,
    realizedGainUsdwById, realizedGainCopById,
  };
}

/** Best-available USD/COP rate at a given date: the latest snapshot at or before that date,
 * falling back to the earliest one available, or 0 if there are no snapshots at all yet. Used to
 * price USDW proceeds re-entering the pool from a crypto sale at the rate that applied *then*. */
function usdCopRateAt(sortedSnaps: CryptoSnapshot[], dateMs: number): number {
  if (sortedSnaps.length === 0) return 0;
  const priorOrSame = sortedSnaps.filter(s => new Date(s.year, s.month - 1, s.day).getTime() <= dateMs).at(-1);
  return (priorOrSame ?? sortedSnaps[0]).usdCopRate;
}

/** Rolls a manually-recorded USDW balance forward by any dated USDW deltas after it — purchases
 * and crypto-sale proceeds add, BTC/SOL buys subtract — so new activity shows up immediately
 * without having to re-enter your real balance every time. */
function rollForwardUsdwBalance(
  balance: number,
  balanceDateMs: number,
  deltas: Array<{ date: string; usdwDelta: number }>
): number {
  const after = deltas
    .filter(d => new Date(d.date).getTime() > balanceDateMs)
    .reduce((s, d) => s + d.usdwDelta, 0);
  return balance + after;
}

// ── Summary calculations ────────────────────────────────────────────────

export function computeSummary(
  usdwPurchases: UsdwPurchase[],
  btcPurchases: BtcPurchase[],
  snapshots: CryptoSnapshot[],
  solPurchases: SolPurchase[] = [],
  btcSales: BtcSale[] = [],
  solSales: SolSale[] = [],
  usdwSales: UsdwSale[] = []
) {
  const sortedSnaps = [...snapshots].sort(compareSnapshots);
  const latestSnapshot = sortedSnaps.at(-1) ?? null;

  // BTC/SOL sale proceeds re-enter the shared USDW pool as a fresh lot, priced at the USD/COP
  // rate in effect on the day of the sale — you're realizing today's dollars, not carrying the
  // crypto's old cost basis forward into the pool.
  const btcSaleReceipts = btcSales.map(s => ({ date: s.date, usdwAmount: s.usdwReceived, copValue: s.usdwReceived * usdCopRateAt(sortedSnaps, new Date(s.date).getTime()) }));
  const solSaleReceipts = solSales.map(s => ({ date: s.date, usdwAmount: s.usdwReceived, copValue: s.usdwReceived * usdCopRateAt(sortedSnaps, new Date(s.date).getTime()) }));

  // FIFO: the USDW units you still hold are specifically the *last* dollars you bought that
  // haven't been spent yet — not a blend of every purchase you've ever made. BTC, SOL, and a
  // direct USDW sale/spend all draw from the same shared pool, interleaved chronologically.
  // Unlike BTC/SOL, a USDW sale has no re-entry — that money is gone (realized as COP, or spent).
  const spends = [
    ...btcPurchases.map(p => ({ id: p.id, date: p.date, usdwAmount: p.usdwAmount, kind: "btc" })),
    ...solPurchases.map(p => ({ id: p.id, date: p.date, usdwAmount: p.usdwAmount, kind: "sol" })),
    ...usdwSales.map(s => ({ id: s.id, date: s.date, usdwAmount: s.usdwAmount, kind: "usdw-sale" })),
  ];
  const { usdwHeldDerived, usdwCostBasisCop, costByEventId } = fifoUsdwLots(
    usdwPurchases, spends, [...btcSaleReceipts, ...solSaleReceipts]
  );
  // Realized gain from USDW sold/spent directly: proceeds minus the FIFO peso cost of the
  // specific dollars that left the pool for each sale.
  const usdwRealizedGainCopById: Record<string, number> = {};
  usdwSales.forEach(sale => { usdwRealizedGainCopById[sale.id] = sale.copReceived - (costByEventId[sale.id] ?? 0); });
  const usdwRealizedGainCop = usdwSales.reduce((s, sale) => s + (usdwRealizedGainCopById[sale.id] ?? 0), 0);
  const usdwTotalSoldCop = usdwSales.reduce((s, sale) => s + sale.copReceived, 0);
  // Average rate of the USDW you currently hold (FIFO cost ÷ units held).
  const avgHeldRate = usdwHeldDerived > 0 ? usdwCostBasisCop / usdwHeldDerived : 0;

  // Per-asset FIFO: which specific BTC/SOL units a sale closes out, so the cost basis (and
  // "growth since purchase") of what you still hold excludes anything already sold, and every
  // sale realizes gain only against the lots it actually consumes.
  const btcFifo = fifoAssetLots(
    btcPurchases.map(p => ({ date: p.date, amount: p.btcAmount, usdwCost: p.usdwAmount, copCost: costByEventId[p.id] ?? 0 })),
    btcSales.map(s => ({ id: s.id, date: s.date, amount: s.btcAmount, usdwReceived: s.usdwReceived, copReceived: s.usdwReceived * usdCopRateAt(sortedSnaps, new Date(s.date).getTime()) }))
  );
  const solFifo = fifoAssetLots(
    solPurchases.map(p => ({ date: p.date, amount: p.solAmount, usdwCost: p.usdwAmount, copCost: costByEventId[p.id] ?? 0 })),
    solSales.map(s => ({ id: s.id, date: s.date, amount: s.solAmount, usdwReceived: s.usdwReceived, copReceived: s.usdwReceived * usdCopRateAt(sortedSnaps, new Date(s.date).getTime()) }))
  );

  // If you've manually recorded your actual USDW balance (e.g. to reflect interest earned), use
  // that as the base and roll it forward by any purchases/exchanges/sales made since that date —
  // so new activity shows up immediately, and you only need to re-enter your real balance monthly.
  const hasUsdwBalanceOverride = latestSnapshot?.usdwBalance != null;
  const usdwDeltas = [
    ...usdwPurchases.map(p => ({ date: p.date, usdwDelta: p.usdwAmount })),
    ...btcPurchases.map(p => ({ date: p.date, usdwDelta: -p.usdwAmount })),
    ...solPurchases.map(p => ({ date: p.date, usdwDelta: -p.usdwAmount })),
    ...btcSales.map(s => ({ date: s.date, usdwDelta: s.usdwReceived })),
    ...solSales.map(s => ({ date: s.date, usdwDelta: s.usdwReceived })),
    ...usdwSales.map(s => ({ date: s.date, usdwDelta: -s.usdwAmount })),
  ];
  const usdwHeld = latestSnapshot?.usdwBalance != null
    ? rollForwardUsdwBalance(
        latestSnapshot.usdwBalance,
        new Date(latestSnapshot.year, latestSnapshot.month - 1, latestSnapshot.day).getTime(),
        usdwDeltas
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

  // Average price you actually paid per BTC (in USDW) for the units you STILL hold (post-sales),
  // so you can compare it to the current price.
  const avgBtcBuyPriceUsdw = btcFifo.heldAmount > 0 ? btcFifo.costBasisUsdwHeld / btcFifo.heldAmount : 0;
  const btcPriceUsdNow = latestSnapshot?.btcPriceUsd ?? avgBtcBuyPriceUsdw;
  const btcValueUsd = btcFifo.heldAmount * btcPriceUsdNow;
  const btcGrowthPct = btcFifo.costBasisUsdwHeld > 0 ? ((btcValueUsd / btcFifo.costBasisUsdwHeld) - 1) * 100 : 0;
  const btcValueCop = btcValueUsd * usdCopRateNow;
  // Gain in USD: BTC price appreciation at the latest registered price, vs. the USDW cost basis of
  // the units you still hold (open position only — closed trades are in btcRealizedGain* instead).
  const btcGainUsd = btcValueUsd - btcFifo.costBasisUsdwHeld;
  // Gain in COP: real peso profit on your open position — current value at the latest rate minus
  // the FIFO peso cost of the specific USDW lots spent on the BTC you still hold.
  const btcGainCop = btcValueCop - btcFifo.costBasisCopHeld;

  // Same math as BTC above, for SOL.
  const avgSolBuyPriceUsdw = solFifo.heldAmount > 0 ? solFifo.costBasisUsdwHeld / solFifo.heldAmount : 0;
  // solPriceUsd defaults to 0 on snapshots saved before a SOL price was ever entered — treat that
  // the same as "not set" (unlike BTC's price, which was always a required, real value).
  const solPriceUsdNow = latestSnapshot?.solPriceUsd ? latestSnapshot.solPriceUsd : avgSolBuyPriceUsdw;
  const solValueUsd = solFifo.heldAmount * solPriceUsdNow;
  const solGrowthPct = solFifo.costBasisUsdwHeld > 0 ? ((solValueUsd / solFifo.costBasisUsdwHeld) - 1) * 100 : 0;
  const solValueCop = solValueUsd * usdCopRateNow;
  const solGainUsd = solValueUsd - solFifo.costBasisUsdwHeld;
  const solGainCop = solValueCop - solFifo.costBasisCopHeld;

  return {
    usdwHeld,
    usdwHeldDerived,
    hasUsdwBalanceOverride,
    usdwCostBasisCop,
    usdwGainUsd,
    usdwGainCop,
    usdwRealizedGainCop,
    usdwTotalSoldCop,
    usdwRealizedGainCopById,
    avgHeldRate,
    usdCopRateNow,
    usdGrowthPct,
    usdwFxEffectCop,
    usdValueCop,
    btcHeld: btcFifo.heldAmount,
    btcCostUsdw: btcFifo.costBasisUsdwHeld,
    btcCostBasisCop: btcFifo.costBasisCopHeld,
    avgBtcBuyPriceUsdw,
    btcPriceUsdNow,
    btcValueUsd,
    btcValueCop,
    btcGrowthPct,
    btcGainUsd,
    btcGainCop,
    btcRealizedGainUsdw: btcFifo.realizedGainUsdw,
    btcRealizedGainCop: btcFifo.realizedGainCop,
    btcTotalSoldUsdwReceived: btcFifo.totalUsdwReceived,
    btcRealizedGainCopById: btcFifo.realizedGainCopById,
    solHeld: solFifo.heldAmount,
    solCostUsdw: solFifo.costBasisUsdwHeld,
    solCostBasisCop: solFifo.costBasisCopHeld,
    avgSolBuyPriceUsdw,
    solPriceUsdNow,
    solValueUsd,
    solValueCop,
    solGrowthPct,
    solGainUsd,
    solGainCop,
    solRealizedGainUsdw: solFifo.realizedGainUsdw,
    solRealizedGainCop: solFifo.realizedGainCop,
    solTotalSoldUsdwReceived: solFifo.totalUsdwReceived,
    solRealizedGainCopById: solFifo.realizedGainCopById,
    latestSnapshot,
  };
}

/** Portfolio-chart helper: invested COP + current COP value of the crypto position as of a given
 * absolute month (year*12 + monthIndex), using only purchases/sales/snapshots up to that month. */
export function computeCryptoValueAtMonth(
  usdwPurchases: UsdwPurchase[],
  btcPurchases: BtcPurchase[],
  snapshots: CryptoSnapshot[],
  monthAbs: number,
  solPurchases: SolPurchase[] = [],
  btcSales: BtcSale[] = [],
  solSales: SolSale[] = [],
  usdwSales: UsdwSale[] = []
): { invested: number; value: number; usdwValue: number; btcValue: number; solValue: number } {
  const withinMonth = (d: string) => {
    const dt = new Date(d);
    return dt.getUTCFullYear() * 12 + dt.getUTCMonth() <= monthAbs;
  };
  const relevantUsdw = usdwPurchases.filter(p => withinMonth(p.date));
  const relevantBtc = btcPurchases.filter(p => withinMonth(p.date));
  const relevantSol = solPurchases.filter(p => withinMonth(p.date));
  const relevantBtcSales = btcSales.filter(s => withinMonth(s.date));
  const relevantSolSales = solSales.filter(s => withinMonth(s.date));
  const relevantUsdwSales = usdwSales.filter(s => withinMonth(s.date));

  const invested = relevantUsdw.reduce((s, p) => s + p.copAmount, 0);

  const relevantSnaps = snapshots
    .filter(s => s.year * 12 + (s.month - 1) <= monthAbs)
    .sort(compareSnapshots);
  const latest = relevantSnaps.at(-1) ?? null;

  const btcSaleReceipts = relevantBtcSales.map(s => ({ date: s.date, usdwAmount: s.usdwReceived, copValue: s.usdwReceived * usdCopRateAt(relevantSnaps, new Date(s.date).getTime()) }));
  const solSaleReceipts = relevantSolSales.map(s => ({ date: s.date, usdwAmount: s.usdwReceived, copValue: s.usdwReceived * usdCopRateAt(relevantSnaps, new Date(s.date).getTime()) }));
  const relevantSpends = [
    ...relevantBtc.map(p => ({ id: p.id, date: p.date, usdwAmount: p.usdwAmount, kind: "btc" })),
    ...relevantSol.map(p => ({ id: p.id, date: p.date, usdwAmount: p.usdwAmount, kind: "sol" })),
    ...relevantUsdwSales.map(s => ({ id: s.id, date: s.date, usdwAmount: s.usdwAmount, kind: "usdw-sale" })),
  ];
  const { usdwHeldDerived, usdwCostBasisCop, costByEventId } = fifoUsdwLots(
    relevantUsdw, relevantSpends, [...btcSaleReceipts, ...solSaleReceipts]
  );
  const avgHeldRate = usdwHeldDerived > 0 ? usdwCostBasisCop / usdwHeldDerived : 0;

  const btcFifo = fifoAssetLots(
    relevantBtc.map(p => ({ date: p.date, amount: p.btcAmount, usdwCost: p.usdwAmount, copCost: costByEventId[p.id] ?? 0 })),
    relevantBtcSales.map(s => ({ id: s.id, date: s.date, amount: s.btcAmount, usdwReceived: s.usdwReceived, copReceived: s.usdwReceived * usdCopRateAt(relevantSnaps, new Date(s.date).getTime()) }))
  );
  const solFifo = fifoAssetLots(
    relevantSol.map(p => ({ date: p.date, amount: p.solAmount, usdwCost: p.usdwAmount, copCost: costByEventId[p.id] ?? 0 })),
    relevantSolSales.map(s => ({ id: s.id, date: s.date, amount: s.solAmount, usdwReceived: s.usdwReceived, copReceived: s.usdwReceived * usdCopRateAt(relevantSnaps, new Date(s.date).getTime()) }))
  );

  const usdwDeltas = [
    ...relevantUsdw.map(p => ({ date: p.date, usdwDelta: p.usdwAmount })),
    ...relevantBtc.map(p => ({ date: p.date, usdwDelta: -p.usdwAmount })),
    ...relevantSol.map(p => ({ date: p.date, usdwDelta: -p.usdwAmount })),
    ...relevantBtcSales.map(s => ({ date: s.date, usdwDelta: s.usdwReceived })),
    ...relevantSolSales.map(s => ({ date: s.date, usdwDelta: s.usdwReceived })),
    ...relevantUsdwSales.map(s => ({ date: s.date, usdwDelta: -s.usdwAmount })),
  ];
  const usdwHeld = latest?.usdwBalance != null
    ? rollForwardUsdwBalance(
        latest.usdwBalance,
        new Date(latest.year, latest.month - 1, latest.day).getTime(),
        usdwDeltas
      )
    : usdwHeldDerived;

  const usdwValue = latest ? usdwHeld * latest.usdCopRate : usdwHeld * avgHeldRate;
  const btcValue = latest && latest.btcPriceUsd > 0
    ? btcFifo.heldAmount * latest.btcPriceUsd * latest.usdCopRate
    : btcFifo.costBasisCopHeld;
  // Same "0 means not set" fallback as solPriceUsdNow above.
  const solValue = latest && latest.solPriceUsd > 0
    ? solFifo.heldAmount * latest.solPriceUsd * latest.usdCopRate
    : solFifo.costBasisCopHeld;
  return { invested, value: usdwValue + btcValue + solValue, usdwValue, btcValue, solValue };
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
  const { data: usdwSales = [] } = useUsdwSales();
  const { data: btcPurchases = [] } = useBtcPurchases();
  const { data: solPurchases = [] } = useSolPurchases();
  const { data: btcSales = [] } = useBtcSales();
  const { data: solSales = [] } = useSolSales();
  const { data: snapshots = [] } = useCryptoSnapshots();
  const { data: settings } = useCryptoSettings();

  const addUsdwMut = useAddUsdwPurchase();
  const deleteUsdwMut = useDeleteUsdwPurchase();
  const addUsdwSaleMut = useAddUsdwSale();
  const deleteUsdwSaleMut = useDeleteUsdwSale();
  const addBtcMut = useAddBtcPurchase();
  const deleteBtcMut = useDeleteBtcPurchase();
  const addSolMut = useAddSolPurchase();
  const deleteSolMut = useDeleteSolPurchase();
  const addBtcSaleMut = useAddBtcSale();
  const deleteBtcSaleMut = useDeleteBtcSale();
  const addSolSaleMut = useAddSolSale();
  const deleteSolSaleMut = useDeleteSolSale();
  const upsertSnapMut = useUpsertCryptoSnapshot();
  const deleteSnapMut = useDeleteCryptoSnapshot();
  const updateSellCommMut = useUpdateCryptoSellCommission();
  const updateRateMut = useUpdateCryptoCommissionRate();
  const updateBtcTargetMut = useUpdateBtcTargetGrowthPct();
  const updateSolTargetMut = useUpdateSolTargetGrowthPct();

  const summary = useMemo(
    () => computeSummary(usdwPurchases, btcPurchases, snapshots, solPurchases, btcSales, solSales, usdwSales),
    [usdwPurchases, btcPurchases, snapshots, solPurchases, btcSales, solSales, usdwSales]
  );

  const commissionRate = settings?.commissionRate ?? 0.001;
  const totalInvested = useMemo(() => usdwPurchases.reduce((s, p) => s + p.copAmount, 0), [usdwPurchases]);
  const totalCurrentValue = summary.usdValueCop + summary.btcValueCop + summary.solValueCop;
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
  const [showUsdwSaleForm, setShowUsdwSaleForm] = useState(false);
  const [showBtcForm, setShowBtcForm] = useState(false);
  const [showSolForm, setShowSolForm] = useState(false);
  const [showBtcSaleForm, setShowBtcSaleForm] = useState(false);
  const [showSolSaleForm, setShowSolSaleForm] = useState(false);
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
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

          <SectionLabel>{t("crypto.realizedTitle")}</SectionLabel>
          <StatRow
            label={t("crypto.realizedGainCop")}
            value={usdwSales.length > 0
              ? <>{summary.usdwRealizedGainCop >= 0 ? "+" : ""}<Money amount={summary.usdwRealizedGainCop} /></>
              : "—"}
            valueColor={summary.usdwRealizedGainCop >= 0 ? "#059669" : "#dc2626"}
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
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, alignItems: "center" }}>
            <span style={{ color: "#6b7280" }}>{t("crypto.growthSincePurchase")}</span>
            <GrowthWithTarget pct={summary.btcGrowthPct} hasData={summary.btcCostUsdw > 0} target={settings?.btcTargetGrowthPct ?? null} />
          </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, alignItems: "center" }}>
            <span style={{ color: "#6b7280" }}>{t("crypto.targetGrowthLabel")}</span>
            <TargetPercentEditableCell value={settings?.btcTargetGrowthPct ?? null} onChange={v => updateBtcTargetMut.mutate(v)} />
          </div>

          <SectionLabel>{t("crypto.realizedTitle")}</SectionLabel>
          <StatRow
            label={t("crypto.realizedGainUsd")}
            value={btcSales.length > 0
              ? <>{summary.btcRealizedGainUsdw >= 0 ? "+" : ""}<Money amount={summary.btcRealizedGainUsdw} currency="USDW" /></>
              : "—"}
            valueColor={summary.btcRealizedGainUsdw >= 0 ? "#059669" : "#dc2626"}
          />
          <StatRow
            label={t("crypto.realizedGainCop")}
            value={btcSales.length > 0
              ? <>{summary.btcRealizedGainCop >= 0 ? "+" : ""}<Money amount={summary.btcRealizedGainCop} /></>
              : "—"}
            valueColor={summary.btcRealizedGainCop >= 0 ? "#059669" : "#dc2626"}
          />
        </div>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>{t("crypto.solTitle")}</div>
          <StatRow label={t("crypto.held")} value={<Money amount={summary.solHeld} currency="SOL" />} />
          <StatRow label={t("crypto.investedUsd")} value={summary.solCostUsdw > 0 ? <Money amount={summary.solCostUsdw} currency="USDW" /> : "—"} />
          <StatRow label={t("crypto.investedCop")} value={summary.solCostUsdw > 0 ? <Money amount={summary.solCostBasisCop} /> : "—"} />
          <StatRow label={t("crypto.avgBuyPricePerSol")} value={summary.avgSolBuyPriceUsdw > 0 ? <Money amount={summary.avgSolBuyPriceUsdw} currency="USDW" /> : "—"} />
          <StatRow label={t("crypto.solPrice")} value={summary.solPriceUsdNow > 0 ? <Money amount={summary.solPriceUsdNow} currency="USD" /> : "—"} />
          <StatRow label={t("crypto.valueInUsd")} value={<Money amount={summary.solValueUsd} currency="USD" />} valueColor="#059669" />
          <StatRow label={t("crypto.valueInCop")} value={<Money amount={summary.solValueCop} />} valueColor="#059669" />

          <SectionLabel>{t("crypto.performance")}</SectionLabel>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, alignItems: "center" }}>
            <span style={{ color: "#6b7280" }}>{t("crypto.growthSincePurchase")}</span>
            <GrowthWithTarget pct={summary.solGrowthPct} hasData={summary.solCostUsdw > 0} target={settings?.solTargetGrowthPct ?? null} />
          </div>
          <StatRow
            label={t("crypto.gainLossUsd")}
            value={summary.solCostUsdw > 0
              ? <>{summary.solGainUsd >= 0 ? "+" : ""}<Money amount={summary.solGainUsd} currency="USD" /></>
              : "—"}
            valueColor={summary.solGainUsd >= 0 ? "#059669" : "#dc2626"}
          />
          <StatRow
            label={t("crypto.gainLossCop")}
            value={summary.solCostUsdw > 0
              ? <>{summary.solGainCop >= 0 ? "+" : ""}<Money amount={summary.solGainCop} /></>
              : "—"}
            valueColor={summary.solGainCop >= 0 ? "#059669" : "#dc2626"}
          />
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, alignItems: "center" }}>
            <span style={{ color: "#6b7280" }}>{t("crypto.targetGrowthLabel")}</span>
            <TargetPercentEditableCell value={settings?.solTargetGrowthPct ?? null} onChange={v => updateSolTargetMut.mutate(v)} />
          </div>

          <SectionLabel>{t("crypto.realizedTitle")}</SectionLabel>
          <StatRow
            label={t("crypto.realizedGainUsd")}
            value={solSales.length > 0
              ? <>{summary.solRealizedGainUsdw >= 0 ? "+" : ""}<Money amount={summary.solRealizedGainUsdw} currency="USDW" /></>
              : "—"}
            valueColor={summary.solRealizedGainUsdw >= 0 ? "#059669" : "#dc2626"}
          />
          <StatRow
            label={t("crypto.realizedGainCop")}
            value={solSales.length > 0
              ? <>{summary.solRealizedGainCop >= 0 ? "+" : ""}<Money amount={summary.solRealizedGainCop} /></>
              : "—"}
            valueColor={summary.solRealizedGainCop >= 0 ? "#059669" : "#dc2626"}
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
                {" · "}{t("crypto.solInline")} <strong>{<Money amount={summary.latestSnapshot.solPriceUsd} currency="USD" />}</strong>
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
                  {[t("crypto.colDate"), t("crypto.colUsdCop"), t("crypto.colBtcUsd"), t("crypto.colSolUsd"), t("crypto.colUsdwBalance"), ""].map(h => (
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
                    <td style={{ padding: "7px 10px" }}>{<Money amount={s.solPriceUsd} currency="USD" />}</td>
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

      {/* USDW sales */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showUsdwSaleForm ? 12 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("crypto.usdwSalesTitle")}</div>
          {!showUsdwSaleForm && <button onClick={() => setShowUsdwSaleForm(true)} style={btn("#dc2626")}>{t("crypto.addSale")}</button>}
        </div>
        {showUsdwSaleForm && (
          <UsdwSaleForm
            onSave={data => { addUsdwSaleMut.mutate(data); setShowUsdwSaleForm(false); }}
            onCancel={() => setShowUsdwSaleForm(false)}
            loading={addUsdwSaleMut.isPending}
            availableUsdw={summary.usdwHeld}
            suggestedRate={summary.usdCopRateNow}
          />
        )}
        {usdwSales.length === 0 ? (
          <div style={{ padding: "12px 0", color: "#9ca3af", fontSize: 12 }}>{t("crypto.noEntries")}</div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {[t("crypto.colDate"), t("crypto.colUsdwSold"), t("crypto.colCommission"), t("crypto.colCopReceived"), t("crypto.colNotes"), ""].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...usdwSales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(s => (
                  <tr key={s.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "7px 10px" }}>{fmtDate(s.date)}</td>
                    <td style={{ padding: "7px 10px" }}>{<Money amount={s.usdwAmount} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{<Money amount={s.commissionCop} />}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600 }}>{<Money amount={s.copReceived} />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{s.notes || "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>
                      <button
                        onClick={() => deleteUsdwSaleMut.mutate(s.id)}
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
      <div style={{ ...card, marginBottom: 16 }}>
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

      {/* BTC sales */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showBtcSaleForm ? 12 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("crypto.btcSalesTitle")}</div>
          {!showBtcSaleForm && <button onClick={() => setShowBtcSaleForm(true)} style={btn("#dc2626")}>{t("crypto.addSale")}</button>}
        </div>
        {showBtcSaleForm && (
          <BtcSaleForm
            onSave={data => { addBtcSaleMut.mutate(data); setShowBtcSaleForm(false); }}
            onCancel={() => setShowBtcSaleForm(false)}
            loading={addBtcSaleMut.isPending}
            availableBtc={summary.btcHeld}
          />
        )}
        {btcSales.length === 0 ? (
          <div style={{ padding: "12px 0", color: "#9ca3af", fontSize: 12 }}>{t("crypto.noEntries")}</div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {[t("crypto.colDate"), t("crypto.colBtcSold"), t("crypto.colCommission"), t("crypto.btcPrice"), t("crypto.colUsdwReceivedShort"), t("crypto.colNotes"), ""].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...btcSales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(s => (
                  <tr key={s.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "7px 10px" }}>{fmtDate(s.date)}</td>
                    <td style={{ padding: "7px 10px" }}>{<Money amount={s.btcAmount} currency="BTC" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{<Money amount={s.commissionUsdw} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{<Money amount={s.btcPriceUsdw} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600 }}>{<Money amount={s.usdwReceived} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{s.notes || "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>
                      <button
                        onClick={() => deleteBtcSaleMut.mutate(s.id)}
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

      {/* SOL purchases */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showSolForm ? 12 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("crypto.solExchangesTitle")}</div>
          {!showSolForm && <button onClick={() => setShowSolForm(true)} style={btn()}>{t("crypto.addExchange")}</button>}
        </div>
        {showSolForm && (
          <SolPurchaseForm
            onSave={data => { addSolMut.mutate(data); setShowSolForm(false); }}
            onCancel={() => setShowSolForm(false)}
            loading={addSolMut.isPending}
            commissionRate={commissionRate}
            availableUsdw={summary.usdwHeld}
          />
        )}
        {solPurchases.length === 0 ? (
          <div style={{ padding: "12px 0", color: "#9ca3af", fontSize: 12 }}>{t("crypto.noEntries")}</div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {[t("crypto.colDate"), t("crypto.colUsdwIn"), t("crypto.colCommission"), t("crypto.solPrice"), t("crypto.colSolReceived"), t("crypto.colNotes"), ""].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...solPurchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (
                  <tr key={p.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "7px 10px" }}>{fmtDate(p.date)}</td>
                    <td style={{ padding: "7px 10px" }}>{<Money amount={p.usdwAmount} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{<Money amount={p.commissionUsdw} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{<Money amount={p.solPriceUsdw} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600 }}>{<Money amount={p.solAmount} currency="SOL" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{p.notes || "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>
                      <button
                        onClick={() => deleteSolMut.mutate(p.id)}
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

      {/* SOL sales */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showSolSaleForm ? 12 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("crypto.solSalesTitle")}</div>
          {!showSolSaleForm && <button onClick={() => setShowSolSaleForm(true)} style={btn("#dc2626")}>{t("crypto.addSale")}</button>}
        </div>
        {showSolSaleForm && (
          <SolSaleForm
            onSave={data => { addSolSaleMut.mutate(data); setShowSolSaleForm(false); }}
            onCancel={() => setShowSolSaleForm(false)}
            loading={addSolSaleMut.isPending}
            availableSol={summary.solHeld}
          />
        )}
        {solSales.length === 0 ? (
          <div style={{ padding: "12px 0", color: "#9ca3af", fontSize: 12 }}>{t("crypto.noEntries")}</div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {[t("crypto.colDate"), t("crypto.colSolSold"), t("crypto.colCommission"), t("crypto.solPrice"), t("crypto.colUsdwReceivedShort"), t("crypto.colNotes"), ""].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...solSales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(s => (
                  <tr key={s.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "7px 10px" }}>{fmtDate(s.date)}</td>
                    <td style={{ padding: "7px 10px" }}>{<Money amount={s.solAmount} currency="SOL" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{<Money amount={s.commissionUsdw} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{<Money amount={s.solPriceUsdw} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600 }}>{<Money amount={s.usdwReceived} currency="USDW" />}</td>
                    <td style={{ padding: "7px 10px", color: "#6b7280" }}>{s.notes || "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>
                      <button
                        onClick={() => deleteSolSaleMut.mutate(s.id)}
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

/** Growth-since-purchase display that highlights (green badge) once it reaches a user-set
 * target % — the "sell when I'm up 10%" signal, surfaced right where you'd check your position
 * instead of needing a push notification. */
function GrowthWithTarget({ pct, hasData, target }: { pct: number; hasData: boolean; target: number | null }) {
  const { t } = useTranslation();
  if (!hasData) return <span style={{ fontWeight: 600, color: "#1f2937" }}>—</span>;
  const metTarget = target != null && target > 0 && pct >= target;
  if (metTarget) {
    return (
      <span
        title={t("crypto.targetReachedTooltip", { pct: target.toFixed(2) })}
        style={{
          fontWeight: 700, fontSize: 13, padding: "2px 10px", borderRadius: 99,
          background: "#dcfce7", color: "#15803d", border: "1px solid #86efac",
        }}
      >
        🎯 +{pct.toFixed(2)}%
      </span>
    );
  }
  return (
    <span style={{ fontWeight: 600, color: pct >= 0 ? "#059669" : "#dc2626" }}>
      {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}

/** Click-to-edit target growth % (plain percent, e.g. 10 = 10%). Empty/zero clears the target. */
function TargetPercentEditableCell({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  function start() {
    setText(value != null ? String(value) : "");
    setEditing(true);
  }

  function done() {
    const trimmed = text.trim();
    if (trimmed === "") {
      onChange(null);
    } else {
      const pct = Number(trimmed.replace(",", "."));
      onChange(!isNaN(pct) && pct > 0 ? pct : null);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        placeholder={t("crypto.placeholderTargetPct")}
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
        background: value != null ? "#ede9fe" : "#f9fafb",
        color: value != null ? "#4f46e5" : "#9ca3af",
        fontWeight: value != null ? 700 : 400, fontSize: 12,
        display: "inline-block", minWidth: 50, textAlign: "right",
        border: "1px dashed", borderColor: value != null ? "#a5b4fc" : "#e5e7eb",
      }}
    >
      {value != null ? `+${value.toFixed(2)}%` : "—"}
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

function UsdwSaleForm({ onSave, onCancel, loading, availableUsdw, suggestedRate }: {
  onSave: (data: { date: string; usdwAmount: number; commissionCop: number; copReceived: number; notes?: string }) => void;
  onCancel: () => void;
  loading: boolean;
  availableUsdw: number;
  suggestedRate: number;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayInput());
  const [usdwAmount, setUsdwAmount] = useState("");
  const [commissionCop, setCommissionCop] = useState("0");
  const [copReceived, setCopReceived] = useState("");
  const [copReceivedTouched, setCopReceivedTouched] = useState(false);
  const [notes, setNotes] = useState("");

  function handleUsdwAmountChange(raw: string) {
    setUsdwAmount(raw);
    if (!copReceivedTouched) {
      const usdw = Number(raw) || 0;
      const comm = parse(commissionCop);
      const suggested = Math.max(usdw * suggestedRate - comm, 0);
      setCopReceived(suggested > 0 ? formatCopInput(String(Math.round(suggested)).replace(".", ",")) : "");
    }
  }

  const usdwExceedsAvailable = Number(usdwAmount) > availableUsdw;

  function handleSubmit() {
    const usdw = Number(usdwAmount);
    const comm = parse(commissionCop);
    const received = parse(copReceived);
    if (!date || !usdw || !received || usdwExceedsAvailable) return;
    onSave({ date, usdwAmount: usdw, commissionCop: comm, copReceived: received, notes });
  }

  return (
    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <span style={label}>{t("crypto.colDate")}</span>
          <input style={input} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.usdwAmountToSellLabel")} <span style={{ color: "#9ca3af" }}>{t("crypto.availableLabel")} {<Money amount={availableUsdw} currency="USDW" />}</span></span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderUsdwAmount")} value={usdwAmount} onChange={e => handleUsdwAmountChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.commissionCopLabel")}</span>
          <input style={input} placeholder={t("crypto.placeholderZero")} value={commissionCop}
            onChange={e => setCommissionCop(formatCopInput(e.target.value))} />
        </div>
        <div>
          <span style={label}>{t("crypto.copReceivedLabel")}</span>
          <input style={input} placeholder={t("crypto.placeholderCopAmount")} value={copReceived}
            onChange={e => { setCopReceivedTouched(true); setCopReceived(formatCopInput(e.target.value)); }} />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <span style={label}>{t("crypto.colNotes")}</span>
        <input style={input} placeholder={t("crypto.optional")} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      {usdwExceedsAvailable && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 12 }}>
          {t("crypto.onlyAvailablePrefix")} {<Money amount={availableUsdw} currency="USDW" />} {t("crypto.onlyAvailableSuffix")}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSubmit}
          style={{ ...btn("#dc2626"), opacity: usdwExceedsAvailable ? 0.5 : 1, cursor: usdwExceedsAvailable ? "not-allowed" : "pointer" }}
          disabled={loading || usdwExceedsAvailable}
        >{loading ? t("crypto.saving") : t("crypto.save")}</button>
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

function SolPurchaseForm({ onSave, onCancel, loading, commissionRate, availableUsdw }: {
  onSave: (data: { date: string; usdwAmount: number; commissionUsdw: number; solPriceUsdw: number; solAmount: number; notes?: string }) => void;
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
  const [solPriceUsdw, setSolPriceUsdw] = useState("");
  const [solAmount, setSolAmount] = useState("");
  // Tracks which of price/received the user is driving, so the other one is the derived field.
  const [lastEdited, setLastEdited] = useState<"price" | "received" | null>(null);

  // Net USDW actually converted to SOL (the commission is taken off the top).
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
      const price = Number(solPriceUsdw);
      if (net > 0 && price > 0) setSolAmount((net / price).toFixed(8));
    } else if (lastEdited === "received") {
      const received = Number(solAmount);
      if (net > 0 && received > 0) setSolPriceUsdw((net / received).toFixed(2));
    }
  }

  function handleCommissionChange(raw: string) {
    setCommissionTouched(true);
    setCommissionUsdw(raw);
    const net = netUsdw(usdwAmount, raw);
    if (lastEdited === "price") {
      const price = Number(solPriceUsdw);
      if (net > 0 && price > 0) setSolAmount((net / price).toFixed(8));
    } else if (lastEdited === "received") {
      const received = Number(solAmount);
      if (net > 0 && received > 0) setSolPriceUsdw((net / received).toFixed(2));
    }
  }

  function handlePriceChange(raw: string) {
    setSolPriceUsdw(raw);
    setLastEdited("price");
    const net = netUsdw(usdwAmount, commissionUsdw);
    const price = Number(raw);
    if (net > 0 && price > 0) setSolAmount((net / price).toFixed(8));
  }

  function handleReceivedChange(raw: string) {
    setSolAmount(raw);
    setLastEdited("received");
    const net = netUsdw(usdwAmount, commissionUsdw);
    const received = Number(raw);
    if (net > 0 && received > 0) setSolPriceUsdw((net / received).toFixed(2));
  }

  const usdwExceedsAvailable = Number(usdwAmount) > availableUsdw;

  function handleSubmit() {
    const usdw = Number(usdwAmount);
    const comm = Number(commissionUsdw) || 0;
    const price = Number(solPriceUsdw);
    const sol = Number(solAmount);
    if (!date || !usdw || !price || !sol || usdwExceedsAvailable) return;
    onSave({ date, usdwAmount: usdw, commissionUsdw: comm, solPriceUsdw: price, solAmount: sol });
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
          <span style={label}>{t("crypto.solPriceUsdwLabel")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderSolPrice")} value={solPriceUsdw} onChange={e => handlePriceChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.colSolReceived")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderSolReceived")} value={solAmount} onChange={e => handleReceivedChange(e.target.value)} />
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

function BtcSaleForm({ onSave, onCancel, loading, availableBtc }: {
  onSave: (data: { date: string; btcAmount: number; commissionUsdw: number; btcPriceUsdw: number; usdwReceived: number; notes?: string }) => void;
  onCancel: () => void;
  loading: boolean;
  availableBtc: number;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayInput());
  const [btcAmount, setBtcAmount] = useState("");
  const [commissionUsdw, setCommissionUsdw] = useState("0");
  const [btcPriceUsdw, setBtcPriceUsdw] = useState("");
  const [usdwReceived, setUsdwReceived] = useState("");
  // Tracks which of price/received the user is driving, so the other one is the derived field.
  const [lastEdited, setLastEdited] = useState<"price" | "received" | null>(null);

  function grossUsdw(amountStr: string, priceStr: string): number {
    return (Number(amountStr) || 0) * (Number(priceStr) || 0);
  }

  function handleAmountChange(raw: string) {
    setBtcAmount(raw);
    const comm = Number(commissionUsdw) || 0;
    if (lastEdited === "price") {
      const gross = grossUsdw(raw, btcPriceUsdw);
      if (gross > 0) setUsdwReceived(Math.max(gross - comm, 0).toFixed(2));
    } else if (lastEdited === "received") {
      const amt = Number(raw);
      const received = Number(usdwReceived);
      if (amt > 0 && received > 0) setBtcPriceUsdw(((received + comm) / amt).toFixed(2));
    }
  }

  function handleCommissionChange(raw: string) {
    setCommissionUsdw(raw);
    const comm = Number(raw) || 0;
    if (lastEdited === "price") {
      const gross = grossUsdw(btcAmount, btcPriceUsdw);
      if (gross > 0) setUsdwReceived(Math.max(gross - comm, 0).toFixed(2));
    } else if (lastEdited === "received") {
      const amt = Number(btcAmount);
      const received = Number(usdwReceived);
      if (amt > 0 && received > 0) setBtcPriceUsdw(((received + comm) / amt).toFixed(2));
    }
  }

  function handlePriceChange(raw: string) {
    setBtcPriceUsdw(raw);
    setLastEdited("price");
    const comm = Number(commissionUsdw) || 0;
    const gross = grossUsdw(btcAmount, raw);
    if (gross > 0) setUsdwReceived(Math.max(gross - comm, 0).toFixed(2));
  }

  function handleReceivedChange(raw: string) {
    setUsdwReceived(raw);
    setLastEdited("received");
    const amt = Number(btcAmount);
    const comm = Number(commissionUsdw) || 0;
    const received = Number(raw);
    if (amt > 0 && received > 0) setBtcPriceUsdw(((received + comm) / amt).toFixed(2));
  }

  const btcExceedsAvailable = Number(btcAmount) > availableBtc;

  function handleSubmit() {
    const amt = Number(btcAmount);
    const comm = Number(commissionUsdw) || 0;
    const price = Number(btcPriceUsdw);
    const received = Number(usdwReceived);
    if (!date || !amt || !price || !received || btcExceedsAvailable) return;
    onSave({ date, btcAmount: amt, commissionUsdw: comm, btcPriceUsdw: price, usdwReceived: received });
  }

  return (
    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <span style={label}>{t("crypto.colDate")}</span>
          <input style={input} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.btcAmountToSellLabel")} <span style={{ color: "#9ca3af" }}>{t("crypto.availableLabel")} {<Money amount={availableBtc} currency="BTC" />}</span></span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderBtcReceived")} value={btcAmount} onChange={e => handleAmountChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.commissionUsdwLabel")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderZero")} value={commissionUsdw} onChange={e => handleCommissionChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.btcPriceUsdwLabel")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderBtcPrice")} value={btcPriceUsdw} onChange={e => handlePriceChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.usdwReceivedLabel")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderUsdwAmount")} value={usdwReceived} onChange={e => handleReceivedChange(e.target.value)} />
        </div>
      </div>
      {btcExceedsAvailable && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 12 }}>
          {t("crypto.onlyAvailablePrefix")} {<Money amount={availableBtc} currency="BTC" />} {t("crypto.onlyAvailableSuffix")}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSubmit}
          style={{ ...btn("#dc2626"), opacity: btcExceedsAvailable ? 0.5 : 1, cursor: btcExceedsAvailable ? "not-allowed" : "pointer" }}
          disabled={loading || btcExceedsAvailable}
        >{loading ? t("crypto.saving") : t("crypto.save")}</button>
        <button onClick={onCancel} style={ghost}>{t("crypto.cancel")}</button>
      </div>
    </div>
  );
}

function SolSaleForm({ onSave, onCancel, loading, availableSol }: {
  onSave: (data: { date: string; solAmount: number; commissionUsdw: number; solPriceUsdw: number; usdwReceived: number; notes?: string }) => void;
  onCancel: () => void;
  loading: boolean;
  availableSol: number;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayInput());
  const [solAmount, setSolAmount] = useState("");
  const [commissionUsdw, setCommissionUsdw] = useState("0");
  const [solPriceUsdw, setSolPriceUsdw] = useState("");
  const [usdwReceived, setUsdwReceived] = useState("");
  const [lastEdited, setLastEdited] = useState<"price" | "received" | null>(null);

  function grossUsdw(amountStr: string, priceStr: string): number {
    return (Number(amountStr) || 0) * (Number(priceStr) || 0);
  }

  function handleAmountChange(raw: string) {
    setSolAmount(raw);
    const comm = Number(commissionUsdw) || 0;
    if (lastEdited === "price") {
      const gross = grossUsdw(raw, solPriceUsdw);
      if (gross > 0) setUsdwReceived(Math.max(gross - comm, 0).toFixed(2));
    } else if (lastEdited === "received") {
      const amt = Number(raw);
      const received = Number(usdwReceived);
      if (amt > 0 && received > 0) setSolPriceUsdw(((received + comm) / amt).toFixed(2));
    }
  }

  function handleCommissionChange(raw: string) {
    setCommissionUsdw(raw);
    const comm = Number(raw) || 0;
    if (lastEdited === "price") {
      const gross = grossUsdw(solAmount, solPriceUsdw);
      if (gross > 0) setUsdwReceived(Math.max(gross - comm, 0).toFixed(2));
    } else if (lastEdited === "received") {
      const amt = Number(solAmount);
      const received = Number(usdwReceived);
      if (amt > 0 && received > 0) setSolPriceUsdw(((received + comm) / amt).toFixed(2));
    }
  }

  function handlePriceChange(raw: string) {
    setSolPriceUsdw(raw);
    setLastEdited("price");
    const comm = Number(commissionUsdw) || 0;
    const gross = grossUsdw(solAmount, raw);
    if (gross > 0) setUsdwReceived(Math.max(gross - comm, 0).toFixed(2));
  }

  function handleReceivedChange(raw: string) {
    setUsdwReceived(raw);
    setLastEdited("received");
    const amt = Number(solAmount);
    const comm = Number(commissionUsdw) || 0;
    const received = Number(raw);
    if (amt > 0 && received > 0) setSolPriceUsdw(((received + comm) / amt).toFixed(2));
  }

  const solExceedsAvailable = Number(solAmount) > availableSol;

  function handleSubmit() {
    const amt = Number(solAmount);
    const comm = Number(commissionUsdw) || 0;
    const price = Number(solPriceUsdw);
    const received = Number(usdwReceived);
    if (!date || !amt || !price || !received || solExceedsAvailable) return;
    onSave({ date, solAmount: amt, commissionUsdw: comm, solPriceUsdw: price, usdwReceived: received });
  }

  return (
    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <span style={label}>{t("crypto.colDate")}</span>
          <input style={input} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.solAmountToSellLabel")} <span style={{ color: "#9ca3af" }}>{t("crypto.availableLabel")} {<Money amount={availableSol} currency="SOL" />}</span></span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderSolReceived")} value={solAmount} onChange={e => handleAmountChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.commissionUsdwLabel")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderZero")} value={commissionUsdw} onChange={e => handleCommissionChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.solPriceUsdwLabel")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderSolPrice")} value={solPriceUsdw} onChange={e => handlePriceChange(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("crypto.usdwReceivedLabel")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderUsdwAmount")} value={usdwReceived} onChange={e => handleReceivedChange(e.target.value)} />
        </div>
      </div>
      {solExceedsAvailable && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 12 }}>
          {t("crypto.onlyAvailablePrefix")} {<Money amount={availableSol} currency="SOL" />} {t("crypto.onlyAvailableSuffix")}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSubmit}
          style={{ ...btn("#dc2626"), opacity: solExceedsAvailable ? 0.5 : 1, cursor: solExceedsAvailable ? "not-allowed" : "pointer" }}
          disabled={loading || solExceedsAvailable}
        >{loading ? t("crypto.saving") : t("crypto.save")}</button>
        <button onClick={onCancel} style={ghost}>{t("crypto.cancel")}</button>
      </div>
    </div>
  );
}

function SnapshotForm({ onSave, onCancel, loading }: {
  onSave: (data: { day: number; month: number; year: number; usdCopRate: number; btcPriceUsd: number; solPriceUsd: number; usdwBalance?: number }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayInput());
  const [usdCopRate, setUsdCopRate] = useState("");
  const [btcPriceUsd, setBtcPriceUsd] = useState("");
  const [solPriceUsd, setSolPriceUsd] = useState("");
  const [usdwBalance, setUsdwBalance] = useState("");

  function handleSubmit() {
    const rate = parse(usdCopRate);
    const btcPrice = Number(btcPriceUsd);
    const solPrice = Number(solPriceUsd) || 0;
    if (!date || !rate || !btcPrice) return;
    const [y, m, d] = date.split("-").map(Number);
    const balance = usdwBalance.trim() ? Number(usdwBalance) : undefined;
    onSave({ day: d, month: m, year: y, usdCopRate: rate, btcPriceUsd: btcPrice, solPriceUsd: solPrice, usdwBalance: balance });
  }

  return (
    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
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
          <span style={label}>{t("crypto.solPriceUsdLabel")}</span>
          <input style={input} type="number" step="any" placeholder={t("crypto.placeholderSolPrice")} value={solPriceUsd} onChange={e => setSolPriceUsd(e.target.value)} />
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
