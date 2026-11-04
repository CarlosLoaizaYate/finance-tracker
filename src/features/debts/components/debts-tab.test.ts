import { describe, it, expect } from "vitest";
import { calibratedDeltaPrincipal, computeMortgageSummary, projectRemaining } from "./debts-tab";
import type { Mortgage, MortgagePayment } from "@/hooks/use-finance-data";

function payment(id: string, date: string, principalPaid: number, overrides: Partial<MortgagePayment> = {}): MortgagePayment {
  return {
    id, mortgageId: "m1", date, principalPaid,
    interestPaid: 0, interestCovered: 0, insurancePaid: 0,
    realBalance: null, realBalanceDate: null, previousBalance: null, previousBalanceDate: null,
    isExtra: false, isEstimated: false, notes: "", createdAt: date,
    ...overrides,
  };
}
function mortgage(principal: number, termMonths: number, payments: MortgagePayment[]): Mortgage {
  return {
    id: "m1", name: "Test", entity: "Bank", principal, interestRate: 0.01,
    subsidizedRate: null, subsidyRate: null, subsidyEndDate: null, isUvrIndexed: false,
    termMonths, startDate: "2020-01-01", notes: "", createdAt: "2020-01-01", payments,
  };
}

describe("calibratedDeltaPrincipal", () => {
  // This is the exact invariant the off-by-one bug violated: a fixed-cuota loan paid on
  // schedule must reach precisely zero at the nominal remaining term. The delta this function
  // solves for must make the arithmetic-sequence sum of the n projected principal payments
  // exactly consume noExtraBalance — not approximately, not off by one spacing.
  it("produces a delta whose n-term arithmetic series exactly consumes the no-extra balance", () => {
    const regular = [
      payment("p1", "2026-01-01", 300_000),
      payment("p2", "2026-02-01", 310_000),
      payment("p3", "2026-03-01", 320_000),
    ];
    const m = mortgage(100_000_000, 180, regular);
    const delta = calibratedDeltaPrincipal(m, regular);

    const n = m.termMonths - regular.length;
    const a1 = regular[regular.length - 1].principalPaid;
    const regularPrincipalPaid = regular.reduce((s, p) => s + p.principalPaid, 0);
    const noExtraBalance = m.principal - regularPrincipalPaid;

    let sum = 0;
    for (let i = 1; i <= n; i++) sum += a1 + i * delta;

    expect(sum).toBeCloseTo(noExtraBalance, 2);
  });

  it("returns 0 once the term is already fully paid off in cuota count", () => {
    const regular = [payment("p1", "2026-01-01", 100)];
    const m = mortgage(1_000_000, 1, regular); // termMonths - regular.length = 0
    expect(calibratedDeltaPrincipal(m, regular)).toBe(0);
  });
});

describe("projectRemaining", () => {
  it("reaches (near) zero balance by the nominal term when no extra payments are projected", () => {
    const regular = [
      payment("p1", "2026-01-01", 300_000),
      payment("p2", "2026-02-01", 310_000),
      payment("p3", "2026-03-01", 320_000),
    ];
    const m = mortgage(100_000_000, 180, regular);
    const rows = projectRemaining(m, 0);

    expect(rows.length).toBeGreaterThan(0);
    const nominalTermRow = rows.find(r => r.cuotaNumber === m.termMonths);
    expect(nominalTermRow).toBeDefined();
    // Allow a small rounding tolerance (each row rounds to whole pesos).
    expect(nominalTermRow!.balanceAfter).toBeLessThan(m.principal * 0.001);
  });

  it("returns no projection with fewer than 3 regular payments on file", () => {
    const regular = [payment("p1", "2026-01-01", 300_000)];
    const m = mortgage(100_000_000, 180, regular);
    expect(projectRemaining(m, 0)).toEqual([]);
  });
});

describe("computeMortgageSummary", () => {
  it("sums principal/interest/insurance across all payments and derives the outstanding balance", () => {
    const payments = [
      payment("p1", "2026-01-01", 300_000, { interestPaid: 500_000, insurancePaid: 10_000 }),
      payment("p2", "2026-02-01", 310_000, { interestPaid: 490_000, insurancePaid: 10_000 }),
    ];
    const m = mortgage(100_000_000, 180, payments);
    const summary = computeMortgageSummary(m);

    expect(summary.totalPrincipalPaid).toBe(610_000);
    expect(summary.totalInterestPaid).toBe(990_000);
    expect(summary.totalInsurancePaid).toBe(20_000);
    expect(summary.outstandingBalance).toBe(100_000_000 - 610_000);
    expect(summary.regularCuotasPaid).toBe(2);
  });

  it("excludes extra payments from the regular cuota count", () => {
    const payments = [
      payment("p1", "2026-01-01", 300_000),
      payment("p2", "2026-02-15", 5_000_000, { isExtra: true }),
    ];
    const m = mortgage(100_000_000, 180, payments);
    expect(computeMortgageSummary(m).regularCuotasPaid).toBe(1);
  });

  it("picks the most recently-verified real balance by its own cutoff date, not the payment date", () => {
    const payments = [
      payment("p1", "2026-01-01", 300_000, { realBalance: 99_700_000, realBalanceDate: "2026-01-15" }),
      payment("p2", "2026-02-01", 310_000, { realBalance: 99_390_000, realBalanceDate: "2025-12-20" }),
    ];
    const m = mortgage(100_000_000, 180, payments);
    const summary = computeMortgageSummary(m);
    expect(summary.lastVerifiedBalance).toBe(99_700_000);
    expect(summary.lastVerifiedDate).toBe("2026-01-15");
  });
});
