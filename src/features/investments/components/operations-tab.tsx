"use client";

import { useMemo } from "react";
import {
  useStocks,
  useStockTransactions,
  useStockSales,
  useBtcPurchases,
  useSolPurchases,
  useBtcSales,
  useSolSales,
  useUsdwPurchases,
  useUsdwSales,
  useCryptoSnapshots,
  useFunds,
} from "@/hooks/use-finance-data";
import Money from "@/components/ui/money";
import { useTranslation } from "@/hooks/use-translation";
import { computeStockPosition } from "./stock-transactions-tab";
import { computeSummary as computeCryptoSummary } from "./crypto-tab";
import { buildFundAccounting } from "./funds-tab";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "16px 20px",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

interface OperationRow {
  id: string;
  dateMs: number;
  kindLabel: string;
  kindColor: string;
  assetName: string;
  amountNode: React.ReactNode;
  proceedsNode: React.ReactNode;
  gainCop: number;
  notes: string;
}

export default function OperationsTab() {
  const { t } = useTranslation();

  const { data: stocks = [] } = useStocks();
  const { data: allStockTxs = [] } = useStockTransactions();
  const { data: allStockSales = [] } = useStockSales();

  const { data: usdwPurchases = [] } = useUsdwPurchases();
  const { data: btcPurchases = [] } = useBtcPurchases();
  const { data: solPurchases = [] } = useSolPurchases();
  const { data: btcSales = [] } = useBtcSales();
  const { data: solSales = [] } = useSolSales();
  const { data: usdwSales = [] } = useUsdwSales();
  const { data: cryptoSnapshots = [] } = useCryptoSnapshots();

  const { data: funds = [] } = useFunds();

  const cryptoSummary = useMemo(
    () => computeCryptoSummary(usdwPurchases, btcPurchases, cryptoSnapshots, solPurchases, btcSales, solSales, usdwSales),
    [usdwPurchases, btcPurchases, cryptoSnapshots, solPurchases, btcSales, solSales, usdwSales]
  );

  const rows = useMemo((): OperationRow[] => {
    const result: OperationRow[] = [];

    // Stocks — FIFO is per-investment, so each stock's sales are matched against its own buys.
    stocks.forEach(stock => {
      const txs = allStockTxs.filter(t => t.investmentId === stock.id);
      const sales = allStockSales.filter(s => s.investmentId === stock.id);
      if (sales.length === 0) return;
      const { realizedGainBySaleId } = computeStockPosition(txs, sales);
      sales.forEach(sale => {
        const proceeds = sale.quantity * sale.priceUnit - sale.commission;
        result.push({
          id: `stock-${sale.id}`,
          dateMs: new Date(sale.saleDate).getTime(),
          kindLabel: t("operations.kindStock"),
          kindColor: "#7c3aed",
          assetName: stock.name,
          amountNode: `${sale.quantity.toLocaleString()} ${t("operations.shares")}`,
          proceedsNode: <Money amount={proceeds} />,
          gainCop: realizedGainBySaleId[sale.id] ?? 0,
          notes: sale.notes,
        });
      });
    });

    // Crypto — BTC, SOL, USDW all draw from/feed the same shared pool, so one computeSummary
    // call gives consistent per-sale realized gain for all three at once.
    btcSales.forEach(sale => {
      result.push({
        id: `btc-${sale.id}`,
        dateMs: new Date(sale.date).getTime(),
        kindLabel: t("operations.kindBtc"),
        kindColor: "#f7931a",
        assetName: "BTC",
        amountNode: <Money amount={sale.btcAmount} currency="BTC" />,
        proceedsNode: <Money amount={sale.usdwReceived} currency="USDW" />,
        gainCop: cryptoSummary.btcRealizedGainCopById[sale.id] ?? 0,
        notes: sale.notes,
      });
    });
    solSales.forEach(sale => {
      result.push({
        id: `sol-${sale.id}`,
        dateMs: new Date(sale.date).getTime(),
        kindLabel: t("operations.kindSol"),
        kindColor: "#9945ff",
        assetName: "SOL",
        amountNode: <Money amount={sale.solAmount} currency="SOL" />,
        proceedsNode: <Money amount={sale.usdwReceived} currency="USDW" />,
        gainCop: cryptoSummary.solRealizedGainCopById[sale.id] ?? 0,
        notes: sale.notes,
      });
    });
    usdwSales.forEach(sale => {
      result.push({
        id: `usdw-${sale.id}`,
        dateMs: new Date(sale.date).getTime(),
        kindLabel: t("operations.kindUsdw"),
        kindColor: "#f59e0b",
        assetName: "USDW",
        amountNode: <Money amount={sale.usdwAmount} currency="USDW" />,
        proceedsNode: <Money amount={sale.copReceived} />,
        gainCop: cryptoSummary.usdwRealizedGainCopById[sale.id] ?? 0,
        notes: sale.notes,
      });
    });

    // Funds — a withdrawal realizes a pro-rata share of the gain (see funds-tab.tsx), computed
    // per fund since each fund's value/invested history is independent.
    funds.forEach(fund => {
      const withdrawals = fund.snapshots.filter(s => s.withdrawal > 0);
      if (withdrawals.length === 0) return;
      const { withdrawalGainMap } = buildFundAccounting(fund.baseCapital, fund.snapshots);
      withdrawals.forEach(snap => {
        result.push({
          id: `fund-${snap.id}`,
          dateMs: new Date(snap.year, snap.month - 1, snap.day).getTime(),
          kindLabel: t("operations.kindFund"),
          kindColor: "#0891b2",
          assetName: fund.name,
          amountNode: <Money amount={snap.withdrawal} />,
          proceedsNode: <Money amount={snap.withdrawal} />,
          gainCop: withdrawalGainMap.get(snap.id) ?? 0,
          notes: "",
        });
      });
    });

    return result.sort((a, b) => b.dateMs - a.dateMs);
  }, [stocks, allStockTxs, allStockSales, btcSales, solSales, usdwSales, cryptoSummary, funds, t]);

  const totalRealizedGain = rows.reduce((s, r) => s + r.gainCop, 0);

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("operations.title")}</div>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: "#6b7280" }}>{t("operations.totalRealizedGain")} </span>
          <strong style={{ color: totalRealizedGain >= 0 ? "#059669" : "#dc2626" }}>
            {totalRealizedGain >= 0 ? "+" : ""}<Money amount={totalRealizedGain} />
          </strong>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>{t("operations.noOperationsYet")}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {[t("operations.colDate"), t("operations.colType"), t("operations.colAsset"), t("operations.colAmount"), t("operations.colProceeds"), t("operations.colRealizedGain"), t("operations.colNotes")].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "7px 10px" }}>{fmtDate(new Date(row.dateMs).toISOString())}</td>
                  <td style={{ padding: "7px 10px" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                      color: row.kindColor, background: `${row.kindColor}1a`,
                    }}>
                      {row.kindLabel}
                    </span>
                  </td>
                  <td style={{ padding: "7px 10px", fontWeight: 600 }}>{row.assetName}</td>
                  <td style={{ padding: "7px 10px" }}>{row.amountNode}</td>
                  <td style={{ padding: "7px 10px" }}>{row.proceedsNode}</td>
                  <td style={{ padding: "7px 10px", fontWeight: 600, color: row.gainCop >= 0 ? "#059669" : "#dc2626" }}>
                    {row.gainCop >= 0 ? "+" : ""}<Money amount={row.gainCop} />
                  </td>
                  <td style={{ padding: "7px 10px", color: "#6b7280" }}>{row.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
