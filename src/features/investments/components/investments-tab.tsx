"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  useInvestments,
  useInvestmentSnapshots,
  useInvestmentTypes,
  useAddInvestment,
  useRemoveInvestment,
  useUpsertSnapshot,
} from "@/hooks/use-finance-data";
import { useDashboardStore } from "@/stores/dashboard-store";
import { MONTHS } from "@/lib/constants";
import { fmt, gainPc } from "@/lib/formatters";
import Badge from "@/components/ui/badge";
import EditableCell from "@/components/ui/editable-cell";

export default function InvestmentsTab() {
  const { year, setYear, investmentMonth, setInvestmentMonth } = useDashboardStore();

  const { data: dbInvestments = [] } = useInvestments();
  const { data: investmentTypes = [] } = useInvestmentTypes();
  const { data: dbSnapshots = [] } = useInvestmentSnapshots("all");
  const addInvMut = useAddInvestment();
  const removeInvMut = useRemoveInvestment();
  const upsertSnap = useUpsertSnapshot();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [newInv, setNewInv] = useState({ name: "", typeId: "", invested: 0, color: "#6366f1" });

  // Hidden lines — empty set means everything is visible
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const toggleLine = (key: string) =>
    setHiddenLines((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Transform investments
  const invs = useMemo(
    () => dbInvestments.map((inv) => ({
      id: inv.id, name: inv.name, type: inv.type?.name || "Sin Tipo",
      color: inv.color, invested: inv.investedCapital,
    })),
    [dbInvestments]
  );

  const currentDate = new Date();
  const defStart = `${currentDate.getFullYear() - 1}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  const defEnd = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

  const [chartFrom, setChartFrom] = useState(defStart);
  const [chartTo, setChartTo] = useState(defEnd);

  // Transform snapshots: { absMonth: { invId: { value, contrib } } }
  const snaps = useMemo(() => {
    const map: Record<number, Record<string, { value: number; contrib: number }>> = {};
    dbSnapshots.forEach((s) => {
      const abs = s.year * 12 + s.month;
      if (!map[abs]) map[abs] = {};
      map[abs][s.investmentId] = { value: s.currentValue, contrib: s.contribution };
    });
    return map;
  }, [dbSnapshots]);

  // Find start abs month for each investment
  const invStarts = useMemo(() => {
    const starts: Record<string, number> = {};
    invs.forEach((inv) => {
      let minAbs = Infinity;
      Object.keys(snaps).map(Number).forEach((abs) => {
        if (snaps[abs]?.[inv.id]) {
          minAbs = Math.min(minAbs, abs);
        }
      });
      starts[inv.id] = minAbs === Infinity ? 0 : minAbs;
    });
    return starts;
  }, [snaps, invs]);

  // Compute Cumulative Invested up to absolute month
  const getCumulativeInvested = (inv: typeof invs[0], absMi: number) => {
    let sum = 0;
    const start = invStarts[inv.id] || 0;
    for (let i = start; i <= absMi; i++) {
      sum += snaps[i]?.[inv.id]?.contrib ?? 0;
    }
    return inv.invested + sum;
  };

  // Last known value before absolute month
  const lastKnown = (invId: string, absMi: number) => {
    for (let i = absMi; i >= absMi - 120; i--) {
      const v = snaps[i]?.[invId]?.value;
      if (v) return v;
    }
    return invs.find((x) => x.id === invId)?.invested ?? 0;
  };

  const tableAbsMonth = year * 12 + investmentMonth;

  // Save snapshot
  const setSnap = (y: number, m: number, invId: string, field: "value" | "contrib", val: number) => {
    const abs = y * 12 + m;
    const existing = snaps[abs]?.[invId] || { value: 0, contrib: 0 };
    upsertSnap.mutate({
      investmentId: invId,
      month: m,
      year: y,
      currentValue: field === "value" ? val : existing.value,
      contribution: field === "contrib" ? val : existing.contrib,
    });
  };

  // Add new investment
  const addNewInv = () => {
    if (!newInv.name || !newInv.typeId) return;
    addInvMut.mutate({
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
      invs.forEach((inv) => {
        if (i >= (invStarts[inv.id] || 0)) {
          tv += snaps[i]?.[inv.id]?.value ?? lastKnown(inv.id, i);
          ti += getCumulativeInvested(inv, i);
        }
      });
      const m = i % 12;
      const y = Math.floor(i / 12);
      const row: Record<string, number | string> = {
        mes: `${MONTHS[m]} ${y}`,
        "Total Value": tv,
        Invested: ti,
        Gain: tv - ti,
      };
      invs.forEach((inv) => {
        if (i >= (invStarts[inv.id] || 0)) {
          row[inv.id] = snaps[i]?.[inv.id]?.value ?? 0;
        }
      });
      data.push(row);
    }
    return data;
  }, [snaps, invs, chartFrom, chartTo]);

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
          background: "#7c3aed", color: "#fff", fontWeight: 600, fontSize: 12,
        }}>
          + Add Investment
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Año:</label>
          <select value={year} onChange={(e) => setYear(+e.target.value)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginLeft: 8 }}>Mes:</label>
          <select value={investmentMonth} onChange={(e) => setInvestmentMonth(+e.target.value)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{
          background: "#fff", borderRadius: 10, padding: 14, marginBottom: 12,
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", boxShadow: "0 1px 4px #0001"
        }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280" }}>Name</label>
            <input value={newInv.name} onChange={(e) => setNewInv((p) => ({ ...p, name: e.target.value }))}
              style={{ display: "block", padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 180 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280" }}>Type</label>
            <select value={newInv.typeId} onChange={(e) => setNewInv((p) => ({ ...p, typeId: e.target.value }))}
              style={{ display: "block", padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 140 }}>
              <option value="">Select...</option>
              {investmentTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280" }}>Invested Capital</label>
            <input type="number" value={newInv.invested || ""} onChange={(e) => setNewInv((p) => ({ ...p, invested: +e.target.value }))}
              style={{ display: "block", padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 130 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280" }}>Color</label>
            <input type="color" value={newInv.color} onChange={(e) => setNewInv((p) => ({ ...p, color: e.target.value }))}
              style={{ display: "block", width: 40, height: 28, border: "none", cursor: "pointer" }} />
          </div>
          <button onClick={addNewInv} style={{
            padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#7c3aed", color: "#fff", fontWeight: 600, fontSize: 12,
          }}>
            Save
          </button>
        </div>
      )}

      {/* Snapshot table */}
      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <table style={{
          width: "100%", borderCollapse: "collapse", background: "#fff",
          borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px #0001", fontSize: 12
        }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Investment</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Invested</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#7c3aed" }}>
                Value ({MONTHS[investmentMonth]})
              </th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#7c3aed" }}>
                Contribution ({MONTHS[investmentMonth]})
              </th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Gain/Loss</th>
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {invs.filter((inv) => tableAbsMonth >= (invStarts[inv.id] || 0)).map((inv) => {
              const snapVal = snaps[tableAbsMonth]?.[inv.id]?.value ?? 0;
              const snapContr = snaps[tableAbsMonth]?.[inv.id]?.contrib ?? 0;
              const curVal = snapVal || lastKnown(inv.id, tableAbsMonth);
              const cumulativeInv = getCumulativeInvested(inv, tableAbsMonth);
              const gain = curVal - cumulativeInv;
              return (
                <tr key={inv.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "6px 10px" }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: 2, background: inv.color,
                      display: "inline-block", marginRight: 6
                    }} />
                    {inv.name}
                    <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 6 }}>{inv.type}</span>
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: "#9ca3af" }}>{fmt(cumulativeInv)}</td>
                  <td style={{ padding: "4px 4px", textAlign: "right" }}>
                    <EditableCell value={snapVal} edited={!!snaps[tableAbsMonth]?.[inv.id]}
                      onChange={(v) => setSnap(year, investmentMonth, inv.id, "value", v)} />
                  </td>
                  <td style={{ padding: "4px 4px", textAlign: "right" }}>
                    <EditableCell value={snapContr} edited={snapContr > 0}
                      onChange={(v) => setSnap(year, investmentMonth, inv.id, "contrib", v)} />
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>
                    <span style={{ color: gain >= 0 ? "#059669" : "#dc2626", fontWeight: 700 }}>{fmt(gain)}</span>
                    <span style={{ marginLeft: 4 }}><Badge val={gainPc(curVal, cumulativeInv)} /></span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button onClick={() => removeInvMut.mutate(inv.id)} title="Remove"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 14 }}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Portfolio Evolution chart */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" }}>
        {/* Header + date range */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Portfolio Evolution</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Desde:</label>
              <input type="month" value={chartFrom} onChange={(e) => setChartFrom(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Hasta:</label>
              <input type="month" value={chartTo} onChange={(e) => setChartTo(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
            </div>
          </div>
        </div>

        {/* Line toggles */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {[
            { key: "Total Value", name: "Valor Total", color: "#7c3aed" },
            { key: "Invested",    name: "Invertido",   color: "#9ca3af" },
            ...invs.map((inv) => ({ key: inv.id, name: inv.name, color: inv.color })),
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

        {chartData.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "32px 0" }}>
            Sin datos en el rango seleccionado.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(Number(v) / 1e6).toFixed(1)}M`} />
              <Tooltip formatter={(v: unknown) => fmt(Number(v))} />
              <Line type="monotone" dataKey="Total Value" name="Valor Total"
                stroke="#7c3aed" strokeWidth={2} dot={{ r: 2 }}
                hide={hiddenLines.has("Total Value")} />
              <Line type="monotone" dataKey="Invested" name="Invertido"
                stroke="#9ca3af" strokeDasharray="5 5" strokeWidth={2} dot={{ r: 2 }}
                hide={hiddenLines.has("Invested")} />
              {invs.map((inv) => (
                <Line key={inv.id} type="monotone" dataKey={inv.id} name={inv.name}
                  stroke={inv.color} strokeWidth={1.5} dot={{ r: 2 }}
                  hide={hiddenLines.has(inv.id)} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  );
}
