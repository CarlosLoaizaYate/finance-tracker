#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# Finance Tracker — Modular Dashboard Refactor
# Run from project root: bash refactor-dashboard.sh
# ═══════════════════════════════════════════════════════════════════════

set -e

echo "📁 Creating directory structure..."
mkdir -p src/lib
mkdir -p src/components/ui
mkdir -p src/stores
mkdir -p src/features/summary/components
mkdir -p src/features/expenses/components
mkdir -p src/features/investments/components

# ═══════════════════════════════════════════════════════════════════════
# 1. SHARED: Constants
# ═══════════════════════════════════════════════════════════════════════
echo "📦 Creating shared constants..."

cat > src/lib/constants.ts << 'ENDFILE'
export const MONTHS = [
  "Ene","Feb","Mar","Abr","May","Jun",
  "Jul","Ago","Sep","Oct","Nov","Dic",
];

export const INCOME = {
  salarioBase: 5500000,
  deducciones: 500000,
  salario: 5000000,
  arriendo: 1000000,
};

export const INCOME_TOTAL = INCOME.salario + INCOME.arriendo;

export const CAT_LABELS: Record<string, { label: string; color: string }> = {
  streaming: { label: "Streaming",    color: "#ec4899" },
  telefonia: { label: "Telefonía",    color: "#3b82f6" },
  vivienda:  { label: "Vivienda",     color: "#6366f1" },
  credito:   { label: "Crédito / TC", color: "#ef4444" },
  salud:     { label: "Salud",        color: "#10b981" },
  seguros:   { label: "Seguros",      color: "#f97316" },
  salidas:   { label: "Salidas",      color: "#f59e0b" },
};

export const DEFAULT_YEAR = 2025;
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# 2. SHARED: Formatters / Helpers
# ═══════════════════════════════════════════════════════════════════════
echo "🔧 Creating formatters..."

cat > src/lib/formatters.ts << 'ENDFILE'
/** Format a number as COP currency string */
export const fmt = (n: number): string =>
  "$" + Math.round(n).toLocaleString("es-CO");

/** Parse a string into a number, stripping non-digit characters */
export const parse = (s: string): number => {
  const n = parseInt(String(s).replace(/\D/g, ""), 10);
  return isNaN(n) ? 0 : n;
};

/** Calculate gain/loss percentage */
export const gainPc = (value: number, invested: number): number =>
  invested === 0 ? 0 : ((value - invested) / invested) * 100;
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# 3. SHARED: Reusable UI Components
# ═══════════════════════════════════════════════════════════════════════
echo "🎨 Creating UI components..."

cat > src/components/ui/badge.tsx << 'ENDFILE'
"use client";

interface BadgeProps {
  val: number;
}

export default function Badge({ val }: BadgeProps) {
  return (
    <span
      style={{
        background: val > 0 ? "#d1fae5" : val < 0 ? "#fee2e2" : "#f3f4f6",
        color: val > 0 ? "#065f46" : val < 0 ? "#991b1b" : "#6b7280",
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {val > 0 ? "+" : ""}
      {val.toFixed(2)}%
    </span>
  );
}
ENDFILE

cat > src/components/ui/kpi.tsx << 'ENDFILE'
"use client";

interface KpiTag {
  bg: string;
  fg: string;
  text: string;
}

interface KpiProps {
  title: string;
  value: string;
  sub?: string;
  color: string;
  tag?: KpiTag;
}

export default function Kpi({ title, value, sub, color, tag }: KpiProps) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "16px 20px",
        boxShadow: "0 1px 6px #0001",
        borderLeft: `4px solid ${color}`,
        minWidth: 140,
        flex: 1,
        position: "relative",
      }}
    >
      {tag && (
        <span
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            background: tag.bg,
            color: tag.fg,
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 6,
            padding: "2px 7px",
          }}
        >
          {tag.text}
        </span>
      )}
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
ENDFILE

cat > src/components/ui/editable-cell.tsx << 'ENDFILE'
"use client";

import { useState, useRef } from "react";
import { fmt, parse } from "@/lib/formatters";

interface EditableCellProps {
  value: number;
  onChange: (v: number) => void;
  edited: boolean;
}

