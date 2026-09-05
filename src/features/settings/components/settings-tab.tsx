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
import Money from "@/components/ui/money";
import { useTranslation } from "@/hooks/use-translation";

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
  const { t } = useTranslation();
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
          {itemCount} {t("settings.itemWord")}{itemCount !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => { setEditName(cat.name); setEditColor(cat.color); setEditing(!editing); }}
          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "1px solid #6366f1",
            background: editing ? "#6366f1" : "none", color: editing ? "#fff" : "#6366f1",
            cursor: "pointer", fontWeight: 600 }}>
          {t("settings.edit")}
        </button>
        <button
          onClick={() => deleteMut.mutate(cat.id)}
          disabled={deleteMut.isPending || itemCount > 0}
          title={itemCount > 0 ? t("settings.hasAssociatedItems") : t("settings.delete")}
          style={{ background: "none", border: "none", cursor: itemCount > 0 ? "not-allowed" : "pointer",
            color: itemCount > 0 ? "#d1d5db" : "#ef4444", fontSize: 14, padding: "0 2px" }}>
          ✕
        </button>
      </div>

      {editing && (
        <div style={{ padding: "0 10px 10px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.name")}</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 150 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.color")}</label>
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
            {t("settings.save")}
          </button>
          <button onClick={() => setEditing(false)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            {t("settings.cancel")}
          </button>
        </div>
      )}
    </li>
  );
}

function CategoriesSection() {
  const { t } = useTranslation();
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
    <SectionCard title={t("settings.categoriesTitle")}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 13 }}>
          {t("settings.newCategoryButton")}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: "#f0fdf4", borderRadius: 8, padding: 12, marginBottom: 12,
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
          border: "1px dashed #86efac" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.name")}</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={t("settings.categoryNamePlaceholder")}
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 150 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.color")}</label>
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
            {addMut.isPending ? t("settings.saving") : t("settings.add")}
          </button>
          <button onClick={() => setShowAdd(false)}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            {t("settings.cancel")}
          </button>
        </div>
      )}

      {isLoading ? (
        <p style={{ fontSize: 13, color: "#6b7280" }}>{t("settings.loading")}</p>
      ) : categories.length === 0 ? (
        <p style={{ fontSize: 13, color: "#9ca3af" }}>{t("settings.noCategories")}</p>
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
  const { t } = useTranslation();
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
        <span style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{<Money amount={current} />}</span>
        <button onClick={() => { setEditing(!editing); setShowHistory(false); }}
          style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #6366f1",
            background: "none", color: "#6366f1", cursor: "pointer", fontWeight: 600 }}>
          {t("settings.updateButton")}
        </button>
        <button onClick={() => { setShowHistory(!showHistory); setEditing(false); }}
          style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #d1d5db",
            background: "none", color: "#6b7280", cursor: "pointer" }}>
          {t("settings.historyButton", { count: source.history.length })}
        </button>
        <button onClick={() => deleteMut.mutate(source.id)} disabled={deleteMut.isPending}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 13, fontWeight: 600 }}>
          ✕
        </button>
      </div>

      {editing && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.newAmountLabel")}</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder={fmt(current)}
              style={{ width: 130, padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.effectiveFrom")}</label>
            <MonthYearPicker month={effMonth} year={effYear} onMonth={setEffMonth} onYear={setEffYear} />
          </div>
          <button onClick={handleSave} disabled={addHistory.isPending || !amount}
            style={{ marginTop: 14, padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13 }}>
            {t("settings.save")}
          </button>
          <button onClick={() => setEditing(false)}
            style={{ marginTop: 14, padding: "5px 10px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            {t("settings.cancel")}
          </button>
        </div>
      )}

      {showHistory && source.history.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
          <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 4px" }}>{t("settings.amountHistoryLabel")}</p>
          {[...source.history].reverse().map((h) => (
            <div key={h.id} style={{ display: "flex", gap: 8, fontSize: 12, color: "#374151", marginBottom: 2 }}>
              <span style={{ color: "#9ca3af" }}>{t("settings.fromDateLabel", { month: MONTHS[h.effectiveMonth], year: h.effectiveYear })}</span>
              <span style={{ fontWeight: 600 }}>{<Money amount={h.amount} />}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function IncomeSources() {
  const { t } = useTranslation();
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
    <SectionCard title={t("settings.incomeTitle")}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          {t("settings.currentTotalLabel")} <strong style={{ color: "#10b981" }}>{<Money amount={totalCurrent} />}</strong>
        </span>
        <button onClick={() => setShowForm(!showForm)}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13 }}>
          {t("settings.newSourceButton")}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#f0f9ff", borderRadius: 8, padding: 12, marginBottom: 12,
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.name")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.sourceNamePlaceholder")}
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 150 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.monthlyAmountLabel")}</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 130 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.effectiveFrom")}</label>
            <MonthYearPicker month={effMonth} year={effYear} onMonth={setEffMonth} onYear={setEffYear} />
          </div>
          <button onClick={handleAdd} disabled={addMut.isPending || !name.trim() || !amount}
            style={{ padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 13 }}>
            {t("settings.save")}
          </button>
          <button onClick={() => setShowForm(false)}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            {t("settings.cancel")}
          </button>
        </div>
      )}

      {isLoading ? (
        <p style={{ fontSize: 13, color: "#6b7280" }}>{t("settings.loading")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {sources.map((src) => <IncomeSourceRow key={src.id} source={src} />)}
          {sources.length === 0 && (
            <li style={{ fontSize: 13, color: "#9ca3af" }}>{t("settings.noIncomeSources")}</li>
          )}
        </ul>
      )}
    </SectionCard>
  );
}

