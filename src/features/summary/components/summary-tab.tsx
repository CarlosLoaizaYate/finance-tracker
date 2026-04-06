"use client";

import { useMemo } from "react";
import {
  ComposedChart, Area, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  useExpenseItems,
  useExpenseRecords,
  useInvestments,
  useInvestmentSnapshots,
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
  const { data: dbInvestments = [] } = useInvestments();
  const { data: dbSnapshots = [] } = useInvestmentSnapshots(year);
  const { data: allSnapshots = [] } = useInvestmentSnapshots("all");
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

  // Transform snapshots
  const snaps = useMemo(() => {
    const map: Record<number, Record<string, { value: number; contrib: number }>> = {};
    dbSnapshots.forEach((s) => {
      if (!map[s.month]) map[s.month] = {};
      map[s.month][s.investmentId] = { value: s.currentValue, contrib: s.contribution };
    });
    return map;
  }, [dbSnapshots]);

  const snapMonths = useMemo(
    () => Object.keys(snaps).map(Number).sort((a, b) => a - b),
    [snaps]
  );

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

  // Investment summary — uses all snapshots for contributions + latest value
  const lastSnap = useMemo(() => {
    if (allSnapshots.length === 0 && dbInvestments.length === 0) return null;

    // Per investment: sum contributions and find latest snapshot
    const byInv: Record<string, { totalContrib: number; latestValue: number; latestKey: number }> = {};
    allSnapshots.forEach((s) => {
      const key = s.year * 100 + s.month; // comparable sortable key
      if (!byInv[s.investmentId]) {
        byInv[s.investmentId] = { totalContrib: 0, latestValue: 0, latestKey: -1 };
      }
      byInv[s.investmentId].totalContrib += s.contribution;
      if (key > byInv[s.investmentId].latestKey) {
        byInv[s.investmentId].latestKey   = key;
        byInv[s.investmentId].latestValue = s.currentValue;
      }
    });

    // Find label for last snapshot month
    let globalLatestKey = -1;
    allSnapshots.forEach((s) => {
      const key = s.year * 100 + s.month;
      if (key > globalLatestKey) globalLatestKey = key;
    });
    const lMonth = globalLatestKey > 0 ? globalLatestKey % 100 : new Date().getMonth();
    const lYear  = globalLatestKey > 0 ? Math.floor(globalLatestKey / 100) : new Date().getFullYear();
    const lmes   = `${MONTHS[lMonth]} ${lYear}`;

    let tv = 0, ti = 0, tca = 0;
    const detail = dbInvestments.map((inv) => {
      const d            = byInv[inv.id];
      const capitalInicial  = inv.investedCapital;
      const capitalActual   = capitalInicial + (d?.totalContrib ?? 0);
      const val             = d?.latestValue ?? capitalInicial;
      tv  += val;
      ti  += capitalInicial;
      tca += capitalActual;
      return { id: inv.id, name: inv.name, color: inv.color, capitalInicial, capitalActual, val };
    });

    return { detail, tv, ti, tca, tgain: tv - tca, tpct: gainPc(tv, tca), lmes };
  }, [allSnapshots, dbInvestments]);

  return (
    <>
      {/* Filters */}
      <div style={{ background: "#fff", borderRadius: 12, padding: "12px 18px", marginBottom: 16, boxShadow: "0 1px 4px #0001",
        display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Desde:</label>
          <select value={monthFrom} onChange={(e) => setMonthFrom(Math.min(+e.target.value, monthTo))}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Hasta:</label>
          <select value={monthTo} onChange={(e) => setMonthTo(Math.max(+e.target.value, monthFrom))}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>
          {range.length} mes{range.length !== 1 ? "es" : ""} seleccionado{range.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Income banner */}
      <div style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 12,
        padding: "14px 20px", marginBottom: 16, color: "#fff", display: "flex", gap: 20, flexWrap: "wrap",
        alignItems: "center" }}>
        {incomeSources.length === 0 ? (
          <span style={{ fontSize: 13, opacity: 0.8 }}>
            Sin ingresos configurados — agregalos en Configuración.
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
              <div style={{ fontSize: 11, opacity: 0.8 }}>Total Ingresos Mensuales</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(currentIncomeTotal)}</div>
            </div>
          </>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi title="Total Ingresos" value={fmt(totals.ingresos)} color="#6366f1" />
        <Kpi title="Total Egresos" value={fmt(totals.gastos)} color="#ef4444" />
        <Kpi title="Disponible" value={fmt(totals.libre)} color={totals.libre >= 0 ? "#10b981" : "#ef4444"}
          tag={totals.libre >= 0
            ? { bg: "#d1fae5", fg: "#065f46", text: "Positivo" }
            : { bg: "#fee2e2", fg: "#991b1b", text: "Déficit" }} />
      </div>

      {/* Charts */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: 2, minWidth: 320, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Resumen Mensual</h3>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={rangeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="ingresos" name="Ingresos" fill="#c7d2fe" stroke="#6366f1" />
              <Bar dataKey="gastos" name="Egresos" fill="#f87171" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="libre" name="Disponible" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: 1, minWidth: 260, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Por Categoría</h3>
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

      {/* Investment summary */}
      {lastSnap && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>
            Portfolio de Inversiones · {lastSnap.lmes}
          </h3>

          {/* Top KPIs */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <Kpi title="Capital Inicial Total" value={fmt(lastSnap.ti)} color="#6b7280" />
            <Kpi title="Capital Actual Total" value={fmt(lastSnap.tca)} color="#6366f1" />
            <Kpi title="Valor Total Actual" value={fmt(lastSnap.tv)} color="#7c3aed" />
            <Kpi title="Ganancia / Pérdida" value={fmt(lastSnap.tgain)}
              color={lastSnap.tgain >= 0 ? "#10b981" : "#ef4444"}
              tag={lastSnap.tgain >= 0
                ? { bg: "#d1fae5", fg: "#065f46", text: `+${lastSnap.tpct.toFixed(2)}%` }
                : { bg: "#fee2e2", fg: "#991b1b", text: `${lastSnap.tpct.toFixed(2)}%` }} />
          </div>

          {/* Investment cards */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {lastSnap.detail.map((d) => {
              const weight        = lastSnap.tv > 0 ? (d.val / lastSnap.tv) * 100 : 0;
              const gainAmt       = d.val - d.capitalActual;
              const gainPct       = d.capitalActual > 0 ? (gainAmt / d.capitalActual) * 100 : 0;
              const capitalGrowth = d.capitalInicial > 0
                ? ((d.capitalActual - d.capitalInicial) / d.capitalInicial) * 100
                : 0;
              const positive = gainAmt >= 0;
              return (
                <div key={d.id} style={{
                  background: "#f9fafb", borderRadius: 10, padding: "12px 14px",
                  borderLeft: `4px solid ${d.color}`, minWidth: 200, flex: "1 1 200px",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 10 }}>{d.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>Capital inicial</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{fmt(d.capitalInicial)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>Capital actual</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#6366f1" }}>
                        {fmt(d.capitalActual)}
                        {capitalGrowth !== 0 && (
                          <span style={{ fontSize: 10, marginLeft: 4, color: capitalGrowth >= 0 ? "#10b981" : "#ef4444" }}>
                            ({capitalGrowth >= 0 ? "+" : ""}{capitalGrowth.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>Valor actual</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{fmt(d.val)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>% en portafolio</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#7c3aed" }}>{weight.toFixed(1)}%</div>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>Ganancia / Pérdida</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: positive ? "#10b981" : "#ef4444" }}>
                        {positive ? "+" : ""}{fmt(gainAmt)}
                        <span style={{ fontSize: 11, marginLeft: 6, fontWeight: 600 }}>
                          ({positive ? "+" : ""}{gainPct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
