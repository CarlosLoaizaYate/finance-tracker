"use client";

import { useMemo } from "react";
import {
  ComposedChart, Area, Bar, Line, PieChart, Pie, Cell,
  BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  useExpenseItems,
  useExpenseRecords,
  useIncomeSources,
  useCategories,
  useStocks,
  useStockTransactions,
  useStockPriceSnapshots,
  useFunds,
  useFixedDepositGroups,
  effectiveIncomeAmount,
} from "@/hooks/use-finance-data";
import { useDashboardStore } from "@/stores/dashboard-store";
import { MONTHS } from "@/lib/constants";
import { fmt, gainPc } from "@/lib/formatters";
import Kpi from "@/components/ui/kpi";
import Badge from "@/components/ui/badge";

export default function SummaryTab() {
  const { year, monthFrom, monthTo, setMonthFrom, setMonthTo } = useDashboardStore();

  const { data: dbItems = [] } = useExpenseItems();
  const { data: dbRecords = [] } = useExpenseRecords(year);
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: categories = [] } = useCategories();

  // item lookup: id → { catId }
  const itemById = useMemo(
    () => Object.fromEntries(dbItems.map((it) => [it.id, { catId: it.categoryId }])),
    [dbItems]
  );

  // gastos: month → itemId → total spent (accumulate, not overwrite)
  const gastos = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    dbRecords.forEach((r) => {
      if (!map[r.month]) map[r.month] = {};
      map[r.month][r.itemId] = (map[r.month][r.itemId] ?? 0) + r.realValue;
    });
    return map;
  }, [dbRecords]);

  const getIncTotal = (mi: number) =>
    incomeSources.reduce((s, src) => s + effectiveIncomeAmount(src, mi, year), 0);

  // Range
  const range = useMemo(() => {
    const a: number[] = [];
    for (let i = monthFrom; i <= monthTo; i++) a.push(i);
    return a;
  }, [monthFrom, monthTo]);

  // Computed data: only actual records, no budget fallback
  const rangeData = useMemo(
    () =>
      range.map((mi) => {
        const ingt = getIncTotal(mi);
        const catT: Record<string, number> = {};
        const monthRecs = gastos[mi] ?? {};
        Object.entries(monthRecs).forEach(([itemId, amount]) => {
          const catId = itemById[itemId]?.catId;
          if (catId) catT[catId] = (catT[catId] ?? 0) + amount;
        });
        const gast = Object.values(catT).reduce((s, v) => s + v, 0);
        return { mes: MONTHS[mi], mi, ...catT, ingresos: ingt, gastos: gast, libre: ingt - gast };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range, gastos, itemById, incomeSources, year]
  );

  const totals = useMemo(() => {
    const t = { ingresos: 0, gastos: 0, libre: 0 };
    rangeData.forEach((d) => { t.ingresos += d.ingresos; t.gastos += d.gastos; t.libre += d.libre; });
    return t;
  }, [rangeData]);

  // Pie: spending per category across selected range (from actual records only)
  const pieData = useMemo(() => {
    const catTotals: Record<string, number> = {};
    range.forEach((mi) => {
      const monthRecs = gastos[mi] ?? {};
      Object.entries(monthRecs).forEach(([itemId, amount]) => {
        const catId = itemById[itemId]?.catId;
        if (catId) catTotals[catId] = (catTotals[catId] ?? 0) + amount;
      });
    });
    return categories
      .map((c) => ({ name: c.name, color: c.color, value: catTotals[c.id] ?? 0 }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [range, gastos, itemById, categories]);

  // Current month income total for banner
  const curMonth = new Date().getMonth() + 1;
  const currentIncomeTotal = incomeSources.reduce(
    (s, src) => s + effectiveIncomeAmount(src, curMonth, year),
    0
  );

  return (
    <>
      {/* Filters */}
      <div style={{ background: "#fff", borderRadius: 12, padding: "12px 18px", marginBottom: 16, boxShadow: "0 1px 4px #0001",
        display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>From:</label>
          <select value={monthFrom} onChange={(e) => setMonthFrom(Math.min(+e.target.value, monthTo))}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>To:</label>
          <select value={monthTo} onChange={(e) => setMonthTo(Math.max(+e.target.value, monthFrom))}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>
          {range.length} month{range.length !== 1 ? "s" : ""} selected
        </div>
      </div>

      {/* Income banner */}
      <div style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 12,
        padding: "14px 20px", marginBottom: 16, color: "#fff", display: "flex", gap: 20, flexWrap: "wrap",
        alignItems: "center" }}>
        {incomeSources.length === 0 ? (
          <span style={{ fontSize: 13, opacity: 0.8 }}>
            No income sources configured — add them in Settings.
          </span>
        ) : (
          <>
            {incomeSources.map((src) => (
              <div key={src.id}>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{src.name}</div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  {fmt(effectiveIncomeAmount(src, curMonth, year))}
                </div>
              </div>
            ))}
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.3)", paddingLeft: 20 }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Total Monthly Income</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(currentIncomeTotal)}</div>
            </div>
          </>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi title="Total Income" value={fmt(totals.ingresos)} color="#6366f1" />
        <Kpi title="Total Expenses" value={fmt(totals.gastos)} color="#ef4444" />
        <Kpi title="Available" value={fmt(totals.libre)} color={totals.libre >= 0 ? "#10b981" : "#ef4444"}
          tag={totals.libre >= 0
            ? { bg: "#d1fae5", fg: "#065f46", text: "Positive" }
            : { bg: "#fee2e2", fg: "#991b1b", text: "Deficit" }} />
      </div>

      {/* Charts */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: 2, minWidth: 320, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Monthly Summary</h3>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={rangeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="ingresos" name="Income" fill="#c7d2fe" stroke="#6366f1" />
              <Bar dataKey="gastos" name="Expenses" fill="#f87171" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="libre" name="Available" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: 1, minWidth: 260, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>By Category</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                outerRadius={80} innerRadius={40} paddingAngle={2}>
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {pieData.map((d) => (
              <span key={d.name} style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, display: "inline-block" }} />
                {d.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <SavingsRateChart rangeData={rangeData} />

      <InvestmentsSummarySection />
      <InvestmentChartsSection />

    </>
  );
}

const CDT_COLORS = ["#0891b2", "#059669", "#7c3aed", "#d97706", "#dc2626", "#2563eb", "#db2777"];

function InvestmentsSummarySection() {
  const { data: dbStocks = [] } = useStocks();
  const { data: allTxs = [] } = useStockTransactions();
  const { data: allPriceSnaps = [] } = useStockPriceSnapshots();
  const { data: funds = [] } = useFunds();
  const { data: depositGroups = [] } = useFixedDepositGroups();

  const txByInv = useMemo(() => {
    const map: Record<string, typeof allTxs> = {};
    allTxs.forEach(tx => { (map[tx.investmentId] ??= []).push(tx); });
    return map;
  }, [allTxs]);

  const priceSnapByInv = useMemo(() => {
    const map: Record<string, typeof allPriceSnaps> = {};
    allPriceSnaps.forEach(s => { (map[s.investmentId] ??= []).push(s); });
    return map;
  }, [allPriceSnaps]);

  // Stocks
  const stocksInvested = useMemo(() =>
    dbStocks
      .filter(inv => txByInv[inv.id]?.length)
      .reduce((s, inv) => {
        const txs = txByInv[inv.id];
        return s + txs.reduce((t, tx) => t + tx.quantity * tx.priceUnit + tx.commission, 0);
      }, 0),
    [dbStocks, txByInv]);

  const stocksCurrentValue = useMemo(() => {
    const items = dbStocks.filter(inv => txByInv[inv.id]?.length);
    if (items.length === 0) return null;
    let total = 0;
    let allHavePrice = true;
    for (const inv of items) {
      const txs = txByInv[inv.id];
      const totalShares = txs.reduce((s, t) => s + t.quantity, 0);
      const latest = (priceSnapByInv[inv.id] ?? []).sort((a, b) => b.year - a.year || b.month - a.month)[0];
      if (latest) {
        total += latest.pricePerShare * totalShares;
      } else {
        allHavePrice = false;
        total += txs.reduce((s, t) => s + t.quantity * t.priceUnit + t.commission, 0);
      }
    }
    return allHavePrice ? total : null;
  }, [dbStocks, txByInv, priceSnapByInv]);

  // Funds
  const fundsInvested = useMemo(() =>
    funds.reduce((s, f) => s + f.baseCapital + f.snapshots.reduce((t, x) => t + x.contribution, 0), 0),
    [funds]);

  const fundsCurrentValue = useMemo(() => {
    if (funds.length === 0) return null;
    let total = 0;
    for (const f of funds) {
      const sorted = [...f.snapshots].sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
      total += sorted[0]?.currentValue ?? (f.baseCapital + f.snapshots.reduce((s, x) => s + x.contribution, 0));
    }
    return total;
  }, [funds]);

  // CDTs
  const cdtsInvested = useMemo(() =>
    depositGroups.reduce((s, g) => {
      const sorted = [...g.cycles].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      return s + sorted.reduce((t, c) => t + c.capitalAdded, 0);
    }, 0),
    [depositGroups]);

  const cdtsCurrentValue = useMemo(() => {
    if (depositGroups.length === 0) return null;
    let total = 0;
    for (const g of depositGroups) {
      const sorted = [...g.cycles].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      const lastCycleWithData = [...sorted].reverse().find(c => (c.snapshots ?? []).length > 0);
      const lastSnap = lastCycleWithData
        ? [...(lastCycleWithData.snapshots ?? [])].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month).at(-1)
        : null;
      const activeCycle = sorted.find(c => c.earnedInterest === null) ?? null;
      const baseCycle = activeCycle ?? sorted.at(-1);
      total += lastSnap ? lastSnap.gain : (baseCycle?.capital ?? sorted.reduce((s, c) => s + c.capitalAdded, 0));
    }
    return total;
  }, [depositGroups]);

  const stocksSellCommission = useMemo(() =>
    dbStocks
      .filter(inv => txByInv[inv.id]?.length)
      .reduce((s, inv) => s + inv.sellCommission, 0),
    [dbStocks, txByInv]);

  const totalInvested = stocksInvested + fundsInvested + cdtsInvested;
  const hasStocks = dbStocks.some(inv => txByInv[inv.id]?.length);
  const hasFunds = funds.length > 0;
  const hasCdts = depositGroups.length > 0;

  if (!hasStocks && !hasFunds && !hasCdts) return null;

  const rows: { label: string; color: string; invested: number; current: number | null; sellComm?: number }[] = [];
  if (hasStocks) rows.push({ label: "Stocks", color: "#6366f1", invested: stocksInvested, current: stocksCurrentValue, sellComm: stocksSellCommission });
  if (hasFunds)  rows.push({ label: "Funds",  color: "#0891b2", invested: fundsInvested,  current: fundsCurrentValue });
  if (hasCdts)   rows.push({ label: "CDTs",   color: "#059669", invested: cdtsInvested,   current: cdtsCurrentValue });

  const totalCurrent = rows.every(r => r.current !== null)
    ? rows.reduce((s, r) => s + (r.current ?? 0), 0)
    : null;
  const totalGain = totalCurrent !== null ? totalCurrent - totalInvested : null;
  const totalGainPct = totalGain !== null && totalInvested > 0 ? (totalGain / totalInvested) * 100 : null;

  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Investments</h3>
        <div style={{ display: "flex", gap: 20, fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ color: "#6b7280" }}>
            Invested: <strong style={{ color: "#6366f1" }}>{fmt(totalInvested)}</strong>
          </span>
          {totalCurrent !== null && (
            <span style={{ color: "#6b7280" }}>
              Current: <strong style={{ color: "#059669" }}>{fmt(totalCurrent)}</strong>
            </span>
          )}
          {totalGain !== null && totalGainPct !== null && (
            <span style={{ color: "#6b7280" }}>
              Gain:{" "}
              <strong style={{ color: totalGain >= 0 ? "#059669" : "#dc2626" }}>
                {totalGain >= 0 ? "+" : ""}{fmt(totalGain)} ({totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(2)}%)
              </strong>
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {rows.map(row => {
          const gain = row.current !== null ? row.current - row.invested : null;
          const gainPct = gain !== null && row.invested > 0 ? (gain / row.invested) * 100 : null;
          const net = gain !== null && row.sellComm !== undefined ? gain - row.sellComm : null;
          const netPct = net !== null && row.invested > 0 ? (net / row.invested) * 100 : null;
          return (
            <div key={row.label} style={{
              flex: 1, minWidth: 160,
              border: `1px solid ${row.color}30`,
              borderTop: `3px solid ${row.color}`,
              borderRadius: 8, padding: "10px 14px",
              background: row.color + "08",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: row.color, marginBottom: 6 }}>{row.label}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                Invested: <strong style={{ color: "#374151" }}>{fmt(row.invested)}</strong>
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                Current:{" "}
                <strong style={{ color: row.current !== null ? "#059669" : "#9ca3af" }}>
                  {row.current !== null ? fmt(row.current) : "—"}
                </strong>
              </div>
              {gain !== null && gainPct !== null && (
                <div style={{ fontSize: 11, marginTop: 4, color: "#6b7280" }}>
                  Gain:{" "}
                  <strong style={{ color: gain >= 0 ? "#059669" : "#dc2626" }}>
                    {gain >= 0 ? "+" : ""}{fmt(gain)} ({gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}%)
                  </strong>
                </div>
              )}
              {net !== null && netPct !== null && (
                <div style={{ fontSize: 11, marginTop: 2, color: "#6b7280" }}>
                  Net if sold:{" "}
                  <strong style={{ color: net >= 0 ? "#059669" : "#dc2626" }}>
                    {net >= 0 ? "+" : ""}{fmt(net)} ({netPct >= 0 ? "+" : ""}{netPct.toFixed(2)}%)
                  </strong>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Savings Rate Chart ────────────────────────────────────────────────

interface RangeRow { mes: string; ingresos: number; gastos: number; libre: number }

function SavingsRateChart({ rangeData }: { rangeData: RangeRow[] }) {
  const data = rangeData
    .filter(d => d.ingresos > 0)
    .map(d => ({
      mes: d.mes,
      rate: Math.round((d.libre / d.ingresos) * 100 * 10) / 10,
    }));

  if (data.length === 0) return null;

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    const color = payload.rate >= 0 ? "#10b981" : "#ef4444";
    return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const v = payload[0].value as number;
    return (
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div style={{ color: v >= 0 ? "#059669" : "#dc2626", fontWeight: 600 }}>
          {v >= 0 ? "+" : ""}{v}% saved
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001", marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Monthly Savings Rate</h3>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={["auto", "auto"]} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
          <Area
            type="monotone" dataKey="rate"
            fill="#d1fae5" stroke="#10b981" strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Investment Distribution + Gain Charts ─────────────────────────────

function InvestmentChartsSection() {
  const { data: dbStocks = [] } = useStocks();
  const { data: allTxs = [] } = useStockTransactions();
  const { data: allPriceSnaps = [] } = useStockPriceSnapshots();
  const { data: funds = [] } = useFunds();
  const { data: depositGroups = [] } = useFixedDepositGroups();

  const txByInv = useMemo(() => {
    const map: Record<string, typeof allTxs> = {};
    allTxs.forEach(tx => { (map[tx.investmentId] ??= []).push(tx); });
    return map;
  }, [allTxs]);

  const priceSnapByInv = useMemo(() => {
    const map: Record<string, typeof allPriceSnaps> = {};
    allPriceSnaps.forEach(s => { (map[s.investmentId] ??= []).push(s); });
    return map;
  }, [allPriceSnaps]);

  const rows = useMemo(() => {
    const result: { name: string; color: string; invested: number; current: number | null }[] = [];

    const hasStocks = dbStocks.some(inv => txByInv[inv.id]?.length);
    if (hasStocks) {
      let invested = 0, current = 0, allHavePrice = true;
      dbStocks.filter(inv => txByInv[inv.id]?.length).forEach(inv => {
        const txs = txByInv[inv.id];
        const cost = txs.reduce((s, t) => s + t.quantity * t.priceUnit + t.commission, 0);
        const shares = txs.reduce((s, t) => s + t.quantity, 0);
        const latest = (priceSnapByInv[inv.id] ?? []).sort((a, b) => b.year - a.year || b.month - a.month)[0];
        invested += cost;
        if (latest) current += latest.pricePerShare * shares;
        else { allHavePrice = false; current += cost; }
      });
      result.push({ name: "Stocks", color: "#6366f1", invested, current: allHavePrice ? current : null });
    }

    if (funds.length > 0) {
      const invested = funds.reduce((s, f) => s + f.baseCapital + f.snapshots.reduce((t, x) => t + x.contribution, 0), 0);
      const current = funds.reduce((s, f) => {
        const sorted = [...f.snapshots].sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
        return s + (sorted[0]?.currentValue ?? (f.baseCapital + f.snapshots.reduce((t, x) => t + x.contribution, 0)));
      }, 0);
      result.push({ name: "Funds", color: "#0891b2", invested, current });
    }

    if (depositGroups.length > 0) {
      let invested = 0, current = 0;
      depositGroups.forEach(g => {
        const sorted = [...g.cycles].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        invested += sorted.reduce((s, c) => s + c.capitalAdded, 0);
        const lastCycleWithData = [...sorted].reverse().find(c => (c.snapshots ?? []).length > 0);
        const lastSnap = lastCycleWithData
          ? [...(lastCycleWithData.snapshots ?? [])].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month).at(-1)
          : null;
        const activeCycle = sorted.find(c => c.earnedInterest === null) ?? null;
        const baseCycle = activeCycle ?? sorted.at(-1);
        current += lastSnap ? lastSnap.gain : (baseCycle?.capital ?? sorted.reduce((s, c) => s + c.capitalAdded, 0));
      });
      result.push({ name: "CDTs", color: "#059669", invested, current });
    }

    return result;
  }, [dbStocks, txByInv, priceSnapByInv, funds, depositGroups]);

  if (rows.length === 0) return null;

  const pieData = rows.map(r => ({ name: r.name, value: r.invested, color: r.color }));

  const barData = rows.map(r => ({
    name: r.name,
    Invested: r.invested,
    "Current Value": r.current ?? r.invested,
    gain: r.current !== null ? r.current - r.invested : null,
    color: r.color,
  }));

  const GainTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = rows.find(r => r.name === label);
    const gain = row?.current !== null && row ? row.current! - row.invested : null;
    const gainPct = gain !== null && row!.invested > 0 ? (gain / row!.invested) * 100 : null;
    return (
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        {payload.map((p: any) => (
          <div key={p.name} style={{ color: p.color ?? "#374151" }}>
            {p.name}: <strong>{fmt(p.value)}</strong>
          </div>
        ))}
        {gain !== null && gainPct !== null && (
          <div style={{ marginTop: 4, color: gain >= 0 ? "#059669" : "#dc2626", fontWeight: 600 }}>
            Gain: {gain >= 0 ? "+" : ""}{fmt(gain)} ({gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}%)
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
      {/* Pie: allocation */}
      <div style={{ flex: 1, minWidth: 240, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Portfolio Allocation</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
              outerRadius={75} innerRadius={36} paddingAngle={3}
              labelLine={false}>
              {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v: any) => fmt(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
          {pieData.map(d => (
            <span key={d.name} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: "inline-block" }} />
              <span style={{ color: "#374151", fontWeight: 600 }}>{d.name}</span>
              <span style={{ color: "#9ca3af" }}>{fmt(d.value)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Bar: invested vs current value */}
      <div style={{ flex: 2, minWidth: 300, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Invested vs Current Value</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
            <Tooltip content={<GainTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Invested" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Current Value" radius={[4, 4, 0, 0]}>
              {barData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