// ── Expense Budget section ───────────────────────────────────────────

function BudgetItemRow({ item, categories }: { item: ExpenseItem; categories: Category[] }) {
  const { t } = useTranslation();
  const updateItem   = useUpdateExpenseItem();
  const removeItem   = useRemoveExpenseItem();
  const addHistory   = useAddBudgetHistory();
  const [mode, setMode] = useState<"view" | "edit" | "budget">("view");

  // edit fields
  const [editName,   setEditName]   = useState(item.name);
  const [editCatId,  setEditCatId]  = useState(item.categoryId);
  const [editImportant, setEditImportant] = useState(item.isImportant ?? false);
  const [editDefaultDay, setEditDefaultDay] = useState(item.defaultDay ?? 1);

  // budget change fields
  const [amount,    setAmount]    = useState("");
  const [effMonth,  setEffMonth]  = useState(CUR_MONTH);
  const [effYear,   setEffYear]   = useState(CUR_YEAR);

  const current = effectiveBudget(item, CUR_MONTH, CUR_YEAR);
  const cat = categories.find((c) => c.id === item.categoryId);

  const handleSaveEdit = () => {
    updateItem.mutate({ id: item.id, name: editName.trim(), categoryId: editCatId, isImportant: editImportant, defaultDay: editDefaultDay });
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
        <span style={{ flex: 1, fontSize: 13, color: "#111827", fontWeight: 500 }}>
          {item.name} {item.isImportant && <span style={{ fontSize: 11, color: "#f59e0b", marginLeft: 4 }}>{t("settings.dayNote", { day: item.defaultDay })}</span>}
        </span>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{cat?.name}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#374151", minWidth: 80, textAlign: "right" }}>
          {<Money amount={current} />}
        </span>
        <button
          onClick={() => { setEditName(item.name); setEditCatId(item.categoryId); setMode(mode === "edit" ? "view" : "edit"); }}
          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "1px solid #6366f1",
            background: mode === "edit" ? "#6366f1" : "none", color: mode === "edit" ? "#fff" : "#6366f1",
            cursor: "pointer", fontWeight: 600 }}>
          {t("settings.edit")}
        </button>
        <button
          onClick={() => setMode(mode === "budget" ? "view" : "budget")}
          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, border: "1px solid #10b981",
            background: mode === "budget" ? "#10b981" : "none", color: mode === "budget" ? "#fff" : "#10b981",
            cursor: "pointer", fontWeight: 600 }}>
          {t("settings.budgetButton")}
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
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.name")}</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 160 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.category")}</label>
            <select value={editCatId} onChange={(e) => setEditCatId(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={editImportant} onChange={(e) => setEditImportant(e.target.checked)} id={`chk-${item.id}`} />
            <label htmlFor={`chk-${item.id}`} style={{ fontSize: 11, color: "#6b7280", cursor: "pointer" }}>{t("settings.reminderQuestionLabel")}</label>
          </div>
          {editImportant && (
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.dayLabel")}</label>
              <input type="number" min={1} max={31} value={editDefaultDay} onChange={(e) => setEditDefaultDay(+e.target.value)}
                style={{ width: 50, padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
            </div>
          )}
          <button onClick={handleSaveEdit} disabled={updateItem.isPending || !editName.trim()}
            style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13 }}>
            {t("settings.save")}
          </button>
          <button onClick={() => setMode("view")}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            {t("settings.cancel")}
          </button>
        </div>
      )}

      {/* Budget change */}
      {mode === "budget" && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.newBudgetLabel")}</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder={String(current)}
              style={{ width: 130, padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.effectiveFrom")}</label>
            <MonthYearPicker month={effMonth} year={effYear} onMonth={setEffMonth} onYear={setEffYear} />
          </div>
          <button onClick={handleSaveBudget} disabled={addHistory.isPending || !amount}
            style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 13 }}>
            {t("settings.save")}
          </button>
          <button onClick={() => setMode("view")}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            {t("settings.cancel")}
          </button>
        </div>
      )}
    </li>
  );
}

