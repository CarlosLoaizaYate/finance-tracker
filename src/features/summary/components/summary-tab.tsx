"use client";

import { useMemo } from "react";
import {
  ComposedChart, Area, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  useExpenseItems,
  useExpenseRecords,
  useIncomeSources,
  useCategories,
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

    </>
  );
}
