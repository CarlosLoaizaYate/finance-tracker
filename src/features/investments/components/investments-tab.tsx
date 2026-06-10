"use client";

import { useState, useMemo, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  useStocks,
  useInvestmentTypes,
  useAddStock,
  useRemoveStock,
  useFixedDepositGroups,
  useFunds,
  useStockTransactions,
  useStockPriceSnapshots,
  type FixedDepositGroup,
  type Fund as FundType,
  type StockTransaction,
  type StockPriceSnapshot,
} from "@/hooks/use-finance-data";
import { useDashboardStore } from "@/stores/dashboard-store";
import { MONTHS } from "@/lib/constants";
import { fmt, gainPc } from "@/lib/formatters";
import Badge from "@/components/ui/badge";
import EditableCell from "@/components/ui/editable-cell";
import StockTransactionsTab from "./stock-transactions-tab";
import FixedDepositsTab from "./fixed-deposits-tab";
import FundsTab from "./funds-tab";

export default function InvestmentsTab() {
  const [subTab, setSubTab] = useState<"summary" | "funds" | "transactions" | "cdts">("summary");
  const { year, setYear, investmentMonth, setInvestmentMonth } = useDashboardStore();

  const { data: dbStocks = [] } = useStocks();
  const { data: investmentTypes = [] } = useInvestmentTypes();
  const addStockMut = useAddStock();
  const removeStockMut = useRemoveStock();

  return (
    <>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "2px solid #e5e7eb" }}>
        {(["summary", "funds", "transactions", "cdts"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            style={{
              padding: "8px 16px",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: subTab === tab ? "3px solid #7c3aed" : "3px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontWeight: subTab === tab ? 600 : 500,
              color: subTab === tab ? "#7c3aed" : "#6b7280",
              fontSize: 13,
            }}
          >
            {{ summary: "Summary", funds: "Funds", transactions: "Stock Transactions", cdts: "CDTs" }[tab]}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === "summary" && (
        <SummaryContent
          dbStocks={dbStocks}
          investmentTypes={investmentTypes}
          addStockMut={addStockMut}
          removeStockMut={removeStockMut}
          year={year}
          setYear={setYear}
          investmentMonth={investmentMonth}
          setInvestmentMonth={setInvestmentMonth}
        />
      )}
      {subTab === "funds" && <FundsTab />}
      {subTab === "transactions" && <StockTransactionsTab />}
      {subTab === "cdts" && <FixedDepositsTab />}
    </>
  );
}

// ── Category Summary Block ─────────────────────────────────────────────

const CDT_COLORS = ["#0891b2", "#059669", "#7c3aed", "#d97706", "#dc2626", "#2563eb", "#db2777"];

interface CategoryItem {
  id: string;
  name: string;
  color: string;
  label?: string;
  invested: number;
  currentValue: number | null;
  sellCommission?: number;
}

function GainCell({ gain, pct }: { gain: number; pct: number }) {
  const pos = gain >= 0;
  return (
    <span style={{ color: pos ? "#059669" : "#dc2626", fontWeight: 700 }}>
      {pos ? "+" : ""}{fmt(gain)} ({pos ? "+" : ""}{pct.toFixed(2)}%)
    </span>
  );
}

