"use client";

import { useState } from "react";
import { MONTHS } from "@/lib/constants";
import {
  useInvestmentTypes,
  useAddInvestmentType,
  useDeleteInvestmentType,
  useCategories,
  useAddCategory,
  useDeleteCategory,
  useUpdateCategory,
  useIncomeSources,
  useAddIncomeSource,
  useDeleteIncomeSource,
  useAddIncomeHistory,
  useExpenseItems,
  useAddExpenseItem,
  useRemoveExpenseItem,
  useUpdateExpenseItem,
  useAddBudgetHistory,
  effectiveIncomeAmount,
  effectiveBudget,
  type IncomeSource,
  type ExpenseItem,
  type Category,
} from "@/hooks/use-finance-data";
import { fmt } from "@/lib/formatters";

const now = new Date();
const CUR_MONTH = now.getMonth(); // 0-based (0=Jan, 11=Dec)
const CUR_YEAR = now.getFullYear();

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#f59e0b", "#10b981", "#14b8a6", "#3b82f6", "#6b7280",
];

// ── Shared sub-components ────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px #0001", marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "#111827" }}>{title}</h3>
      {children}
    </div>
  );
}

function MonthYearPicker({
  month, year, onMonth, onYear,
}: { month: number; year: number; onMonth: (m: number) => void; onYear: (y: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <select value={month} onChange={(e) => onMonth(+e.target.value)}
        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
        {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
      </select>
      <input type="number" value={year} onChange={(e) => onYear(+e.target.value)}
        style={{ width: 70, padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
    </div>
  );
}

// ── Categories section ───────────────────────────────────────────────

function CategoryRow({ cat }: { cat: { id: string; name: string; color: string; items?: unknown[] } }) {
  const updateMut = useUpdateCategory();
  const deleteMut = useDeleteCategory();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(cat.name);
  const [editColor, setEditColor] = useState(cat.color);
  const itemCount = cat.items?.length ?? 0;

  const handleSave = () => {
    updateMut.mutate({ id: cat.id, name: editName.trim(), color: editColor });
    setEditing(false);
  };

  return (
    <li style={{ borderTop: "1px solid #f3f4f6" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
        <span style={{ width: 14, height: 14, borderRadius: 4, background: cat.color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#111827" }}>{cat.name}</span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          {itemCount} ítem{itemCount !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => { setEditName(cat.name); setEditColor(cat.color); setEditing(!editing); }}
          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "1px solid #6366f1",
            background: editing ? "#6366f1" : "none", color: editing ? "#fff" : "#6366f1",
            cursor: "pointer", fontWeight: 600 }}>
          Editar
        </button>
        <button
          onClick={() => deleteMut.mutate(cat.id)}
          disabled={deleteMut.isPending || itemCount > 0}
          title={itemCount > 0 ? "Tiene ítems asociados" : "Eliminar"}
          style={{ background: "none", border: "none", cursor: itemCount > 0 ? "not-allowed" : "pointer",
            color: itemCount > 0 ? "#d1d5db" : "#ef4444", fontSize: 14, padding: "0 2px" }}>
          ✕
        </button>
      </div>

      {editing && (
        <div style={{ padding: "0 10px 10px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Nombre</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 150 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Color</label>
            <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setEditColor(c)}
                  style={{ width: 20, height: 20, borderRadius: 5, background: c, border: "none", cursor: "pointer",
                    outline: editColor === c ? "2px solid #111827" : "none", outlineOffset: 1 }} />
              ))}
            </div>
          </div>
          <button onClick={handleSave} disabled={updateMut.isPending || !editName.trim()}
            style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13 }}>
            Guardar
          </button>
          <button onClick={() => setEditing(false)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            Cancelar
          </button>
        </div>
      )}
    </li>
  );
}

function CategoriesSection() {
  const { data: categories = [], isLoading } = useCategories();
  const addMut = useAddCategory();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);

  const handleAdd = () => {
    if (!newName.trim()) return;
    addMut.mutate({ name: newName.trim(), color: newColor }, {
      onSuccess: () => { setShowAdd(false); setNewName(""); },
    });
  };

  return (
    <SectionCard title="Categorías">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 13 }}>
          + Nueva categoría
        </button>
      </div>

      {showAdd && (
        <div style={{ background: "#f0fdf4", borderRadius: 8, padding: 12, marginBottom: 12,
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
          border: "1px dashed #86efac" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Nombre</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Ej: Transporte"
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 150 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Color</label>
            <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setNewColor(c)}
                  style={{ width: 22, height: 22, borderRadius: 6, background: c, border: "none", cursor: "pointer",
                    outline: newColor === c ? "2px solid #111827" : "none", outlineOffset: 1 }} />
              ))}
            </div>
          </div>
          <button onClick={handleAdd} disabled={addMut.isPending || !newName.trim()}
            style={{ padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 13 }}>
            {addMut.isPending ? "Guardando..." : "Agregar"}
          </button>
          <button onClick={() => setShowAdd(false)}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            Cancelar
          </button>
        </div>
      )}

      {isLoading ? (
        <p style={{ fontSize: 13, color: "#6b7280" }}>Cargando...</p>
      ) : categories.length === 0 ? (
        <p style={{ fontSize: 13, color: "#9ca3af" }}>Sin categorías.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, background: "#fff",
          borderRadius: 8, border: "1px solid #f3f4f6", overflow: "hidden" }}>
          {categories.map((cat) => <CategoryRow key={cat.id} cat={cat} />)}
        </ul>
      )}
    </SectionCard>
  );
}

