import { describe, it, expect } from "vitest";
import { computeSummary, computeCryptoValueAtMonth } from "./crypto-tab";
import type { UsdwPurchase, BtcPurchase, SolPurchase, BtcSale, UsdwSale, CryptoSnapshot } from "@/hooks/use-finance-data";

// Minimal fixture builders — only the fields each calculation actually reads matter.
function usdw(id: string, date: string, copAmount: number, usdwAmount: number): UsdwPurchase {
  return { id, date, copAmount, commissionCop: 0, usdwAmount, notes: "", createdAt: date };
}
function btcBuy(id: string, date: string, usdwAmount: number, btcPriceUsdw: number, btcAmount: number): BtcPurchase {
  return { id, date, usdwAmount, commissionUsdw: 0, btcPriceUsdw, btcAmount, notes: "", createdAt: date };
}
function btcSell(id: string, date: string, btcAmount: number, btcPriceUsdw: number, usdwReceived: number, commissionUsdw = 0): BtcSale {
  return { id, date, btcAmount, commissionUsdw, btcPriceUsdw, usdwReceived, notes: "", createdAt: date };
}
function usdwSell(id: string, date: string, usdwAmount: number, copReceived: number): UsdwSale {
  return { id, date, usdwAmount, commissionCop: 0, copReceived, notes: "", createdAt: date };
}
function snap(id: string, y: number, m: number, d: number, usdCopRate: number, btcPriceUsd = 0, solPriceUsd = 0): CryptoSnapshot {
  return { id, day: d, month: m, year: y, usdCopRate, btcPriceUsd, solPriceUsd, usdwBalance: null, createdAt: "" };
}

describe("fifoUsdwLots (via computeSummary)", () => {
  it("consumes USDW purchase lots oldest-first for a crypto buy", () => {
    const usdwPurchases = [usdw("u1", "2026-01-01", 4_000_000, 1000), usdw("u2", "2026-02-01", 4_200_000, 1000)];
    const btcPurchases = [btcBuy("b1", "2026-03-01", 500, 50000, 0.01)];
    const summary = computeSummary(usdwPurchases, btcPurchases, []);
    // 500 of the 1000-unit first lot (rate 4000) is spent — cost basis = 500*4000.
    expect(summary.btcCostBasisCop).toBeCloseTo(2_000_000, 0);
    expect(summary.usdwHeld).toBeCloseTo(1500, 6);
  });
});

describe("BTC/SOL sale FIFO + realized gain (fifoAssetLots via computeSummary)", () => {
  it("matches a partial sale against the oldest buy lots and realizes gain only on those units", () => {
    const usdwPurchases = [usdw("u1", "2026-01-01", 4_000_000, 1000), usdw("u2", "2026-02-01", 4_200_000, 1000)];
    const btcPurchases = [
      btcBuy("b1", "2026-03-01", 500, 50000, 0.01),
      btcBuy("b2", "2026-04-01", 1000, 60000, 0.016667),
    ];
    const btcSales = [btcSell("s1", "2026-06-01", 0.015, 70000, 1000, 50)];
    const snapshots = [snap("sn1", 2026, 5, 1, 4500, 65000)];

    const summary = computeSummary(usdwPurchases, btcPurchases, snapshots, [], btcSales, []);

    expect(summary.btcHeld).toBeCloseTo(0.011667, 4);
    expect(summary.btcCostUsdw).toBeCloseTo(700, 0);
    expect(summary.btcCostBasisCop).toBeCloseTo(2_870_000, -2);
    expect(summary.btcRealizedGainUsdw).toBeCloseTo(200, 0);
    expect(summary.btcRealizedGainCop).toBeCloseTo(1_270_000, -2);
    expect(summary.btcRealizedGainCopById["s1"]).toBeCloseTo(summary.btcRealizedGainCop, 2);

    // Sale proceeds re-enter the shared USDW pool at the rate on the day of the sale.
    expect(summary.usdwHeld).toBeCloseTo(1500, 1);
  });
});

describe("USDW sale/spend realized gain", () => {
  it("realizes gain as proceeds minus the FIFO peso cost of the specific dollars sold", () => {
    const usdwPurchases = [usdw("u1", "2026-01-01", 4_000_000, 1000)];
    const usdwSales = [usdwSell("us1", "2026-02-01", 300, 1_300_000)];

    const summary = computeSummary(usdwPurchases, [], [], [], [], [], usdwSales);

    expect(summary.usdwHeld).toBeCloseTo(700, 6);
    expect(summary.usdwCostBasisCop).toBeCloseTo(2_800_000, 0);
    expect(summary.usdwRealizedGainCop).toBeCloseTo(100_000, 0);
    expect(summary.usdwTotalSoldCop).toBeCloseTo(1_300_000, 0);
  });
});

describe("SOL price fallback (regression: a snapshot's unset solPriceUsd defaulting to 0 must not zero out SOL's value)", () => {
  it("falls back to the average buy price when the latest snapshot has no real SOL price yet", () => {
    const usdwPurchases = [usdw("u1", "2026-01-01", 4_000_000, 1000)];
    const solPurchases: SolPurchase[] = [
      { id: "s1", date: "2026-01-02", usdwAmount: 200, commissionUsdw: 0, solPriceUsdw: 100, solAmount: 2, notes: "", createdAt: "" },
    ];
    // Snapshot predates any SOL price entry — solPriceUsd is the column's default, 0.
    const snapshots = [snap("sn1", 2026, 1, 1, 4000, 60000, 0)];

    const summary = computeSummary(usdwPurchases, [], snapshots, solPurchases);

    expect(summary.solPriceUsdNow).toBeCloseTo(100, 6); // falls back to avg buy price, not 0
    expect(summary.solValueCop).toBeGreaterThan(0);
  });
});

describe("computeCryptoValueAtMonth", () => {
  it("only counts purchases/sales up to and including the given month", () => {
    const usdwPurchases = [usdw("u1", "2026-01-01", 4_000_000, 1000)];
    const btcPurchases = [btcBuy("b1", "2026-06-01", 1000, 50000, 0.02)];
    const beforeBuy = computeCryptoValueAtMonth(usdwPurchases, btcPurchases, [], 2026 * 12 + 2 /* March */);
    const afterBuy = computeCryptoValueAtMonth(usdwPurchases, btcPurchases, [], 2026 * 12 + 6 /* July */);

    expect(beforeBuy.btcValue).toBe(0);
    expect(afterBuy.btcValue).toBeGreaterThan(0);
  });
});