function CategoryBlock({ title, accentColor, items, showLabel }: {
  title: string; accentColor: string; items: CategoryItem[]; showLabel?: boolean;
}) {
  const totalInvested = items.reduce((s, i) => s + i.invested, 0);
  const withValue = items.filter(i => i.currentValue !== null && i.currentValue > 0);
  const totalCurrent = withValue.length > 0 ? withValue.reduce((s, i) => s + (i.currentValue ?? 0), 0) : null;
  const gain = totalCurrent !== null ? totalCurrent - totalInvested : null;
  const gainPct = gain !== null && totalInvested > 0 ? (gain / totalInvested) * 100 : 0;
  const hasSellComm = items.some(i => i.sellCommission !== undefined);
  const totalSellComm = items.reduce((s, i) => s + (i.sellCommission ?? 0), 0);
  const totalNet = gain !== null && hasSellComm ? gain - totalSellComm : null;
  const totalNetPct = totalNet !== null && totalInvested > 0 ? (totalNet / totalInvested) * 100 : null;

  return (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px #0001", overflow: "hidden", marginBottom: 12 }}>
      <div style={{ background: accentColor + "12", borderBottom: `2px solid ${accentColor}40`, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: "#1f2937" }}>{title}</span>
        <div style={{ display: "flex", gap: 20, fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ color: "#6b7280" }}>Invested: <strong style={{ color: accentColor }}>{fmt(totalInvested)}</strong></span>
          <span style={{ color: "#6b7280" }}>Current Value: <strong style={{ color: "#059669" }}>{totalCurrent !== null ? fmt(totalCurrent) : "—"}</strong></span>
          {gain !== null && <span style={{ color: "#6b7280" }}>Gain/Loss: <GainCell gain={gain} pct={gainPct} /></span>}
          {totalNet !== null && totalNetPct !== null && (
            <span style={{ color: "#6b7280" }}>Net if sold: <GainCell gain={totalNet} pct={totalNetPct} /></span>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: "12px 16px", color: "#9ca3af", fontSize: 12 }}>No entries yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ textAlign: "left", padding: "6px 16px", fontWeight: 600, color: "#6b7280" }}>Name</th>
                {showLabel && <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600, color: "#6b7280" }}>Type</th>}
                <th style={{ textAlign: "right", padding: "6px 16px", fontWeight: 600, color: "#6b7280" }}>Invested</th>
                <th style={{ textAlign: "right", padding: "6px 16px", fontWeight: 600, color: "#6b7280" }}>Current Value</th>
                <th style={{ textAlign: "right", padding: "6px 16px", fontWeight: 600, color: "#6b7280" }}>Gain / Loss</th>
                {hasSellComm && <th style={{ textAlign: "right", padding: "6px 16px", fontWeight: 600, color: "#dc2626" }}>Net if sold</th>}
                <th style={{ textAlign: "right", padding: "6px 16px", fontWeight: 600, color: "#6b7280" }}>Growth %</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const g = item.currentValue !== null ? item.currentValue - item.invested : null;
                const gPct = g !== null && item.invested > 0 ? (g / item.invested) * 100 : null;
                const net = g !== null && item.sellCommission !== undefined ? g - item.sellCommission : null;
                const netPct = net !== null && item.invested > 0 ? (net / item.invested) * 100 : null;
                return (
                  <tr key={item.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: "#1f2937" }}>{item.name}</span>
                      </div>
                    </td>
                    {showLabel && <td style={{ padding: "8px 10px", color: "#9ca3af" }}>{item.label || "—"}</td>}
                    <td style={{ padding: "8px 16px", textAlign: "right", color: accentColor, fontWeight: 600 }}>{fmt(item.invested)}</td>
                    <td style={{ padding: "8px 16px", textAlign: "right", color: "#059669", fontWeight: 600 }}>
                      {item.currentValue !== null && item.currentValue > 0 ? fmt(item.currentValue) : "—"}
                    </td>
                    <td style={{ padding: "8px 16px", textAlign: "right" }}>
                      {g !== null ? (
                        <span style={{ color: g >= 0 ? "#059669" : "#dc2626", fontWeight: 700 }}>{g >= 0 ? "+" : ""}{fmt(g)}</span>
                      ) : "—"}
                    </td>
                    {hasSellComm && (
                      <td style={{ padding: "8px 16px", textAlign: "right" }}>
                        {net !== null && netPct !== null ? (
                          <span style={{ color: net >= 0 ? "#059669" : "#dc2626", fontWeight: 700 }}>
                            {net >= 0 ? "+" : ""}{fmt(net)} ({netPct >= 0 ? "+" : ""}{netPct.toFixed(2)}%)
                          </span>
                        ) : "—"}
                      </td>
                    )}
                    <td style={{ padding: "8px 16px", textAlign: "right" }}>
                      {gPct !== null ? (
                        <span style={{ color: gPct >= 0 ? "#059669" : "#dc2626", fontWeight: 700 }}>{gPct >= 0 ? "+" : ""}{gPct.toFixed(2)}%</span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface Stock {
  id: string;
  name: string;
  typeId: string;
  type: { id: string; name: string };
  color: string;
  createdAt: string;
  investedCapital: number;
  sellCommission: number;
  active: boolean;
}

interface InvestmentType {
  id: string;
  name: string;
}

function SummaryContent({
  dbStocks,
  investmentTypes,
  addStockMut,
  removeStockMut,
  year,
  setYear,
  investmentMonth,
  setInvestmentMonth,
}: {
  dbStocks: Stock[];
  investmentTypes: InvestmentType[];
  addStockMut: any;
  removeStockMut: any;
  year: number;
  setYear: (year: number) => void;
  investmentMonth: number;
  setInvestmentMonth: (month: number) => void;
}) {
  // Category summary data
  const { data: depositGroups = [] } = useFixedDepositGroups();
  const { data: allTxs = [] } = useStockTransactions();
  const { data: allPriceSnaps = [] } = useStockPriceSnapshots();
  const { data: funds = [] } = useFunds();

  const cdtItems = useMemo((): CategoryItem[] =>
    depositGroups.map((g, i) => {
      const sorted = [...g.cycles].sort((a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
      // capitalAdded on the first cycle stores the initial deposit (set by the API).
      // Subsequent cycles store only additional money added on renewal.
      // So sum(capitalAdded) = total money ever put in from pocket.
      const invested = sorted.reduce((s, c) => s + c.capitalAdded, 0);

      // snapshot.gain stores TOTAL CDT value (capital + accumulated interest), not an increment.
      // Use the latest snapshot of the most recent cycle that has data.
      const lastCycleWithData = [...sorted].reverse().find(c => (c.snapshots ?? []).length > 0);
      const lastSnap = lastCycleWithData
        ? [...(lastCycleWithData.snapshots ?? [])].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month).at(-1)
        : null;
      const activeCycle = sorted.find(c => c.earnedInterest === null) ?? null;
      const baseCycle = activeCycle ?? sorted.at(-1);
      const currentValue = lastSnap ? lastSnap.gain : (baseCycle?.capital ?? invested);

      return { id: g.id, name: g.name, color: CDT_COLORS[i % CDT_COLORS.length], label: g.entity, invested, currentValue };
    }), [depositGroups]);

  const txByInv = useMemo(() => {
    const map: Record<string, StockTransaction[]> = {};
    allTxs.forEach(tx => { (map[tx.investmentId] ??= []).push(tx); });
    return map;
  }, [allTxs]);

  const priceSnapByInv = useMemo(() => {
    const map: Record<string, StockPriceSnapshot[]> = {};
    allPriceSnaps.forEach(s => { (map[s.investmentId] ??= []).push(s); });
    return map;
  }, [allPriceSnaps]);

  const stockItems = useMemo((): CategoryItem[] => {
    return dbStocks
      .filter(inv => txByInv[inv.id]?.length)
      .map(inv => {
        const txs = txByInv[inv.id];
        const totalCost = txs.reduce((s, t) => s + t.quantity * t.priceUnit + t.commission, 0);
        const totalShares = txs.reduce((s, t) => s + t.quantity, 0);
        const latest = (priceSnapByInv[inv.id] ?? []).sort((a, b) => b.year - a.year || b.month - a.month)[0];
        const currentValue = latest ? latest.pricePerShare * totalShares : null;
        return { id: inv.id, name: inv.name, color: inv.color, label: inv.type?.name, invested: totalCost, currentValue, sellCommission: inv.sellCommission };
      });
  }, [dbStocks, txByInv, priceSnapByInv]);

  const fundItems = useMemo((): CategoryItem[] =>
    funds.map(f => {
      const totalContribs = f.snapshots.reduce((s, x) => s + x.contribution, 0);
      const invested = f.baseCapital + totalContribs;
      const sorted = [...f.snapshots].sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
      const currentValue = sorted[0]?.currentValue ?? null;
      return { id: f.id, name: f.name, color: f.color, label: f.type?.name, invested, currentValue };
    }), [funds]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [newInv, setNewInv] = useState({ name: "", typeId: "", invested: 0, color: "#6366f1" });

  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const [hiddenInitialized, setHiddenInitialized] = useState(false);
  const toggleLine = (key: string) =>
    setHiddenLines((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Default: show category aggregates, hide individual lines
  useEffect(() => {
    if (hiddenInitialized) return;
    const hasData = Object.keys(txByInv).length > 0 || funds.length > 0 || depositGroups.length > 0;
    if (!hasData) return;
    const initialHidden = new Set<string>();
    Object.keys(txByInv).forEach(invId => initialHidden.add(`stock_${invId}`));
    funds.forEach(f => initialHidden.add(`fund_${f.id}`));
    depositGroups.forEach(g => initialHidden.add(`cdt_${g.id}`));
    setHiddenLines(initialHidden);
    setHiddenInitialized(true);
  }, [txByInv, funds, depositGroups, hiddenInitialized]);

  // IDs of investments that are managed by the Stock Transactions module
  const stockInvestmentIds = useMemo(
    () => new Set(allTxs.map(t => t.investmentId)),
    [allTxs]
  );

  // Transform investments — exclude those managed by Stock Transactions (shown in the block above)
  const invs = useMemo(
    () => dbStocks
      .filter(inv => !stockInvestmentIds.has(inv.id))
      .map((inv) => ({
        id: inv.id, name: inv.name, type: inv.type?.name || "No Type",
        color: inv.color, invested: inv.investedCapital,
      })),
    [dbStocks, stockInvestmentIds]
  );

  const currentDate = new Date();
  const defStart = `${currentDate.getFullYear() - 1}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  const defEnd = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

  const [chartFrom, setChartFrom] = useState(defStart);
  const [chartTo, setChartTo] = useState(defEnd);

  // Add new investment
  const addNewInv = () => {
    if (!newInv.name || !newInv.typeId) return;
    addStockMut.mutate({
      name: newInv.name,
      typeId: newInv.typeId,
      color: newInv.color,
      investedCapital: +newInv.invested || 0,
      year,
      month: investmentMonth,
    });
    setShowForm(false);
    setNewInv({ name: "", typeId: "", invested: 0, color: "#6366f1" });
  };

  // Chart data
  const chartData = useMemo(() => {
    const parseMonth = (str: string) => {
      const [y, m] = str.split("-");
      return +y * 12 + (+m - 1);
    };
    const startAbs = chartFrom ? parseMonth(chartFrom) : 0;
    const endAbs = chartTo ? parseMonth(chartTo) : 0;

    if (!chartFrom || !chartTo || startAbs > endAbs) return [];

    const data = [];
    for (let i = startAbs; i <= endAbs; i++) {
      let tv = 0, ti = 0;
      const row: Record<string, number | string> = {};

      // Traditional investments (flat at investedCapital — InvestmentSnapshot table removed)
      invs.forEach((inv) => {
        tv += inv.invested;
        ti += inv.invested;
        row[inv.id] = inv.invested;
      });

      // Stocks: priceSnap months are 1-indexed → convert with -1
      let stocksTotal = 0;
      Object.entries(txByInv).forEach(([invId, txs]) => {
        const relevantTxs = txs.filter(tx => {
          const d = new Date(tx.transactionDate);
          return d.getUTCFullYear() * 12 + d.getUTCMonth() <= i;
        });
        if (relevantTxs.length === 0) return;
        const totalShares = relevantTxs.reduce((s, t) => s + t.quantity, 0);
        const stockCost = relevantTxs.reduce((s, t) => s + t.quantity * t.priceUnit + t.commission, 0);
        ti += stockCost;
        const relevantPriceSnaps = (priceSnapByInv[invId] ?? [])
          .filter(s => s.year * 12 + (s.month - 1) <= i)
          .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
        const val = relevantPriceSnaps[0] ? relevantPriceSnaps[0].pricePerShare * totalShares : stockCost;
        tv += val;
        stocksTotal += val;
        row[`stock_${invId}`] = val;
      });
      if (Object.keys(txByInv).length > 0) row["Stocks Total"] = stocksTotal;

      // Funds: snapshot months are 1-indexed → convert with -1
      // Only include a fund from its startDate onward
      let fundsTotal = 0;
      funds.forEach(fund => {
        const sd = new Date(fund.startDate);
        const fundStartAbs = sd.getUTCFullYear() * 12 + sd.getUTCMonth();
        if (i < fundStartAbs) return;
        const relevantSnaps = fund.snapshots
          .filter(s => s.year * 12 + (s.month - 1) <= i)
          .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
        const totalContribs = relevantSnaps.reduce((s, x) => s + x.contribution, 0);
        const fundInvested = fund.baseCapital + totalContribs;
        ti += fundInvested;
        const val = relevantSnaps[0]?.currentValue ?? fundInvested;
        tv += val;
        fundsTotal += val;
        row[`fund_${fund.id}`] = val;
      });
      if (funds.length > 0) row["Funds Total"] = fundsTotal;

      // CDTs: snapshot months are 1-indexed → convert with -1
      // Only include a CDT group from the startDate of its first cycle onward
      let cdtTotalVal = 0;
      let cdtTotalInvested = 0;
      depositGroups.forEach((group, gi) => {
        const sortedCycles = [...group.cycles].sort((a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        );
        const firstCycle = sortedCycles[0];
        if (!firstCycle) return;
        const sd = new Date(firstCycle.startDate);
        const cdtStartAbs = sd.getUTCFullYear() * 12 + sd.getUTCMonth();
        if (i < cdtStartAbs) return;

        const invested = group.cycles.reduce((s, c) => s + c.capitalAdded, 0);
        cdtTotalInvested += invested;
        let latestVal: number | null = null;
        let latestAbs = -1;
        group.cycles.forEach(cycle => {
          (cycle.snapshots ?? []).forEach(snap => {
            const snapAbs = snap.year * 12 + (snap.month - 1);
            if (snapAbs <= i && snapAbs > latestAbs) {
              latestAbs = snapAbs;
              latestVal = snap.gain;
            }
          });
        });
        let groupVal: number;
        if (latestVal !== null) {
          groupVal = latestVal;
        } else {
          const baseCycle = sortedCycles.find(c => c.earnedInterest === null) ?? sortedCycles.at(-1);
          groupVal = baseCycle?.capital ?? invested;
        }
        cdtTotalVal += groupVal;
        row[`cdt_${group.id}`] = groupVal;
      });
      ti += cdtTotalInvested;
      tv += cdtTotalVal;
      if (depositGroups.length > 0) row["CDTs"] = cdtTotalVal;

      const m = i % 12;
      const y = Math.floor(i / 12);
      row.mes = `${MONTHS[m]} ${y}`;
      row["Total Value"] = tv;
      row.Invested = ti;
      row.Gain = tv - ti;
      data.push(row);
    }
    return data;
  }, [invs, chartFrom, chartTo, txByInv, priceSnapByInv, funds, depositGroups]);

  return (
    <>
      {/* Category summaries */}
      <CategoryBlock title="CDTs" accentColor="#0891b2" items={cdtItems} showLabel />
      <CategoryBlock title="Stock Transactions" accentColor="#7c3aed" items={stockItems} showLabel />
      <CategoryBlock title="Funds" accentColor="#059669" items={fundItems} showLabel />

      {/* Portfolio Evolution chart */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" }}>
        {/* Header + date range */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Portfolio Evolution</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>From:</label>
              <input type="month" value={chartFrom} onChange={(e) => setChartFrom(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>To:</label>
              <input type="month" value={chartTo} onChange={(e) => setChartTo(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
            </div>
          </div>
        </div>

        {/* Line toggles — category aggregates */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {[
            { key: "Total Value", name: "Total Value", color: "#7c3aed" },
            { key: "Invested",    name: "Invested",    color: "#9ca3af" },
            ...invs.map((inv) => ({ key: inv.id, name: inv.name, color: inv.color })),
            ...(Object.keys(txByInv).some(id => dbStocks.find(d => d.id === id)) ? [{ key: "Stocks Total", name: "Stocks", color: "#7c3aed" }] : []),
            ...(funds.length > 0 ? [{ key: "Funds Total", name: "Funds", color: "#059669" }] : []),
            ...(depositGroups.length > 0 ? [{ key: "CDTs", name: "CDTs", color: "#0891b2" }] : []),
          ].map(({ key, name, color }) => {
            const visible = !hiddenLines.has(key);
            return (
              <button key={key} onClick={() => toggleLine(key)} style={{
                padding: "3px 12px", borderRadius: 20,
                border: `2px solid ${color}`,
                background: visible ? color : "transparent",
                color: visible ? "#fff" : color,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all .15s",
              }}>
                {name}
              </button>
            );
          })}
        </div>
        {/* Line toggles — individual investments */}
        {(Object.keys(txByInv).length > 0 || funds.length > 0 || depositGroups.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#9ca3af", marginRight: 4, fontWeight: 600 }}>Individual:</span>
            {[
              ...Object.keys(txByInv).flatMap(invId => {
                const inv = dbStocks.find(d => d.id === invId);
                if (!inv) return [];
                return [{ key: `stock_${invId}`, name: inv.name, color: inv.color }];
              }),
              ...funds.map(fund => ({ key: `fund_${fund.id}`, name: fund.name, color: fund.color })),
              ...depositGroups.map((g, gi) => ({ key: `cdt_${g.id}`, name: g.name, color: CDT_COLORS[gi % CDT_COLORS.length] })),
            ].map(({ key, name, color }) => {
              const visible = !hiddenLines.has(key);
              return (
                <button key={key} onClick={() => toggleLine(key)} style={{
                  padding: "2px 10px", borderRadius: 20,
                  border: `1.5px solid ${color}`,
                  background: visible ? color : "transparent",
                  color: visible ? "#fff" : color,
                  fontSize: 10, fontWeight: 600, cursor: "pointer",
                  transition: "all .15s",
                }}>
                  {name}
                </button>
              );
            })}
          </div>
        )}

        {chartData.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "32px 0" }}>
            No data in selected range.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(Number(v) / 1e6).toFixed(1)}M`} />
              <Tooltip formatter={(v: unknown) => fmt(Number(v))} />
              <Line type="monotone" dataKey="Total Value" name="Total Value"
                stroke="#7c3aed" strokeWidth={2} dot={{ r: 2 }}
                hide={hiddenLines.has("Total Value")} />
              <Line type="monotone" dataKey="Invested" name="Invested"
                stroke="#9ca3af" strokeDasharray="5 5" strokeWidth={2} dot={{ r: 2 }}
                hide={hiddenLines.has("Invested")} />
              {/* Category aggregate lines */}
              {Object.keys(txByInv).length > 0 && (
                <Line type="monotone" dataKey="Stocks Total" name="Stocks"
                  stroke="#7c3aed" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }}
                  hide={hiddenLines.has("Stocks Total")} />
              )}
              {funds.length > 0 && (
                <Line type="monotone" dataKey="Funds Total" name="Funds"
                  stroke="#059669" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }}
                  hide={hiddenLines.has("Funds Total")} />
              )}
              {depositGroups.length > 0 && (
                <Line type="monotone" dataKey="CDTs" name="CDTs"
                  stroke="#0891b2" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }}
                  hide={hiddenLines.has("CDTs")} />
              )}
              {/* Traditional investment lines */}
              {invs.map((inv) => (
                <Line key={inv.id} type="monotone" dataKey={inv.id} name={inv.name}
                  stroke={inv.color} strokeWidth={1.5} dot={{ r: 2 }}
                  hide={hiddenLines.has(inv.id)} />
              ))}
              {/* Individual stock lines */}
              {Object.keys(txByInv).map(invId => {
                const inv = dbStocks.find(d => d.id === invId);
                if (!inv) return null;
                return (
                  <Line key={`stock_${invId}`} type="monotone" dataKey={`stock_${invId}`} name={inv.name}
                    stroke={inv.color} strokeWidth={1.5} dot={{ r: 2 }}
                    hide={hiddenLines.has(`stock_${invId}`)} />
                );
              })}
              {/* Individual fund lines */}
              {funds.map(fund => (
                <Line key={`fund_${fund.id}`} type="monotone" dataKey={`fund_${fund.id}`} name={fund.name}
                  stroke={fund.color} strokeWidth={1.5} dot={{ r: 2 }}
                  hide={hiddenLines.has(`fund_${fund.id}`)} />
              ))}
              {/* Individual CDT group lines */}
              {depositGroups.map((g, gi) => (
                <Line key={`cdt_${g.id}`} type="monotone" dataKey={`cdt_${g.id}`} name={g.name}
                  stroke={CDT_COLORS[gi % CDT_COLORS.length]} strokeWidth={1.5} dot={{ r: 2 }}
                  hide={hiddenLines.has(`cdt_${g.id}`)} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  );
}