export default function EditableCell({ value, onChange, edited }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    setText(value > 0 ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const done = () => {
    onChange(parse(text));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === "Enter") done();
          if (e.key === "Escape") setEditing(false);
        }}
        style={{
          width: 110,
          padding: "3px 6px",
          borderRadius: 6,
          border: "2px solid #6366f1",
          fontSize: 12,
          textAlign: "right",
          outline: "none",
        }}
      />
    );
  }

  return (
    <span
      onClick={start}
      title="Click to edit"
      style={{
        cursor: "text",
        padding: "3px 8px",
        borderRadius: 6,
        background: edited ? "#ede9fe" : "#f9fafb",
        color: edited ? "#4f46e5" : "#9ca3af",
        fontWeight: edited ? 700 : 400,
        fontSize: 12,
        display: "inline-block",
        minWidth: 90,
        textAlign: "right",
        border: "1px dashed",
        borderColor: edited ? "#a5b4fc" : "#e5e7eb",
      }}
    >
      {value > 0 ? fmt(value) : "—"}
    </span>
  );
}
ENDFILE

cat > src/components/ui/tab-button.tsx << 'ENDFILE'
"use client";

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export default function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 16px",
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        background: active ? "#6366f1" : "#f3f4f6",
        color: active ? "#fff" : "#374151",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# 4. Zustand Store — Dashboard UI State
# ═══════════════════════════════════════════════════════════════════════
echo "🗃️  Creating Zustand store..."

cat > src/stores/dashboard-store.ts << 'ENDFILE'
import { create } from "zustand";

export type TabName = "summary" | "expenses" | "investments";

interface DashboardState {
  // Current tab
  tab: TabName;
  setTab: (tab: TabName) => void;

  // Year
  year: number;
  setYear: (year: number) => void;

  // Month range (for summary & expenses)
  monthFrom: number;
  monthTo: number;
  setMonthFrom: (m: number) => void;
  setMonthTo: (m: number) => void;

  // Active month in investments tab
  investmentMonth: number;
  setInvestmentMonth: (m: number) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  tab: "summary",
  setTab: (tab) => set({ tab }),

  year: 2025,
  setYear: (year) => set({ year }),

  monthFrom: 3, // April
  monthTo: 11,   // December
  setMonthFrom: (monthFrom) => set({ monthFrom }),
  setMonthTo: (monthTo) => set({ monthTo }),

  investmentMonth: 2, // March
  setInvestmentMonth: (investmentMonth) => set({ investmentMonth }),
}));
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# 5. FEATURE: Investments Tab
# ═══════════════════════════════════════════════════════════════════════
echo "📈 Creating Investments tab..."

