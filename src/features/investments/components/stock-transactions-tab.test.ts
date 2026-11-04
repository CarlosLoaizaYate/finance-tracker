import { describe, it, expect } from "vitest";
import { computeStockPosition } from "./stock-transactions-tab";
import type { StockTransaction, StockSale } from "@/hooks/use-finance-data";

function buy(id: string, date: string, quantity: number, priceUnit: number, commission: number): StockTransaction {
  return { id, investmentId: "inv1", quantity, priceUnit, commission, transactionDate: date, notes: "", createdAt: date, updatedAt: date, userId: "u" };
}
function sell(id: string, date: string, quantity: number, priceUnit: number, commission: number): StockSale {
  return { id, investmentId: "inv1", quantity, priceUnit, commission, saleDate: date, notes: "", createdAt: date, userId: "u" };
}

describe("computeStockPosition (FIFO)", () => {
  it("matches a sale against the oldest buy lots first and realizes gain only on those shares", () => {
    const txs = [buy("t1", "2026-01-01", 10, 1000, 100), buy("t2", "2026-02-01", 10, 1200, 100)];
    const sales = [sell("s1", "2026-03-01", 15, 1500, 50)];

    const pos = computeStockPosition(txs, sales);

    // FIFO consumes all 10 shares of lot1 (cost 10100) + 5/10 of lot2 (cost 12100*0.5=6050).
    expect(pos.heldShares).toBe(5);
    expect(pos.costBasisHeld).toBeCloseTo(6050, 0);
    expect(pos.realizedGain).toBeCloseTo(6300, 0); // proceeds 22450 - cost basis 16150
    expect(pos.totalProceeds).toBeCloseTo(22450, 0);
    expect(pos.realizedGainBySaleId["s1"]).toBeCloseTo(6300, 0);
    expect(pos.remainingByTxId["t2"]).toBe(5);
    expect(pos.remainingByTxId["t1"]).toBeUndefined();
  });

  it("returns the full position with no realized gain when nothing has been sold", () => {
    const txs = [buy("t1", "2026-01-01", 10, 1000, 100)];
    const pos = computeStockPosition(txs, []);
    expect(pos.heldShares).toBe(10);
    expect(pos.realizedGain).toBe(0);
    expect(pos.costBasisHeld).toBe(10100);
  });
});