function AddExpenseItemForm({ categories, isImportant, onDone }: { categories: Category[]; isImportant?: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const addItem = useAddExpenseItem();
  const [name,    setName]    = useState("");
  const [catId,   setCatId]   = useState(categories[0]?.id ?? "");
  const [budget,  setBudget]  = useState("");
  const [defaultDay, setDefaultDay] = useState(new Date().getDate());

  const handleAdd = () => {
    if (!name.trim() || !budget || !catId) return;
    addItem.mutate({ name: name.trim(), monthlyBudget: +budget, categoryId: catId, isImportant, defaultDay }, {
      onSuccess: () => { onDone(); setName(""); setBudget(""); setDefaultDay(new Date().getDate()); },
    });
  };

  return (
    <div style={{ background: "#f0fdf4", borderRadius: 8, padding: 12, marginBottom: 12,
      display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
      border: "1px dashed #86efac" }}>
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.expenseNamePlaceholder")}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: 150 }} />
      </div>
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.category")}</label>
        <select value={catId} onChange={(e) => setCatId(e.target.value)}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.monthlyBudgetLabel")}</label>
        <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)}
          placeholder="0"
          style={{ width: 130, padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
      </div>
      {isImportant && (
        <div>
          <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("settings.paymentDayLabel")}</label>
          <input type="number" min={1} max={31} value={defaultDay} onChange={(e) => setDefaultDay(+e.target.value)}
            style={{ width: 60, padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
        </div>
      )}
      <button onClick={handleAdd} disabled={addItem.isPending || !name.trim() || !budget || !catId}
        style={{ padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
          background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 13 }}>
        {addItem.isPending ? t("settings.saving") : t("settings.add")}
      </button>
      <button onClick={onDone}
        style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #d1d5db",
          background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
        {t("settings.cancel")}
      </button>
    </div>
  );
}

function ExpenseCategoryGroup({ catId, catItems, categories }: { catId: string; catItems: ExpenseItem[]; categories: Category[] }) {
  const { t } = useTranslation();
  const cat = categories.find((c) => c.id === catId);
  const [open, setOpen] = useState(false);

  const regularItems   = catItems.filter((it) => !it.isImportant);
  const reminderItems  = catItems.filter((it) =>  it.isImportant);
  const total = catItems.reduce((s, it) => s + effectiveBudget(it, CUR_MONTH, CUR_YEAR), 0);

  return (
    <div style={{ marginBottom: 10, borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
      {/* Category header */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
          background: open ? "#f9fafb" : "#fff", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ width: 12, height: 12, borderRadius: 4, background: cat?.color ?? "#6b7280", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#111827" }}>{cat?.name ?? catId}</span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>{<Money amount={total} />}</span>
        <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>
          {catItems.length} {t("settings.itemWord")}{catItems.length !== 1 ? "s" : ""}
        </span>
        <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ background: "#fff", borderTop: "1px solid #f3f4f6" }}>
          {/* Regular items */}
          {regularItems.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {regularItems.map((it) => (
                <BudgetItemRow key={it.id} item={it} categories={categories} />
              ))}
            </ul>
          )}

          {/* Reminders sub-section */}
          {reminderItems.length > 0 && (
            <>
              <div style={{ padding: "6px 14px 4px", borderTop: regularItems.length > 0 ? "1px solid #f3f4f6" : undefined,
                background: "#faf5ff" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#9333ea", letterSpacing: "0.04em",
                  textTransform: "uppercase" }}>
                  {t("settings.remindersHeading")}
                </span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, background: "#faf5ff" }}>
                {reminderItems.map((it) => (
                  <BudgetItemRow key={it.id} item={it} categories={categories} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ExpenseBudgets() {
  const { t } = useTranslation();
  const { data: items = [], isLoading } = useExpenseItems();
  const { data: categories = [] }       = useCategories();
  const [showAdd, setShowAdd]           = useState(false);

  const grouped = items.reduce<Record<string, ExpenseItem[]>>((acc, it) => {
    (acc[it.categoryId] ??= []).push(it);
    return acc;
  }, {});

  return (
    <SectionCard title={t("settings.expenseBudgetTitle")}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 13 }}>
          {t("settings.newExpenseButton")}
        </button>
      </div>

      {showAdd && categories.length > 0 && (
        <AddExpenseItemForm categories={categories} onDone={() => setShowAdd(false)} />
      )}
      {showAdd && categories.length === 0 && (
        <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 12 }}>
          {t("settings.createCategoryFirst")}
        </p>
      )}

      {isLoading ? (
        <p style={{ fontSize: 13, color: "#6b7280" }}>{t("settings.loading")}</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 13, color: "#9ca3af" }}>{t("settings.noExpenses")}</p>
      ) : (
        Object.entries(grouped).map(([catId, catItems]) => (
          <ExpenseCategoryGroup key={catId} catId={catId} catItems={catItems} categories={categories} />
        ))
      )}
    </SectionCard>
  );
}

function ImportantExpensesSection() {
  const { t } = useTranslation();
  const { data: items = [], isLoading } = useExpenseItems();
  const { data: categories = [] }       = useCategories();
  const updateItem                      = useUpdateExpenseItem();
  const [showAdd, setShowAdd]           = useState(false);
  const [selectedId, setSelectedId]     = useState("");
  const [defaultDay, setDefaultDay]     = useState(new Date().getDate());

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  const importantItems  = items.filter((it) =>  it.isImportant);
  const availableItems  = items.filter((it) => !it.isImportant);

  const grouped = importantItems.reduce<Record<string, ExpenseItem[]>>((acc, it) => {
    (acc[it.categoryId] ??= []).push(it);
    return acc;
  }, {});

  const groupedAvailable = availableItems.reduce<Record<string, ExpenseItem[]>>((acc, it) => {
    (acc[it.categoryId] ??= []).push(it);
    return acc;
  }, {});

  const handleMarkAsReminder = () => {
    if (!selectedId) return;
    updateItem.mutate({ id: selectedId, isImportant: true, defaultDay }, {
      onSuccess: () => { setShowAdd(false); setSelectedId(""); },
    });
  };

  return (
    <SectionCard title={t("settings.importantExpensesTitle")}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          onClick={() => { setShowAdd(!showAdd); setSelectedId(availableItems[0]?.id ?? ""); }}
          disabled={availableItems.length === 0}
          title={availableItems.length === 0 ? t("settings.allItemsAreReminders") : undefined}
          style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: availableItems.length === 0 ? "not-allowed" : "pointer",
            background: availableItems.length === 0 ? "#e5e7eb" : "#6366f1",
            color: availableItems.length === 0 ? "#9ca3af" : "#fff", fontWeight: 600, fontSize: 13 }}>
          {t("settings.addReminderButton")}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: "#f0f9ff", borderRadius: 8, padding: 12, marginBottom: 12,
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
          border: "1px dashed #a5b4fc" }}>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 }}>{t("settings.expenseLabel")}</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, minWidth: 200 }}
            >
              {Object.entries(groupedAvailable).map(([catId, its]) => (
                <optgroup key={catId} label={catMap[catId]?.name ?? catId}>
                  {its.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 }}>{t("settings.paymentDayLabel")}</label>
            <input
              type="number" min={1} max={31} value={defaultDay}
              onChange={(e) => setDefaultDay(+e.target.value)}
              style={{ width: 60, padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
            />
          </div>
          <button
            onClick={handleMarkAsReminder}
            disabled={!selectedId || updateItem.isPending}
            style={{ padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#6366f1", color: "#fff", fontWeight: 600, fontSize: 13 }}>
            {updateItem.isPending ? t("settings.saving") : t("settings.save")}
          </button>
          <button
            onClick={() => setShowAdd(false)}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
            {t("settings.cancel")}
          </button>
        </div>
      )}

      {isLoading ? (
        <p style={{ fontSize: 13, color: "#6b7280" }}>{t("settings.loading")}</p>
      ) : importantItems.length === 0 ? (
        <p style={{ fontSize: 13, color: "#9ca3af" }}>{t("settings.noReminders")}</p>
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
  const { t } = useTranslation();
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
    <SectionCard title={t("settings.investmentTypesTitle")}>
      {isLoading ? (
        <p style={{ fontSize: 13, color: "#6b7280" }}>{t("settings.loading")}</p>
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
                {t("settings.delete")}
              </button>
            </li>
          ))}
          {investmentTypes.length === 0 && (
            <li style={{ fontSize: 13, color: "#9ca3af" }}>{t("settings.noTypes")}</li>
          )}
        </ul>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input type="text" placeholder={t("settings.newTypePlaceholder")}
          value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }} />
        <button onClick={handleAdd} disabled={addMut.isPending || !newTypeName.trim()}
          style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 14 }}>
          {addMut.isPending ? t("settings.saving") : t("settings.addTypeButton")}
        </button>
      </div>
    </SectionCard>
  );
}

// ── Root ─────────────────────────────────────────────────────────────

export default function SettingsTab() {
  const { t } = useTranslation();
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 16 }}>{t("settings.pageTitle")}</h2>
      <CategoriesSection />
      <IncomeSources />
      <ImportantExpensesSection />
      <ExpenseBudgets />
      <InvestmentTypesSection />
    </div>
  );
}