// ── Income Sources section ───────────────────────────────────────────

function IncomeSourceRow({ source }: { source: IncomeSource }) {
  const deleteMut = useDeleteIncomeSource();
  const addHistory = useAddIncomeHistory();
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [amount, setAmount] = useState("");
  const [effMonth, setEffMonth] = useState(CUR_MONTH);
  const [effYear, setEffYear] = useState(CUR_YEAR);

  const current = effectiveIncomeAmount(source, CUR_MONTH, CUR_YEAR);

  const handleSave = () => {
    if (!amount) return;
    addHistory.mutate({ sourceId: source.id, amount: +amount, effectiveMonth: effMonth, effectiveYear: effYear });
    setEditing(false);
    setAmount("");
  };

  return (
    <li style={{ padding: "10px 12px", background: "#f9fafb", borderRadius: 10, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{source.name}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{fmt(current)}</span>
        <button onClick={() => { setEditing(!editing); setShowHistory(false); }}
          style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #6366f1",
            background: "none", color: "#6366f1", cursor: "pointer", fontWeight: 600 }}>
          Cambiar
        </button>
        <button onClick={() => { setShowHistory(!showHistory); setEditing(false); }}
          style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #d1d5db",
            background: "none", color: "#6b7280", cursor: "pointer" }}>
          Historial ({source.history.length})
        </button>
        <button onClick={() => deleteMut.mutate(source.id)} disabled={deleteMut.isPending}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 13, fontWeight: 600 }}>
          ✕
        </button>
      </div>

      {editing && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Nuevo monto</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder={fmt(current)}
              style={{ width: 130, padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Vigente desde</label>
            <MonthYearPicker month={effMonth} year={effYear} onMonth={setEffMonth} onYear={setEffYear} />
          </div>
          <button onClick={handleSave} disabled={addHistory.isPending || !amount}
            style={{ marginTop: 14, padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13 }}>
            Guardar
          </button>
          <button onClick={() => setEditing(false)}
            style={{ marginTop: 14, padding: "5px 10px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            Cancelar
          </button>
        </div>
      )}

      {showHistory && source.history.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
          <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 4px" }}>Historial de montos:</p>
          {[...source.history].reverse().map((h) => (
            <div key={h.id} style={{ display: "flex", gap: 8, fontSize: 12, color: "#374151", marginBottom: 2 }}>
              <span style={{ color: "#9ca3af" }}>Desde {MONTHS[h.effectiveMonth]} {h.effectiveYear}:</span>
              <span style={{ fontWeight: 600 }}>{fmt(h.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function IncomeSources() {
  const { data: sources = [], isLoading } = useIncomeSources();
  const addMut = useAddIncomeSource();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [effMonth, setEffMonth] = useState(CUR_MONTH);
  const [effYear, setEffYear] = useState(CUR_YEAR);

  const handleAdd = () => {
    if (!name.trim() || !amount) return;
    addMut.mutate({ name: name.trim(), amount: +amount, effectiveMonth: effMonth, effectiveYear: effYear });
    setShowForm(false);
    setName("");
    setAmount("");
  };

  const totalCurrent = sources.reduce((s, src) => s + effectiveIncomeAmount(src, CUR_MONTH, CUR_YEAR), 0);

  return (
    <SectionCard title="Ingresos">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          Total actual: <strong style={{ color: "#10b981" }}>{fmt(totalCurrent)}</strong>
        </span>
        <button onClick={() => setShowForm(!showForm)}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13 }}>
          + Nueva fuente
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#f0f9ff", borderRadius: 8, padding: 12, marginBottom: 12,
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Salario, Arriendo"
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 150 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Monto mensual</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 130 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Vigente desde</label>
            <MonthYearPicker month={effMonth} year={effYear} onMonth={setEffMonth} onYear={setEffYear} />
          </div>
          <button onClick={handleAdd} disabled={addMut.isPending || !name.trim() || !amount}
            style={{ padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 13 }}>
            Guardar
          </button>
          <button onClick={() => setShowForm(false)}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            Cancelar
          </button>
        </div>
      )}

      {isLoading ? (
        <p style={{ fontSize: 13, color: "#6b7280" }}>Cargando...</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {sources.map((src) => <IncomeSourceRow key={src.id} source={src} />)}
          {sources.length === 0 && (
            <li style={{ fontSize: 13, color: "#9ca3af" }}>Sin fuentes de ingreso configuradas.</li>
          )}
        </ul>
      )}
    </SectionCard>
  );
}

// ── Expense Budget section ───────────────────────────────────────────

function BudgetItemRow({ item, categories }: { item: ExpenseItem; categories: Category[] }) {
  const updateItem   = useUpdateExpenseItem();
  const removeItem   = useRemoveExpenseItem();
  const addHistory   = useAddBudgetHistory();
  const [mode, setMode] = useState<"view" | "edit" | "budget">("view");

  // edit fields
  const [editName,   setEditName]   = useState(item.name);
  const [editCatId,  setEditCatId]  = useState(item.categoryId);

  // budget change fields
  const [amount,    setAmount]    = useState("");
  const [effMonth,  setEffMonth]  = useState(CUR_MONTH);
  const [effYear,   setEffYear]   = useState(CUR_YEAR);

  const current = effectiveBudget(item, CUR_MONTH, CUR_YEAR);
  const cat = categories.find((c) => c.id === item.categoryId);

  const handleSaveEdit = () => {
    updateItem.mutate({ id: item.id, name: editName.trim(), categoryId: editCatId });
    setMode("view");
  };

  const handleSaveBudget = () => {
    if (!amount) return;
    addHistory.mutate({ itemId: item.id, amount: +amount, effectiveMonth: effMonth, effectiveYear: effYear });
    setMode("view");
    setAmount("");
  };

  return (
    <li style={{ padding: "10px 12px", borderTop: "1px solid #f3f4f6" }}>
      {/* View row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {cat && <span style={{ width: 8, height: 8, borderRadius: 2, background: cat.color, flexShrink: 0 }} />}
        <span style={{ flex: 1, fontSize: 13, color: "#111827", fontWeight: 500 }}>{item.name}</span>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{cat?.name}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#374151", minWidth: 80, textAlign: "right" }}>
          {fmt(current)}
        </span>
        <button
          onClick={() => { setEditName(item.name); setEditCatId(item.categoryId); setMode(mode === "edit" ? "view" : "edit"); }}
          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "1px solid #6366f1",
            background: mode === "edit" ? "#6366f1" : "none", color: mode === "edit" ? "#fff" : "#6366f1",
            cursor: "pointer", fontWeight: 600 }}>
          Editar
        </button>
        <button
          onClick={() => setMode(mode === "budget" ? "view" : "budget")}
          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "1px solid #10b981",
            background: mode === "budget" ? "#10b981" : "none", color: mode === "budget" ? "#fff" : "#10b981",
            cursor: "pointer", fontWeight: 600 }}>
          Presupuesto
        </button>
        <button
          onClick={() => removeItem.mutate(item.id)}
          disabled={removeItem.isPending}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 14, padding: "0 2px" }}>
          ✕
        </button>
      </div>

      {/* Edit name + category */}
      {mode === "edit" && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Nombre</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 160 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Categoría</label>
            <select value={editCatId} onChange={(e) => setEditCatId(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={handleSaveEdit} disabled={updateItem.isPending || !editName.trim()}
            style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13 }}>
            Guardar
          </button>
          <button onClick={() => setMode("view")}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            Cancelar
          </button>
        </div>
      )}

      {/* Budget change */}
      {mode === "budget" && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Nuevo presupuesto</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder={String(current)}
              style={{ width: 130, padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Vigente desde</label>
            <MonthYearPicker month={effMonth} year={effYear} onMonth={setEffMonth} onYear={setEffYear} />
          </div>
          <button onClick={handleSaveBudget} disabled={addHistory.isPending || !amount}
            style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 13 }}>
            Guardar
          </button>
          <button onClick={() => setMode("view")}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            Cancelar
          </button>
        </div>
      )}
    </li>
  );
}

function AddExpenseItemForm({ categories, onDone }: { categories: Category[]; onDone: () => void }) {
  const addItem = useAddExpenseItem();
  const [name,    setName]    = useState("");
  const [catId,   setCatId]   = useState(categories[0]?.id ?? "");
  const [budget,  setBudget]  = useState("");

  const handleAdd = () => {
    if (!name.trim() || !budget || !catId) return;
    addItem.mutate({ name: name.trim(), monthlyBudget: +budget, categoryId: catId }, {
      onSuccess: () => { onDone(); setName(""); setBudget(""); },
    });
  };

  return (
    <div style={{ background: "#f0fdf4", borderRadius: 8, padding: 12, marginBottom: 12,
      display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
      border: "1px dashed #86efac" }}>
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Netflix"
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 150 }} />
      </div>
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Categoría</label>
        <select value={catId} onChange={(e) => setCatId(e.target.value)}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Presupuesto mensual</label>
        <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)}
          placeholder="0"
          style={{ width: 130, padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
      </div>
      <button onClick={handleAdd} disabled={addItem.isPending || !name.trim() || !budget || !catId}
        style={{ padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
          background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 13 }}>
        {addItem.isPending ? "Guardando..." : "Agregar"}
      </button>
      <button onClick={onDone}
        style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #d1d5db",
          background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
        Cancelar
      </button>
    </div>
  );
}

function ExpenseBudgets() {
  const { data: items = [], isLoading } = useExpenseItems();
  const { data: categories = [] }       = useCategories();
  const [showAdd, setShowAdd]           = useState(false);

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  const grouped = items.reduce<Record<string, ExpenseItem[]>>((acc, it) => {
    (acc[it.categoryId] ??= []).push(it);
    return acc;
  }, {});

  return (
    <SectionCard title="Presupuesto de Egresos">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 13 }}>
          + Nuevo egreso
        </button>
      </div>

      {showAdd && categories.length > 0 && (
        <AddExpenseItemForm categories={categories} onDone={() => setShowAdd(false)} />
      )}
      {showAdd && categories.length === 0 && (
        <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 12 }}>
          Primero crea al menos una categoría.
        </p>
      )}

      {isLoading ? (
        <p style={{ fontSize: 13, color: "#6b7280" }}>Cargando...</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 13, color: "#9ca3af" }}>Sin egresos configurados.</p>
      ) : (
        Object.entries(grouped).map(([catId, catItems]) => {
          const cat = catMap[catId];
          return (
            <div key={catId} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: cat?.color ?? "#6b7280", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{cat?.name ?? catId}</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, background: "#fff",
                borderRadius: 8, border: "1px solid #f3f4f6", overflow: "hidden" }}>
                {catItems.map((it) => (
                  <BudgetItemRow key={it.id} item={it} categories={categories} />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </SectionCard>
  );
}

// ── Investment Types section (existing) ──────────────────────────────

function InvestmentTypesSection() {
  const { data: investmentTypes = [], isLoading } = useInvestmentTypes();
  const addMut = useAddInvestmentType();
  const removeMut = useDeleteInvestmentType();
  const [newTypeName, setNewTypeName] = useState("");

  const handleAdd = () => {
    if (!newTypeName.trim()) return;
    addMut.mutate({ name: newTypeName.trim() });
    setNewTypeName("");
  };

  return (
    <SectionCard title="Tipos de Inversión">
      {isLoading ? (
        <p style={{ fontSize: 13, color: "#6b7280" }}>Cargando...</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px" }}>
          {investmentTypes.map((type) => (
            <li key={type.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "7px 10px", background: "#f9fafb", borderRadius: 8, marginBottom: 6,
            }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{type.name}</span>
              <button onClick={() => removeMut.mutate(type.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12, fontWeight: 600 }}>
                Eliminar
              </button>
            </li>
          ))}
          {investmentTypes.length === 0 && (
            <li style={{ fontSize: 13, color: "#9ca3af" }}>Sin tipos configurados.</li>
          )}
        </ul>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input type="text" placeholder="Nuevo tipo (ej: Crypto)"
          value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }} />
        <button onClick={handleAdd} disabled={addMut.isPending || !newTypeName.trim()}
          style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 14 }}>
          {addMut.isPending ? "Guardando..." : "+ Agregar"}
        </button>
      </div>
    </SectionCard>
  );
}

// ── Root ─────────────────────────────────────────────────────────────

export default function SettingsTab() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Configuración</h2>
      <CategoriesSection />
      <IncomeSources />
      <ExpenseBudgets />
      <InvestmentTypesSection />
    </div>
  );
}
