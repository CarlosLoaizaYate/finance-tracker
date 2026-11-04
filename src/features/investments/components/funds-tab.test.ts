import { describe, it, expect } from "vitest";
import { buildFundAccounting } from "./funds-tab";
import type { FundSnapshot } from "@/hooks/use-finance-data";

function snap(id: string, y: number, m: number, d: number, currentValue: number, contribution = 0, withdrawal = 0): FundSnapshot {
  return { id, fundId: "f1", day: d, month: m, year: y, currentValue, contribution, withdrawal, createdAt: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

describe("buildFundAccounting", () => {
  it("realizes a pro-rata share of the gain when part of the fund is withdrawn", () => {
    const baseCapital = 1_000_000;
    const snapshots = [
      snap("s1", 2026, 1, 1, 1_500_000), // grows to 1.5M on 1M invested (33.3% gain)
      snap("s2", 2026, 2, 1, 1_250_000, 0, 300_000), // withdraw 300k
    ];

    const r = buildFundAccounting(baseCapital, snapshots);

    expect(r.totalInvested).toBe(700_000); // 1,000,000 - 300,000
    expect(r.withdrawalGainMap.get("s2")).toBeCloseTo(100_000, 0); // 300k * (1.5M-1M)/1.5M
    expect(r.totalRealizedGain).toBeCloseTo(100_000, 0);
  });

  it("realizes zero gain on a withdrawal before any value data exists", () => {
    const r = buildFundAccounting(1_000_000, [snap("s1", 2026, 1, 1, 900_000, 0, 500_000)]);
    expect(r.withdrawalGainMap.get("s1")).toBe(0);
    expect(r.totalInvested).toBe(500_000);
  });

  it("nets contributions and withdrawals into cumulative invested per entry", () => {
    const r = buildFundAccounting(1_000_000, [
      snap("s1", 2026, 1, 1, 1_300_000, 200_000),
      snap("s2", 2026, 2, 1, 1_100_000, 0, 200_000),
    ]);
    expect(r.investedMap.get("s1")).toBe(1_200_000);
    expect(r.investedMap.get("s2")).toBe(1_000_000);
  });
});