cat > src/features/investments/components/investments-tab.tsx << 'ENDFILE'
"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  useInvestments,
  useInvestmentSnapshots,
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
  const { year, investmentMonth, setInvestmentMonth } = useDashboardStore();

  const { data: dbInvestments = [] } = useInvestments();
  const { data: dbSnapshots = [] } = useInvestmentSnapshots(year);
  const addInvMut = useAddInvestment();
  const removeInvMut = useRemoveInvestment();
  const upsertSnap = useUpsertSnapshot();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [newInv, setNewInv] = useState({ name: "", type: "", invested: 0, color: "#6366f1" });

  // Transform investments
  const invs = useMemo(
    () => dbInvestments.map((inv) => ({
      id: inv.id, name: inv.name, type: inv.type,
      color: inv.color, invested: inv.investedCapital,
    })),
    [dbInvestments]
  );

  // Transform snapshots: { month: { invId: { value, contrib } } }
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

  // Last known value before month
  const lastKnown = (invId: string, mi: number) => {
    for (let i = mi; i >= 0; i--) {
      const v = snaps[i]?.[invId]?.value;
      if (v) return v;
    }
    return invs.find((x) => x.id === invId)?.invested ?? 0;
  };

  // Save snapshot
  const setSnap = (mi: number, invId: string, field: "value" | "contrib", val: number) => {
    const existing = snaps[mi]?.[invId] || { value: 0, contrib: 0 };
    upsertSnap.mutate({
      investmentId: invId,
      month: mi,
      year,
      currentValue: field === "value" ? val : existing.value,
      contribution: field === "contrib" ? val : existing.contrib,
    });
  };

  // Add new investment
  const addNewInv = () => {
    if (!newInv.name) return;
    addInvMut.mutate({
      name: newInv.name,
      type: newInv.type,
      color: newInv.color,
      investedCapital: +newInv.invested || 0,
    });
    setShowForm(false);
    setNewInv({ name: "", type: "", invested: 0, color: "#6366f1" });
  };

  // Chart data
  const chartData = useMemo(() => {
    if (snapMonths.length < 1) return [];
    return snapMonths.map((mi) => {
      let tv = 0, ti = 0;
      invs.forEach((inv) => {
        tv += snaps[mi]?.[inv.id]?.value ?? lastKnown(inv.id, mi);
        ti += inv.invested;
      });
      const row: Record<string, number | string> = {
        mes: MONTHS[mi], "Total Value": tv, "Invested": ti,
      };
      invs.forEach((inv) => { row[inv.id] = snaps[mi]?.[inv.id]?.value ?? 0; });
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaps, invs, snapMonths]);

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
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Month:</label>
          <select value={investmentMonth} onChange={(e) => setInvestmentMonth(+e.target.value)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ background: "#fff", borderRadius: 10, padding: 14, marginBottom: 12,
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", boxShadow: "0 1px 4px #0001" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280" }}>Name</label>
            <input value={newInv.name} onChange={(e) => setNewInv((p) => ({ ...p, name: e.target.value }))}
              style={{ display: "block", padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 180 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280" }}>Type</label>
            <input value={newInv.type} onChange={(e) => setNewInv((p) => ({ ...p, type: e.target.value }))}
              style={{ display: "block", padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 140 }} />
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
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff",
          borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px #0001", fontSize: 12 }}>
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
            {invs.map((inv) => {
              const snapVal = snaps[investmentMonth]?.[inv.id]?.value ?? 0;
              const snapContr = snaps[investmentMonth]?.[inv.id]?.contrib ?? 0;
              const curVal = snapVal || lastKnown(inv.id, investmentMonth);
              const gain = curVal - inv.invested;
              return (
                <tr key={inv.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "6px 10px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: inv.color,
                      display: "inline-block", marginRight: 6 }} />
                    {inv.name}
                    <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 6 }}>{inv.type}</span>
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: "#9ca3af" }}>{fmt(inv.invested)}</td>
                  <td style={{ padding: "4px 4px", textAlign: "right" }}>
                    <EditableCell value={snapVal} edited={!!snaps[investmentMonth]?.[inv.id]}
                      onChange={(v) => setSnap(investmentMonth, inv.id, "value", v)} />
                  </td>
                  <td style={{ padding: "4px 4px", textAlign: "right" }}>
                    <EditableCell value={snapContr} edited={snapContr > 0}
                      onChange={(v) => setSnap(investmentMonth, inv.id, "contrib", v)} />
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>
                    <span style={{ color: gain >= 0 ? "#059669" : "#dc2626", fontWeight: 700 }}>{fmt(gain)}</span>
                    <span style={{ marginLeft: 4 }}><Badge val={gainPc(curVal, inv.invested)} /></span>
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

      {/* Evolution chart */}
      {chartData.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Portfolio Evolution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(Number(v) / 1e6).toFixed(1)}M`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Total Value" stroke="#7c3aed" strokeWidth={2} />
              <Line type="monotone" dataKey="Invested" stroke="#9ca3af" strokeDasharray="5 5" />
              {invs.map((inv) => (
                <Line key={inv.id} type="monotone" dataKey={inv.id} name={inv.name}
                  stroke={inv.color} strokeWidth={1.5} dot={{ r: 2 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# 6. FEATURE: Expenses Tab
# ═══════════════════════════════════════════════════════════════════════
echo "💸 Creating Expenses tab..."

cat > src/features/expenses/components/expenses-tab.tsx << 'ENDFILE'
"use client";

import { useState, useMemo } from "react";
import {
  useCategories,
  useExpenseItems,
  useExpenseRecords,
  useAddExpenseItem,
  useRemoveExpenseItem,
  useUpsertExpenseRecord,
} from "@/hooks/use-finance-data";
import { useDashboardStore } from "@/stores/dashboard-store";
import { MONTHS, CAT_LABELS, INCOME_TOTAL } from "@/lib/constants";
import { fmt } from "@/lib/formatters";
import EditableCell from "@/components/ui/editable-cell";

export default function ExpensesTab() {
  const { year, monthFrom, monthTo } = useDashboardStore();

  const { data: categories = [] } = useCategories();
  const { data: dbItems = [] } = useExpenseItems();
  const { data: dbRecords = [] } = useExpenseRecords(year);
  const addItemMut = useAddExpenseItem();
  const removeItemMut = useRemoveExpenseItem();
  const upsertRecord = useUpsertExpenseRecord();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [newExp, setNewExp] = useState({ name: "", cat: "salidas", budget: 0 });

  // Category map (name -> id)
  const catMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => { map[c.name] = c.id; });
    return map;
  }, [categories]);

  // Transform items
  const items = useMemo(
    () => dbItems.map((it) => ({
      id: it.id, name: it.name,
      cat: it.category?.name || "salidas",
      budget: it.monthlyBudget,
    })),
    [dbItems]
  );

  // Transform records: { month: { itemId: value } }
  const gastos = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    dbRecords.forEach((r) => {
      if (!map[r.month]) map[r.month] = {};
      map[r.month][r.itemId] = r.realValue;
    });
    return map;
  }, [dbRecords]);

  // Month range
  const range = useMemo(() => {
    const a = []; for (let i = monthFrom; i <= monthTo; i++) a.push(i); return a;
  }, [monthFrom, monthTo]);

  // Group items by category
  const catGroups = useMemo(() => {
    const g: Record<string, typeof items> = {};
    items.forEach((it) => { (g[it.cat] || (g[it.cat] = [])).push(it); });
    return g;
  }, [items]);

  const budgetTotal = items.reduce((s, it) => s + it.budget, 0);

  // Accessors
  const getReal = (mi: number, id: string) =>
    gastos[mi]?.[id] ?? items.find((x) => x.id === id)?.budget ?? 0;
  const isEdited = (mi: number, id: string) => gastos[mi]?.[id] !== undefined;

  const setReal = (mi: number, id: string, v: number) => {
    upsertRecord.mutate({ itemId: id, month: mi, year, realValue: v });
  };

  const addNewExp = () => {
    if (!newExp.name || !newExp.budget) return;
    const catId = catMap[newExp.cat];
    if (!catId) return;
    addItemMut.mutate({ name: newExp.name, monthlyBudget: +newExp.budget, categoryId: catId });
    setShowForm(false);
    setNewExp({ name: "", cat: "salidas", budget: 0 });
  };

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
          background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 12,
        }}>
          + Add Expense
        </button>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          Monthly budget: {fmt(budgetTotal)} / Income: {fmt(INCOME_TOTAL)}
        </span>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ background: "#fff", borderRadius: 10, padding: 14, marginBottom: 12,
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", boxShadow: "0 1px 4px #0001" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280" }}>Name</label>
            <input value={newExp.name} onChange={(e) => setNewExp((p) => ({ ...p, name: e.target.value }))}
              style={{ display: "block", padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 150 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280" }}>Category</label>
            <select value={newExp.cat} onChange={(e) => setNewExp((p) => ({ ...p, cat: e.target.value }))}
              style={{ display: "block", padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
              {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280" }}>Budget</label>
            <input type="number" value={newExp.budget || ""} onChange={(e) => setNewExp((p) => ({ ...p, budget: +e.target.value }))}
              style={{ display: "block", padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 120 }} />
          </div>
          <button onClick={addNewExp} style={{
            padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 12,
          }}>
            Save
          </button>
        </div>
      )}

      {/* Expense tables by category */}
      {Object.entries(catGroups).map(([catKey, catItems]) => (
        <div key={catKey} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3,
              background: CAT_LABELS[catKey]?.color || "#6b7280" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
              {CAT_LABELS[catKey]?.label || catKey}
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff",
              borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px #0001", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Item</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Budget</th>
                  {range.map((mi) => (
                    <th key={mi} style={{ textAlign: "right", padding: "8px 6px", fontWeight: 600, color: "#6366f1" }}>
                      {MONTHS[mi]}
                    </th>
                  ))}
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {catItems.map((it) => (
                  <tr key={it.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 10px", color: "#374151" }}>{it.name}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#9ca3af" }}>{fmt(it.budget)}</td>
                    {range.map((mi) => (
                      <td key={mi} style={{ padding: "4px 4px", textAlign: "right" }}>
                        <EditableCell value={getReal(mi, it.id)} edited={isEdited(mi, it.id)}
                          onChange={(v) => setReal(mi, it.id, v)} />
                      </td>
                    ))}
                    <td style={{ textAlign: "center" }}>
                      <button onClick={() => removeItemMut.mutate(it.id)} title="Remove"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 14 }}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# 7. FEATURE: Summary Tab
# ═══════════════════════════════════════════════════════════════════════
echo "📊 Creating Summary tab..."

cat > src/features/summary/components/summary-tab.tsx << 'ENDFILE'
"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart, Area, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  useExpenseItems,
  useExpenseRecords,
  useInvestments,
  useInvestmentSnapshots,
} from "@/hooks/use-finance-data";
import { useDashboardStore } from "@/stores/dashboard-store";
import { MONTHS, INCOME, INCOME_TOTAL, CAT_LABELS } from "@/lib/constants";
import { fmt, gainPc } from "@/lib/formatters";
import Kpi from "@/components/ui/kpi";
import Badge from "@/components/ui/badge";

export default function SummaryTab() {
  const { year, monthFrom, monthTo, setMonthFrom, setMonthTo } = useDashboardStore();

  const { data: dbItems = [] } = useExpenseItems();
  const { data: dbRecords = [] } = useExpenseRecords(year);
  const { data: dbInvestments = [] } = useInvestments();
  const { data: dbSnapshots = [] } = useInvestmentSnapshots(year);

  // Local income overrides (will be DB-driven later)
  const [ingrs, setIngrs] = useState<Record<number, Record<string, number>>>({});

  // Transform items
  const items = useMemo(
    () => dbItems.map((it) => ({
      id: it.id, name: it.name,
      cat: it.category?.name || "salidas",
      budget: it.monthlyBudget,
    })),
    [dbItems]
  );

  // Transform records
  const gastos = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    dbRecords.forEach((r) => {
      if (!map[r.month]) map[r.month] = {};
      map[r.month][r.itemId] = r.realValue;
    });
    return map;
  }, [dbRecords]);

  // Transform investments
  const invs = useMemo(
    () => dbInvestments.map((inv) => ({
      id: inv.id, name: inv.name, type: inv.type,
      color: inv.color, invested: inv.investedCapital,
    })),
    [dbInvestments]
  );

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

  // Accessors
  const getInc = (mi: number) => ({ ...INCOME, ...(ingrs[mi] || {}) });
  const getReal = (mi: number, id: string) =>
    gastos[mi]?.[id] ?? items.find((x) => x.id === id)?.budget ?? 0;

  // Range
  const range = useMemo(() => {
    const a = []; for (let i = monthFrom; i <= monthTo; i++) a.push(i); return a;
  }, [monthFrom, monthTo]);

  const budgetTotal = items.reduce((s, it) => s + it.budget, 0);

  // Computed data
  const rangeData = useMemo(
    () =>
      range.map((mi) => {
        const inc = getInc(mi);
        const ingt = inc.salario + inc.arriendo;
        const catT: Record<string, number> = {};
        Object.keys(CAT_LABELS).forEach((c) => { catT[c] = 0; });
        items.forEach((it) => { catT[it.cat] = (catT[it.cat] || 0) + getReal(mi, it.id); });
        const gast = Object.values(catT).reduce((s, v) => s + v, 0);
        return { mes: MONTHS[mi], mi, ...catT, ingresos: ingt, gastos: gast, libre: ingt - gast };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range, gastos, ingrs, items]
  );

  const totals = useMemo(() => {
    const t = { ingresos: 0, gastos: 0, libre: 0 };
    rangeData.forEach((d) => { t.ingresos += d.ingresos; t.gastos += d.gastos; t.libre += d.libre; });
    return t;
  }, [rangeData]);

  const pieData = useMemo(
    () =>
      Object.entries(CAT_LABELS)
        .map(([k, v]) => ({
          name: v.label, color: v.color,
          value: rangeData.reduce((s, d) => s + ((d as Record<string, number>)[k] || 0), 0),
        }))
        .filter((x) => x.value > 0)
        .sort((a, b) => b.value - a.value),
    [rangeData]
  );

  // Investment summary (last snapshot)
  const lastSnap = useMemo(() => {
    const lm = snapMonths.at(-1);
    if (lm === undefined) return null;
    let tv = 0, ti = 0;
    const detail = invs.map((inv) => {
      const s = snaps[lm]?.[inv.id];
      const val = s?.value ?? inv.invested;
      tv += val;
      ti += inv.invested;
      return { ...inv, val, contrib: s?.contrib ?? 0, gain: val - inv.invested, pct: gainPc(val, inv.invested) };
    });
    return { detail, tv, ti, tgain: tv - ti, tpct: gainPc(tv, ti), lmes: MONTHS[lm] };
  }, [snaps, invs, snapMonths]);

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
        padding: "14px 20px", marginBottom: 16, color: "#fff", display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 11, opacity: 0.8 }}>Gross Salary</div><div style={{ fontSize: 17, fontWeight: 700 }}>{fmt(INCOME.salarioBase)}</div></div>
        <div><div style={{ fontSize: 11, opacity: 0.8 }}>Deductions</div><div style={{ fontSize: 17, fontWeight: 700 }}>-{fmt(INCOME.deducciones)}</div></div>
        <div><div style={{ fontSize: 11, opacity: 0.8 }}>Net Salary</div><div style={{ fontSize: 17, fontWeight: 700 }}>{fmt(INCOME.salario)}</div></div>
        <div><div style={{ fontSize: 11, opacity: 0.8 }}>Rent Income</div><div style={{ fontSize: 17, fontWeight: 700 }}>{fmt(INCOME.arriendo)}</div></div>
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.3)", paddingLeft: 20 }}>
          <div style={{ fontSize: 11, opacity: 0.8 }}>Total Monthly Income</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(INCOME_TOTAL)}</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi title="Total Income" value={fmt(totals.ingresos)} color="#6366f1" />
        <Kpi title="Total Expenses" value={fmt(totals.gastos)} color="#ef4444"
          sub={`Budget: ${fmt(budgetTotal * range.length)}`} />
        <Kpi title="Available" value={fmt(totals.libre)} color={totals.libre >= 0 ? "#10b981" : "#ef4444"}
          tag={totals.libre >= 0
            ? { bg: "#d1fae5", fg: "#065f46", text: "Positive" }
            : { bg: "#fee2e2", fg: "#991b1b", text: "Deficit" }} />
      </div>

      {/* Charts */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: 2, minWidth: 320, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Monthly Overview</h3>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={rangeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
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
              <Tooltip formatter={(v: number) => fmt(v)} />
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
            Investment Portfolio · {lastSnap.lmes}
          </h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <Kpi title="Total Value" value={fmt(lastSnap.tv)} color="#7c3aed" />
            <Kpi title="Total Invested" value={fmt(lastSnap.ti)} color="#6b7280" />
            <Kpi title="Gain/Loss" value={fmt(lastSnap.tgain)} color={lastSnap.tgain >= 0 ? "#10b981" : "#ef4444"}
              tag={lastSnap.tgain >= 0
                ? { bg: "#d1fae5", fg: "#065f46", text: `+${lastSnap.tpct.toFixed(2)}%` }
                : { bg: "#fee2e2", fg: "#991b1b", text: `${lastSnap.tpct.toFixed(2)}%` }} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {lastSnap.detail.map((d) => (
              <div key={d.id} style={{ background: "#f9fafb", borderRadius: 8, padding: "8px 12px",
                borderLeft: `3px solid ${d.color}`, minWidth: 150 }}>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{d.name}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(d.val)}</div>
                <Badge val={d.pct} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# 8. DASHBOARD: Page that assembles everything
# ═══════════════════════════════════════════════════════════════════════
echo "🏠 Creating Dashboard page..."

cat > src/app/dashboard/page.tsx << 'ENDFILE'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useDashboardStore } from "@/stores/dashboard-store";
import {
  useExpenseItems,
  useInvestments,
  useSeedData,
} from "@/hooks/use-finance-data";
import TabButton from "@/components/ui/tab-button";
import SummaryTab from "@/features/summary/components/summary-tab";
import ExpensesTab from "@/features/expenses/components/expenses-tab";
import InvestmentsTab from "@/features/investments/components/investments-tab";

export default function DashboardPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { tab, setTab } = useDashboardStore();

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/login");
      else setAuthenticated(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authenticated) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#f3f4f6" }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  return <DashboardContent />;
}

function DashboardContent() {
  const { tab, setTab, year } = useDashboardStore();
  const { data: items = [], isLoading: itemsLoading } = useExpenseItems();
  const { data: investments = [], isLoading: invLoading } = useInvestments();
  const seedMut = useSeedData();

  const isLoading = itemsLoading || invLoading;

  // Loading state
  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#f3f4f6" }}>
        <p style={{ color: "#6b7280" }}>Loading your financial data...</p>
      </div>
    );
  }

  // Seed prompt (no data)
  if (items.length === 0 && investments.length === 0) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#f3f4f6", flexDirection: "column", gap: 16 }}>
        <h2 style={{ color: "#111827", fontWeight: 700 }}>Welcome to Finance Tracker</h2>
        <p style={{ color: "#6b7280", maxWidth: 400, textAlign: "center" }}>
          No data found. Click below to load your initial categories, expenses, and investments.
        </p>
        <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
          style={{ padding: "12px 28px", borderRadius: 10, border: "none", cursor: "pointer",
            background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 15 }}>
          {seedMut.isPending ? "Loading..." : "Load Initial Data"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Segoe UI',sans-serif", background: "#f3f4f6",
      minHeight: "100vh", padding: "24px 20px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111827" }}>
            Finance Tracker
          </h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
            {year} · COP ·
            <span style={{ color: "#6366f1", fontWeight: 600 }}> Click a purple cell to edit</span>
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>
            Summary
          </TabButton>
          <TabButton active={tab === "expenses"} onClick={() => setTab("expenses")}>
            Expenses
          </TabButton>
          <TabButton active={tab === "investments"} onClick={() => setTab("investments")}>
            Investments
          </TabButton>
        </div>

        {/* Tab content */}
        {tab === "summary" && <SummaryTab />}
        {tab === "expenses" && <ExpensesTab />}
        {tab === "investments" && <InvestmentsTab />}
      </div>
    </div>
  );
}
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# Clean up old monolith (optional — keep as backup)
# ═══════════════════════════════════════════════════════════════════════
if [ -f src/features/expenses/components/finance-panel.tsx ]; then
  mv src/features/expenses/components/finance-panel.tsx src/features/expenses/components/finance-panel.tsx.bak
  echo "📦 Backed up old finance-panel.tsx → finance-panel.tsx.bak"
fi

echo ""
echo "✅ Refactor complete! New structure:"
echo ""
echo "  src/"
echo "  ├── lib/"
echo "  │   ├── constants.ts          ← Shared constants (MONTHS, INCOME, etc.)"
echo "  │   └── formatters.ts         ← fmt(), parse(), gainPc()"
echo "  ├── components/ui/"
echo "  │   ├── badge.tsx             ← Gain/loss badge"
echo "  │   ├── kpi.tsx               ← KPI card"
echo "  │   ├── editable-cell.tsx     ← Inline edit cell"
echo "  │   └── tab-button.tsx        ← Tab button"
echo "  ├── stores/"
echo "  │   └── dashboard-store.ts    ← Zustand UI state"
echo "  ├── features/"
echo "  │   ├── summary/components/"
echo "  │   │   └── summary-tab.tsx   ← Summary view"
echo "  │   ├── expenses/components/"
echo "  │   │   └── expenses-tab.tsx  ← Expenses view"
echo "  │   └── investments/components/"
echo "  │       └── investments-tab.tsx ← Investments view"
echo "  └── app/dashboard/"
echo "      └── page.tsx              ← Dashboard (assembles tabs)"
echo ""
echo "👉 Next: npm run build && git add . && git commit && git push"
echo ""