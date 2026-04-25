"use client";

import { useState, useMemo } from "react";
import {
  useCategories,
  useExpenseItems,
  useExpenseRecords,
  useExpenseRecordsRange,
  useUpsertExpenseRecord,
  useDeleteExpenseRecord,
  effectiveBudget,
  type ExpenseItem,
  type ExpenseRecord,
  type Category,
} from "@/hooks/use-finance-data";
import { useDashboardStore } from "@/stores/dashboard-store";
import { MONTHS } from "@/lib/constants";
import { fmt } from "@/lib/formatters";
import EditableCell from "@/components/ui/editable-cell";

// ─── helpers ────────────────────────────────────────────────────────────────

function daysInMonth(month: number, year: number) {
  // month is 0-based
  return new Date(year, month + 1, 0).getDate();
}

// ─── Add-record form ─────────────────────────────────────────────────────────

function AddRecordForm({
  month, year, items, catById, onSave, onCancel,
}: {
  month: number; year: number;
  items: ExpenseItem[];
  catById: Record<string, Category>;
  onSave(itemId: string, day: number, amount: number, comment: string): void;
  onCancel(): void;
}) {
  const maxDay = daysInMonth(month, year);
  const [itemId,  setItemId]  = useState(items[0]?.id ?? "");
  const [day,     setDay]     = useState(new Date().getDate());
  const [amount,  setAmount]  = useState("");
  const [comment, setComment] = useState("");

  const grouped = useMemo(() => {
    const g: Record<string, ExpenseItem[]> = {};
    items.forEach((it) => { (g[it.categoryId] ??= []).push(it); });
    return g;
  }, [items]);

  return (
    <div style={{
      display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
      padding: "10px 14px", background: "#f0f9ff", borderRadius: 8, marginTop: 10,
      border: "1px dashed #a5b4fc",
    }}>
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 }}>Día</label>
        <input
          type="number" min={1} max={maxDay} value={day}
          onChange={(e) => setDay(Math.min(maxDay, Math.max(1, +e.target.value)))}
          style={{ width: 56, padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
        />
      </div>
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 }}>Concepto</label>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, minWidth: 180 }}>
          {Object.entries(grouped).map(([catId, its]) => (
            <optgroup key={catId} label={catById[catId]?.name ?? catId}>
              {its.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 }}>Monto</label>
        <input
          type="number" value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          style={{ width: 120, padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
        />
      </div>
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 }}>Comentario</label>
        <input
          type="text" value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && amount && onSave(itemId, day, +amount, comment)}
          placeholder="Opcional"
          style={{ width: 160, padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
        />
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <button
          onClick={() => onSave(itemId, day, +amount, comment)}
          disabled={!itemId || !amount}
          style={{
            padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
            background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13,
          }}
        >
          Guardar
        </button>
        <button onClick={onCancel}
          style={{
            padding: "5px 10px", borderRadius: 6, border: "1px solid #d1d5db",
            background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13,
          }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Inline editable day cell ────────────────────────────────────────────────

function EditableDay({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (editing) {
    return (
      <input
        autoFocus
        type="number" min={1} max={max} value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { onChange(Math.min(max, Math.max(1, +text || value))); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onChange(Math.min(max, Math.max(1, +text || value))); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        style={{ width: 44, padding: "2px 4px", borderRadius: 5, border: "2px solid #6366f1", fontSize: 13, textAlign: "center", outline: "none" }}
      />
    );
  }
  return (
    <span onClick={() => { setText(String(value)); setEditing(true); }} title="Click para editar"
      style={{ cursor: "text", padding: "3px 8px", borderRadius: 5, background: "#ede9fe",
        color: "#4f46e5", fontWeight: 700, fontSize: 13, display: "inline-block", minWidth: 32, textAlign: "center" }}>
      {value}
    </span>
  );
}

// ─── Inline editable text cell ────────────────────────────────────────────────

function EditableText({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { onChange(text); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onChange(text); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        style={{ width: 160, padding: "2px 6px", borderRadius: 5, border: "2px solid #6366f1", fontSize: 12, outline: "none" }}
      />
    );
  }
  return (
    <span onClick={() => { setText(value); setEditing(true); }} title="Click para editar"
      style={{ cursor: "text", padding: "2px 6px", borderRadius: 5, fontSize: 12,
        color: value ? "#374151" : "#d1d5db", fontStyle: value ? "normal" : "italic",
        display: "inline-block", minWidth: 60 }}>
      {value || placeholder || "—"}
    </span>
  );
}

// ─── Recordatorios (Gastos Importantes) ───────────────────────────────────────

function RemindersSection({
  month, year, items, catById, records
}: { month: number; year: number; items: ExpenseItem[]; catById: Record<string, Category>; records: ExpenseRecord[] }) {
  const upsert = useUpsertExpenseRecord();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  
  const reminders = useMemo(() => items.filter(it => it.isImportant && !records.some(r => r.itemId === it.id)), [items, records]);

  if (reminders.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#9333ea", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 16 }}>🔔</span> Recordatorios Pendientes ({MONTHS[month]})
      </h3>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        {reminders.map(it => {
          const cat = catById[it.categoryId];
          const budgetAmt = effectiveBudget(it, month, year);
          const isPaying = payingId === it.id;
          
          return (
            <div key={it.id} style={{
              background: "#faf5ff", border: "1px dashed #d8b4fe", borderRadius: 10, padding: "12px 16px",
              display: "flex", flexDirection: "column", gap: 10, minWidth: 220,
              boxShadow: "0 2px 8px rgba(147, 51, 234, 0.05)"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {cat && <span style={{ width: 8, height: 8, borderRadius: 2, background: cat.color }} />}
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#4c1d95" }}>{it.name}</span>
                </div>
                {!isPaying && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#a855f7" }}>
                    {fmt(budgetAmt)}
                  </span>
                )}
              </div>
              
              {isPaying ? (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input autoFocus type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="Monto" style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #c084fc", fontSize: 13, outline: "none" }}
                    onKeyDown={e => {
                      if (e.key === "Enter" && amount) {
                        upsert.mutate({ itemId: it.id, day: it.defaultDay ?? 1, month, year, realValue: +amount, comment: "Recordatorio pagado" });
                        setPayingId(null);
                      }
                      if (e.key === "Escape") setPayingId(null);
                    }}
                  />
                  <button onClick={() => {
                      if (amount) {
                        upsert.mutate({ itemId: it.id, day: it.defaultDay ?? 1, month, year, realValue: +amount, comment: "Recordatorio pagado" });
                        setPayingId(null);
                      }
                    }}
                    style={{ background: "#9333ea", color: "#fff", border: "none", borderRadius: 6, padding: "0 10px", cursor: "pointer", fontWeight: 700 }}>✓</button>
                  <button onClick={() => setPayingId(null)}
                    style={{ background: "none", color: "#9ca3af", border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", cursor: "pointer" }}>✕</button>
                </div>
              ) : (
                <button 
                  onClick={() => { setPayingId(it.id); setAmount(String(budgetAmt || "")); }}
                  style={{
                    background: "#9333ea", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px",
                    fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center",
                    transition: "all 0.15s ease"
                  }}
                  onMouseOver={e => e.currentTarget.style.background = "#7e22ce"}
                  onMouseOut={e => e.currentTarget.style.background = "#9333ea"}
                >
                  Registrar Pago
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Active month table (top section) ───────────────────────────────────────

function ActiveMonthTable({
  month, year, items, catById, records,
}: {
  month: number; year: number;
  items: ExpenseItem[];
  catById: Record<string, Category>;
  records: ExpenseRecord[];
}) {
  const upsert = useUpsertExpenseRecord();
  const remove = useDeleteExpenseRecord();
  const [showAdd, setShowAdd] = useState(false);
  const maxDay = daysInMonth(month, year);

  const itemById = useMemo(
    () => Object.fromEntries(items.map((it) => [it.id, it])),
    [items]
  );

  // Sort records by day, then by item name
  const sorted = [...records].sort((a, b) => {
    const dayDiff = a.day - b.day;
    if (dayDiff !== 0) return dayDiff;
    const nameA = itemById[a.itemId]?.name ?? "";
    const nameB = itemById[b.itemId]?.name ?? "";
    return nameA.localeCompare(nameB);
  });

  const monthTotal = records.reduce((s, r) => s + r.realValue, 0);

  const handleAdd = (itemId: string, day: number, amount: number, comment: string) => {
    upsert.mutate({ itemId, day, month, year, realValue: amount, comment });
    setShowAdd(false);
  };

  return (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px #0001", marginBottom: 20, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={{ textAlign: "center", padding: "9px 10px", fontWeight: 600, color: "#6366f1", width: 60 }}>Día</th>
              <th style={{ textAlign: "left",   padding: "9px 12px", fontWeight: 600, color: "#374151" }}>Concepto</th>
              <th style={{ textAlign: "left",   padding: "9px 10px", fontWeight: 600, color: "#374151" }}>Categoría</th>
              <th style={{ textAlign: "left",   padding: "9px 10px", fontWeight: 600, color: "#9ca3af" }}>Comentario</th>
              <th style={{ textAlign: "right",  padding: "9px 10px", fontWeight: 600, color: "#9ca3af" }}>Presupuesto</th>
              <th style={{ textAlign: "right",  padding: "9px 10px", fontWeight: 600, color: "#6366f1" }}>
                Real ({MONTHS[month]})
              </th>
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "18px 14px", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>
                  Sin gastos registrados para {MONTHS[month]} {year}.
                </td>
              </tr>
            )}
            {sorted.map((rec) => {
              const it     = itemById[rec.itemId];
              const budget = it ? effectiveBudget(it, month, year) : 0;
              return (
                <tr key={rec.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ textAlign: "center", padding: "6px 10px" }}>
                    <EditableDay
                      value={rec.day} max={maxDay}
                      onChange={(v) => upsert.mutate({ id: rec.id, day: v })}
                    />
                  </td>
                  <td style={{ padding: "4px 12px" }}>
                    <InlineItemSelect
                      value={rec.itemId}
                      items={items}
                      catById={catById}
                      onChange={(itemId) => upsert.mutate({ id: rec.id, itemId })}
                    />
                  </td>
                  <td style={{ padding: "4px 10px" }}>
                    <InlineCategorySelect
                      categoryId={it?.categoryId ?? ""}
                      catById={catById}
                      items={items}
                      onItemChange={(itemId) => upsert.mutate({ id: rec.id, itemId })}
                    />
                  </td>
                  <td style={{ padding: "4px 10px" }}>
                    <EditableText
                      value={rec.comment}
                      placeholder="agregar nota..."
                      onChange={(v) => upsert.mutate({ id: rec.id, comment: v })}
                    />
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: "#d1d5db", fontSize: 12 }}>
                    {budget > 0 ? fmt(budget) : "—"}
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right" }}>
                    <EditableCell
                      value={rec.realValue}
                      edited
                      onChange={(v) => upsert.mutate({ id: rec.id, realValue: v })}
                    />
                  </td>
                  <td style={{ textAlign: "center", paddingRight: 6 }}>
                    <button
                      onClick={() => remove.mutate(rec.id)}
                      title="Eliminar registro"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 14 }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}

            {sorted.length > 0 && (
              <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f9fafb" }}>
                <td colSpan={5} style={{ padding: "7px 12px", fontWeight: 700, fontSize: 13, color: "#374151" }}>
                  Total {MONTHS[month]}
                </td>
                <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800, fontSize: 14, color: "#111827" }}>
                  {fmt(monthTotal)}
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "10px 14px 14px" }}>
        {showAdd ? (
          <AddRecordForm
            month={month} year={year}
            items={items}
            catById={catById}
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            style={{
              padding: "6px 14px", borderRadius: 7, border: "1px dashed #a5b4fc",
              background: "none", color: "#6366f1", cursor: "pointer", fontSize: 12, fontWeight: 600,
            }}
          >
            + Agregar gasto
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Inline concepto selector ───────────────────────────────────────────────

function InlineItemSelect({
  value, items, catById, onChange,
}: {
  value: string;
  items: ExpenseItem[];
  catById: Record<string, Category>;
  onChange: (itemId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const current = items.find((it) => it.id === value);

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        title="Click para cambiar"
        style={{ cursor: "pointer", padding: "2px 6px", borderRadius: 5,
          color: "#111827", fontWeight: 500, borderBottom: "1px dashed #a5b4fc",
          display: "inline-block" }}
      >
        {current?.name ?? "—"}
      </span>
    );
  }

  const grouped: Record<string, ExpenseItem[]> = {};
  items.forEach((it) => { (grouped[it.categoryId] ??= []).push(it); });

  return (
    <select
      autoFocus
      value={value}
      onChange={(e) => { onChange(e.target.value); setEditing(false); }}
      onBlur={() => setEditing(false)}
      style={{ padding: "2px 6px", borderRadius: 5, border: "2px solid #6366f1",
        fontSize: 12, outline: "none", maxWidth: 220 }}
    >
      {Object.entries(grouped).map(([catId, its]) => (
        <optgroup key={catId} label={catById[catId]?.name ?? catId}>
          {its.map((it) => (
            <option key={it.id} value={it.id}>{it.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ─── Inline categoría selector ───────────────────────────────────────────────

function InlineCategorySelect({
  categoryId, catById, items, onItemChange,
}: {
  categoryId: string;
  catById: Record<string, Category>;
  items: ExpenseItem[];
  onItemChange: (itemId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const cat = catById[categoryId];

  if (!editing) {
    return (
      <span onClick={() => setEditing(true)} title="Click para cambiar categoría"
        style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
        {cat && <span style={{ width: 8, height: 8, borderRadius: 2, background: cat.color }} />}
        <span style={{ fontSize: 12, color: "#6b7280", borderBottom: "1px dashed #d1d5db" }}>
          {cat?.name ?? "—"}
        </span>
      </span>
    );
  }

  return (
    <select
      autoFocus
      value={categoryId}
      onChange={(e) => {
        const firstItem = items.find((it) => it.categoryId === e.target.value);
        if (firstItem) onItemChange(firstItem.id);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
      style={{ padding: "2px 6px", borderRadius: 5, border: "2px solid #6366f1",
        fontSize: 12, outline: "none" }}
    >
      {Object.values(catById).map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}

// ─── Histórico mensual ───────────────────────────────────────────────────────

function MonthlyHistorySection({
  items, catById,
}: {
  items: ExpenseItem[];
  catById: Record<string, Category>;
}) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const [histFrom, setHistFrom] = useState(`${now.getFullYear() - 1}-${pad(now.getMonth() + 1)}`);
  const [histTo,   setHistTo]   = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);

  const parse = (s: string) => { const [y, m] = s.split("-").map(Number); return { year: y, month: m - 1 }; };
  const from  = parse(histFrom);
  const to    = parse(histTo);
  const valid = from.year < to.year || (from.year === to.year && from.month <= to.month);

  const { data: histRecords = [] } = useExpenseRecordsRange(from.month, from.year, to.month, to.year);

  const monthSummaries = useMemo(() => {
    if (!valid) return [];
    const itemById = Object.fromEntries(items.map((it) => [it.id, it]));
    const recsByMonth: Record<string, ExpenseRecord[]> = {};
    histRecords.forEach((r) => { (recsByMonth[`${r.year}-${r.month}`] ??= []).push(r); });
    const rows: { month: number; year: number }[] = [];
    let m = from.month, y = from.year;
    while (y < to.year || (y === to.year && m <= to.month)) {
      rows.push({ month: m, year: y });
      m++; if (m > 11) { m = 0; y++; }
    }
    return rows.map(({ month, year }) => {
      const recs  = recsByMonth[`${year}-${month}`] ?? [];
      const total = recs.reduce((s, r) => s + r.realValue, 0);
      const byCat: Record<string, number> = {};
      recs.forEach((r) => {
        const it = itemById[r.itemId];
        if (it) byCat[it.categoryId] = (byCat[it.categoryId] ?? 0) + r.realValue;
      });
      return { month, year, total, byCat, count: recs.length };
    });
  }, [histRecords, valid, from.month, from.year, to.month, to.year, items]);

  const cats = useMemo(() => Object.values(catById), [catById]);

  return (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px #0001", overflow: "hidden" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap", gap: 10,
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>Histórico Mensual</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Desde:</label>
            <input type="month" value={histFrom} onChange={(e) => setHistFrom(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Hasta:</label>
            <input type="month" value={histTo} onChange={(e) => setHistTo(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
          </div>
        </div>
      </div>

      {!valid && <p style={{ padding: "16px", fontSize: 13, color: "#9ca3af" }}>Seleccioná un rango válido.</p>}
      {valid && monthSummaries.every((s) => s.count === 0) && (
        <p style={{ padding: "16px", fontSize: 13, color: "#9ca3af" }}>Sin registros en ese rango.</p>
      )}
      {valid && monthSummaries.some((s) => s.count > 0) && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ textAlign: "left",  padding: "8px 14px", fontWeight: 600, color: "#374151" }}>Mes</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Total</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#9ca3af" }}>Registros</th>
                {cats.map((c) => (
                  <th key={c.id} style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: c.color, whiteSpace: "nowrap" }}>
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthSummaries.filter((s) => s.count > 0).map(({ month, year, total, byCat, count }) => (
                <tr key={`${year}-${month}`} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "7px 14px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>
                    {MONTHS[month]} {year}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: "#111827" }}>{fmt(total)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: "#9ca3af" }}>{count}</td>
                  {cats.map((c) => (
                    <td key={c.id} style={{ padding: "7px 10px", textAlign: "right", color: "#6b7280" }}>
                      {byCat[c.id] ? fmt(byCat[c.id]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Histórico anual ─────────────────────────────────────────────────────────

function YearlyHistorySection({
  items, catById,
}: {
  items: ExpenseItem[];
  catById: Record<string, Category>;
}) {
  const now = new Date();
  const [fromYear, setFromYear] = useState(now.getFullYear() - 1);
  const [toYear,   setToYear]   = useState(now.getFullYear());
  const valid = fromYear <= toYear;

  const { data: histRecords = [] } = useExpenseRecordsRange(0, fromYear, 11, toYear);

  const yearSummaries = useMemo(() => {
    if (!valid) return [];
    const itemById = Object.fromEntries(items.map((it) => [it.id, it]));
    const recsByYear: Record<number, ExpenseRecord[]> = {};
    histRecords.forEach((r) => { (recsByYear[r.year] ??= []).push(r); });
    const years: number[] = [];
    for (let y = fromYear; y <= toYear; y++) years.push(y);
    return years.map((year) => {
      const recs  = recsByYear[year] ?? [];
      const total = recs.reduce((s, r) => s + r.realValue, 0);
      const byCat: Record<string, number> = {};
      recs.forEach((r) => {
        const it = itemById[r.itemId];
        if (it) byCat[it.categoryId] = (byCat[it.categoryId] ?? 0) + r.realValue;
      });
      return { year, total, byCat, count: recs.length };
    });
  }, [histRecords, valid, fromYear, toYear, items]);

  const cats = useMemo(() => Object.values(catById), [catById]);
  const yearOptions = [2023, 2024, 2025, 2026, 2027, 2028];

  return (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px #0001", overflow: "hidden" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap", gap: 10,
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>Histórico Anual</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Desde:</label>
            <select value={fromYear} onChange={(e) => setFromYear(+e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Hasta:</label>
            <select value={toYear} onChange={(e) => setToYear(+e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!valid && <p style={{ padding: "16px", fontSize: 13, color: "#9ca3af" }}>Seleccioná un rango válido.</p>}
      {valid && yearSummaries.every((s) => s.count === 0) && (
        <p style={{ padding: "16px", fontSize: 13, color: "#9ca3af" }}>Sin registros en ese rango.</p>
      )}
      {valid && yearSummaries.some((s) => s.count > 0) && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={{ textAlign: "left",  padding: "8px 14px", fontWeight: 600, color: "#374151" }}>Año</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Total</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#9ca3af" }}>Registros</th>
                {cats.map((c) => (
                  <th key={c.id} style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: c.color, whiteSpace: "nowrap" }}>
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yearSummaries.filter((s) => s.count > 0).map(({ year, total, byCat, count }) => (
                <tr key={year} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "7px 14px", fontWeight: 700, color: "#374151" }}>{year}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: "#111827" }}>{fmt(total)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: "#9ca3af" }}>{count}</td>
                  {cats.map((c) => (
                    <td key={c.id} style={{ padding: "7px 10px", textAlign: "right", color: "#6b7280" }}>
                      {byCat[c.id] ? fmt(byCat[c.id]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ExpensesTab() {
  const { expenseMonth, expenseYear, setExpenseMonth, setExpenseYear } = useDashboardStore();

  const { data: categories = [] } = useCategories();
  const { data: dbItems = [] }    = useExpenseItems();
  const { data: activeRecords = [] } = useExpenseRecords(expenseYear);

  const catById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  );

  const monthRecords = useMemo(
    () => activeRecords.filter((r) => r.month === expenseMonth && r.year === expenseYear),
    [activeRecords, expenseMonth, expenseYear]
  );

  return (
    <>
      {/* ── Top toolbar: year + month selector ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Año:</label>
          <select
            value={expenseYear}
            onChange={(e) => setExpenseYear(+e.target.value)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
          >
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginLeft: 8 }}>Mes:</label>
          <select
            value={expenseMonth}
            onChange={(e) => setExpenseMonth(+e.target.value)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
          >
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* ── Recordatorios ── */}
      <RemindersSection month={expenseMonth} year={expenseYear} items={dbItems} catById={catById} records={monthRecords} />

      {/* ── Active month table ── */}
      <ActiveMonthTable
        month={expenseMonth}
        year={expenseYear}
        items={dbItems}
        catById={catById}
        records={monthRecords}
      />

      {/* ── Historical sections ── */}
      <MonthlyHistorySection items={dbItems} catById={catById} />
      <div style={{ marginTop: 20 }} />
      <YearlyHistorySection items={dbItems} catById={catById} />
    </>
  );
}
