"use client";

import { useState, useMemo } from "react";
import {
    useStocks,
    useInvestmentTypes,
    useAddStock,
    useRemoveStock,
    useUpdateStock,
    useStockTransactions,
    useAddStockTransaction,
    useDeleteStockTransaction,
    useStockPriceSnapshots,
    useUpsertStockPriceSnapshot,
    useDeleteStockPriceSnapshot,
    type Stock,
    type StockTransaction,
    type StockPriceSnapshot,
} from "@/hooks/use-finance-data";
import { fmt } from "@/lib/formatters";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = ["#7c3aed", "#2563eb", "#059669", "#dc2626", "#d97706", "#0891b2", "#db2777", "#be185d", "#065f46", "#92400e"];

// ── Helpers ────────────────────────────────────────────────────────────

function latestSnapshot(snapshots: StockPriceSnapshot[]): StockPriceSnapshot | null {
    if (!snapshots.length) return null;
    return [...snapshots].sort((a, b) => b.year - a.year || b.month - a.month)[0];
}

function computeTotalCost(txs: StockTransaction[]) {
    return txs.reduce((s, t) => s + t.quantity * t.priceUnit + t.commission, 0);
}

function computeTotalShares(txs: StockTransaction[]) {
    return txs.reduce((s, t) => s + t.quantity, 0);
}

function GainBadge({ gain, pct }: { gain: number; pct: number }) {
    const positive = gain >= 0;
    return (
        <span style={{ color: positive ? "#059669" : "#dc2626", fontWeight: 700, fontSize: 12 }}>
            {positive ? "+" : ""}{fmt(gain)} ({positive ? "+" : ""}{pct.toFixed(2)}%)
        </span>
    );
}

// ── New Stock Form ─────────────────────────────────────────────────────

function NewStockForm({ onClose }: { onClose: () => void }) {
    const { data: types = [] } = useInvestmentTypes();
    const addStock = useAddStock();
    const addTransaction = useAddStockTransaction();

    const now = new Date();
    const [form, setForm] = useState({
        name: "",
        color: COLORS[0],
        typeId: "",
        quantity: "",
        priceUnit: "",
        commission: "",
        transactionDate: now.toISOString().split("T")[0],
        notes: "",
    });

    const qty = parseInt(form.quantity) || 0;
    const price = parseFloat(form.priceUnit) || 0;
    const commission = parseFloat(form.commission) || 0;
    const previewCost = qty * price + commission;

    const handleSave = async () => {
        if (!form.name.trim() || !form.typeId || !form.quantity || !form.priceUnit || !form.commission) {
            alert("Fill in all required fields");
            return;
        }
        try {
            const inv = await addStock.mutateAsync({
                name: form.name.trim(),
                typeId: form.typeId,
                color: form.color,
            }) as Stock;

            await addTransaction.mutateAsync({
                investmentId: inv.id,
                quantity: qty,
                priceUnit: Math.round(price),
                commission: Math.round(commission),
                transactionDate: form.transactionDate,
                notes: form.notes,
            });

            onClose();
        } catch {
            alert("Failed to create stock");
        }
    };

    const isPending = addStock.isPending || addTransaction.isPending;

    if (!types.length) {
        return (
            <div style={{ background: "#fef3c7", borderRadius: 10, padding: 16, marginBottom: 12, fontSize: 13, color: "#92400e" }}>
                No investment types found. Create one in <strong>Settings → Investment Types</strong> first.
                <button onClick={onClose} style={{ marginLeft: 12, fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
            </div>
        );
    }

    return (
        <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 4px #0001" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>New Stock</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Name *</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Apple" style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 140 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Type *</label>
                    <select value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })}
                        style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
                        <option value="">-- select --</option>
                        {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Color</label>
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        {COLORS.map((c) => (
                            <button key={c} onClick={() => setForm({ ...form, color: c })}
                                style={{ width: 20, height: 20, borderRadius: 4, background: c, border: form.color === c ? "2px solid #1f2937" : "2px solid transparent", cursor: "pointer" }} />
                        ))}
                    </div>
                </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280", fontWeight: 600 }}>Initial Purchase</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 6 }}>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Quantity *</label>
                    <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                        placeholder="10" style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 90 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Price/Share *</label>
                    <input type="number" value={form.priceUnit} onChange={(e) => setForm({ ...form, priceUnit: e.target.value })}
                        placeholder="2500" style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 110 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Commission *</label>
                    <input type="number" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })}
                        placeholder="0" style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 100 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Date *</label>
                    <input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                        style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Notes</label>
                    <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="optional" style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: "100%" }} />
                </div>
            </div>
            {previewCost > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                    Total cost: <strong style={{ color: "#1f2937" }}>{fmt(previewCost)}</strong>
                </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={handleSave} disabled={isPending}
                    style={{ padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 12, opacity: isPending ? 0.6 : 1 }}>
                    {isPending ? "Saving…" : "Save"}
                </button>
                <button onClick={onClose}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 12 }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ── Add Purchase Form ──────────────────────────────────────────────────

function AddPurchaseForm({ investmentId, onClose }: { investmentId: string; onClose: () => void }) {
    const addTransaction = useAddStockTransaction();
    const [form, setForm] = useState({
        quantity: "",
        priceUnit: "",
        commission: "",
        transactionDate: new Date().toISOString().split("T")[0],
        notes: "",
    });

    const qty = parseInt(form.quantity) || 0;
    const price = parseFloat(form.priceUnit) || 0;
    const commission = parseFloat(form.commission) || 0;
    const previewCost = qty * price + commission;

    const handleSave = async () => {
        if (!form.quantity || !form.priceUnit || !form.commission) {
            alert("Fill in all required fields");
            return;
        }
        try {
            await addTransaction.mutateAsync({
                investmentId,
                quantity: qty,
                priceUnit: Math.round(price),
                commission: Math.round(commission),
                transactionDate: form.transactionDate,
                notes: form.notes,
            });
            onClose();
        } catch {
            alert("Failed to add purchase");
        }
    };

    return (
        <div style={{ background: "#f9fafb", borderRadius: 8, padding: 12, marginBottom: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "#374151" }}>Add Purchase</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Quantity *</label>
                    <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                        placeholder="10" style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 80 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Price/Share *</label>
                    <input type="number" value={form.priceUnit} onChange={(e) => setForm({ ...form, priceUnit: e.target.value })}
                        placeholder="2500" style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 100 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Commission *</label>
                    <input type="number" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })}
                        placeholder="0" style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 90 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Date *</label>
                    <input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                        style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Notes</label>
                    <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="optional" style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: "100%" }} />
                </div>
                <button onClick={handleSave} disabled={addTransaction.isPending}
                    style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 12, opacity: addTransaction.isPending ? 0.6 : 1 }}>
                    {addTransaction.isPending ? "Saving…" : "Save"}
                </button>
                <button onClick={onClose}
                    style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 12 }}>
                    Cancel
                </button>
            </div>
            {previewCost > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                    Cost basis: <strong style={{ color: "#1f2937" }}>{fmt(previewCost)}</strong>
                </div>
            )}
        </div>
    );
}

// ── Add Price Per Share Form ───────────────────────────────────────────

function AddPricePerShareForm({ investmentId, totalShares, totalCost }: { investmentId: string; totalShares: number; totalCost: number }) {
    const upsert = useUpsertStockPriceSnapshot();
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [price, setPrice] = useState("");

    const pricePerShare = parseFloat(price) || 0;
    const currentValue = pricePerShare > 0 && totalShares > 0 ? pricePerShare * totalShares : null;
    const gain = currentValue != null && totalCost > 0 ? currentValue - totalCost : null;
    const gainPct = gain != null && totalCost > 0 ? (gain / totalCost) * 100 : null;

    const handleSave = async () => {
        if (!price || pricePerShare <= 0) return;
        try {
            await upsert.mutateAsync({
                investmentId,
                month,
                year,
                pricePerShare: Math.round(pricePerShare),
            });
            setPrice("");
        } catch (err) {
            console.error("[AddPricePerShareForm]", err);
            alert("Failed to save: " + (err instanceof Error ? err.message : String(err)));
        }
    };

    return (
        <div style={{ background: "#f9fafb", borderRadius: 8, padding: 12, marginBottom: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Month</label>
                    <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
                        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Year</label>
                    <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))}
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 80 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Price / Share *</label>
                    <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                        placeholder="e.g. 3200"
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 120 }} />
                </div>
                <button onClick={handleSave} disabled={upsert.isPending || !price || pricePerShare <= 0}
                    style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#7c3aed", color: "#fff", fontWeight: 600, fontSize: 12, opacity: (upsert.isPending || !price) ? 0.6 : 1 }}>
                    {upsert.isPending ? "Saving…" : "Save"}
                </button>
            </div>
            {currentValue != null && gain != null && gainPct != null && (
                <div style={{ marginTop: 8, fontSize: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span style={{ color: "#6b7280" }}>Current value: <strong style={{ color: "#059669" }}>{fmt(currentValue)}</strong></span>
                    <span style={{ color: "#6b7280" }}>Invested: <strong style={{ color: "#1f2937" }}>{fmt(totalCost)}</strong></span>
                    <span style={{ color: "#6b7280" }}>Gain / Loss: <GainBadge gain={gain} pct={gainPct} /></span>
                </div>
            )}
        </div>
    );
}

// ── Stock Detail ───────────────────────────────────────────────────────

function StockDetail({ investment, onBack }: { investment: Stock; onBack: () => void }) {
    const { data: transactions = [] } = useStockTransactions(investment.id);
    const { data: priceSnaps = [] } = useStockPriceSnapshots(investment.id);
    const deleteTransaction = useDeleteStockTransaction();
    const deletePriceSnap = useDeleteStockPriceSnapshot();
    const updateStock = useUpdateStock();
    const [showAddPurchase, setShowAddPurchase] = useState(false);
    const [editingCommission, setEditingCommission] = useState(false);
    const [commissionInput, setCommissionInput] = useState(String(investment.sellCommission));

    const sortedTxs = useMemo(
        () => [...transactions].sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()),
        [transactions]
    );

    const sortedSnaps = useMemo(
        () => [...priceSnaps].sort((a, b) => b.year - a.year || b.month - a.month),
        [priceSnaps]
    );

    const totalShares = computeTotalShares(transactions);
    const totalCost = computeTotalCost(transactions);
    const totalSharesCost = transactions.reduce((s, t) => s + t.quantity * t.priceUnit, 0);
    const totalCommissions = totalCost - totalSharesCost;
    const avgCostPerShare = totalShares > 0 ? totalCost / totalShares : 0;

    const latest = latestSnapshot(priceSnaps);
    const latestPrice = latest?.pricePerShare ?? 0;
    const latestValue = latestPrice > 0 ? latestPrice * totalShares : 0;
    const totalGain = latestValue > 0 ? latestValue - totalCost : null;
    const totalGainPct = totalGain != null && totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const sharesGain = latestValue > 0 ? latestValue - totalSharesCost : null;
    const sharesGainPct = sharesGain != null && totalSharesCost > 0 ? (sharesGain / totalSharesCost) * 100 : 0;
    const sellComm = investment.sellCommission;
    const netIfSold = totalGain !== null ? totalGain - sellComm : null;
    const netIfSoldPct = netIfSold !== null && totalCost > 0 ? (netIfSold / totalCost) * 100 : null;

    const handleSaveCommission = async () => {
        const val = parseInt(commissionInput);
        if (isNaN(val) || val < 0) return;
        await updateStock.mutateAsync({ id: investment.id, sellCommission: val });
        setEditingCommission(false);
    };

    const handleDeleteTx = async (id: string) => {
        if (!confirm("Delete this purchase?")) return;
        await deleteTransaction.mutateAsync(id);
    };

    const handleDeleteSnap = async (id: string) => {
        if (!confirm("Delete this value entry?")) return;
        await deletePriceSnap.mutateAsync(id);
    };

    return (
        <div>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <button onClick={onBack}
                    style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer", background: "#fff", color: "#374151", fontSize: 12, fontWeight: 600 }}>
                    ← Back
                </button>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: investment.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 15, color: "#1f2937" }}>{investment.name}</span>
            </div>

            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
                {/* Row 1: shares info */}
                {([
                    { label: "Total Shares", value: totalShares.toLocaleString(), color: "#3b82f6" },
                    { label: "Avg Buy Price", value: totalShares > 0 ? fmt(avgCostPerShare) : "—", color: "#7c3aed" },
                    { label: "Current Price/Share", value: latestPrice > 0 ? fmt(latestPrice) : "—", color: "#0891b2" },
                    { label: "Current Value", value: latestValue > 0 ? fmt(latestValue) : "—", color: "#059669" },
                ] as { label: string; value: React.ReactNode; color: string }[]).map(({ label, value, color }) => (
                    <div key={label} style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px #0001" }}>
                        <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
                    </div>
                ))}

                {/* Shares Cost card */}
                <div style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px #0001", borderTop: "3px solid #f59e0b" }}>
                    <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>SHARES COST <span style={{ color: "#9ca3af" }}>(sin comisión)</span></div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#f59e0b" }}>{fmt(totalSharesCost)}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Com. compra: {fmt(totalCommissions)}</div>
                    {sharesGain != null && (
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                            <GainBadge gain={sharesGain} pct={sharesGainPct} />
                        </div>
                    )}
                </div>

                {/* Cost Basis card */}
                <div style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px #0001", borderTop: "3px solid #6366f1" }}>
                    <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>COST BASIS <span style={{ color: "#9ca3af" }}>(con com. compra)</span></div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#6366f1" }}>{fmt(totalCost)}</div>
                    {totalGain != null && (
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                            <GainBadge gain={totalGain} pct={totalGainPct} />
                        </div>
                    )}
                </div>

                {/* Net if sold card */}
                <div style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px #0001", borderTop: "3px solid #dc2626" }}>
                    <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>
                        NET IF SOLD
                        <span style={{ color: "#9ca3af", marginLeft: 4 }}>
                            {editingCommission ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <input
                                        type="number"
                                        value={commissionInput}
                                        onChange={(e) => setCommissionInput(e.target.value)}
                                        style={{ width: 80, padding: "1px 4px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 11 }}
                                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveCommission(); if (e.key === "Escape") setEditingCommission(false); }}
                                        autoFocus
                                    />
                                    <button onClick={handleSaveCommission} style={{ fontSize: 10, color: "#059669", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>✓</button>
                                    <button onClick={() => setEditingCommission(false)} style={{ fontSize: 10, color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                                </span>
                            ) : (
                                <span
                                    onClick={() => { setCommissionInput(String(sellComm)); setEditingCommission(true); }}
                                    style={{ cursor: "pointer", textDecoration: "underline dotted", color: "#9ca3af" }}
                                    title="Click to edit sell commission"
                                >
                                    com. venta: {fmt(sellComm)}
                                </span>
                            )}
                        </span>
                    </div>
                    {netIfSold !== null && netIfSoldPct !== null ? (
                        <>
                            <div style={{ fontSize: 16, fontWeight: 700, color: netIfSold >= 0 ? "#059669" : "#dc2626" }}>
                                {netIfSold >= 0 ? "+" : ""}{fmt(netIfSold)}
                            </div>
                            <div style={{ fontSize: 11, marginTop: 2 }}>
                                <GainBadge gain={netIfSold} pct={netIfSoldPct} />
                            </div>
                        </>
                    ) : (
                        <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>—</div>
                    )}
                </div>
            </div>

            {/* Purchase History */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 4px #0001", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#1f2937" }}>Purchase History</span>
                    <button onClick={() => setShowAddPurchase(!showAddPurchase)}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "#7c3aed", color: "#fff", fontWeight: 600, fontSize: 12 }}>
                        + Add Purchase
                    </button>
                </div>

                {showAddPurchase && (
                    <AddPurchaseForm investmentId={investment.id} onClose={() => setShowAddPurchase(false)} />
                )}

                {latestPrice === 0 && sortedTxs.length > 0 && (
                    <div style={{ marginBottom: 10, fontSize: 12, color: "#92400e", background: "#fef3c7", borderRadius: 8, padding: "8px 12px" }}>
                        Current Value and Gain/Loss require a price entry in <strong>Monthly Value History</strong> below.
                    </div>
                )}
                {sortedTxs.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#9ca3af", padding: 24, fontSize: 13 }}>
                        No purchases recorded yet.
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: "#f9fafb" }}>
                                    <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>#</th>
                                    <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Date</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Shares</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Buy Price</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Commission</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#f59e0b" }}>Shares Cost</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#f59e0b" }}>G/L (sin com.)</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#6366f1" }}>Cost Basis</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#6366f1" }}>G/L (con com.)</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#059669", background: "#f0fdf4" }}>
                                        <div>Current Value</div>
                                        {latestPrice > 0 && <div style={{ fontSize: 10, fontWeight: 400, color: "#6b7280" }}>@ {fmt(latestPrice)}/share</div>}
                                    </th>
                                    <th style={{ padding: "8px 10px" }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedTxs.map((tx, i) => {
                                    const sharesCost = tx.quantity * tx.priceUnit;
                                    const costBasis = sharesCost + tx.commission;
                                    const batchCurrentValue = latestPrice > 0 ? latestPrice * tx.quantity : null;
                                    const sharesGainRow = batchCurrentValue != null ? batchCurrentValue - sharesCost : null;
                                    const sharesGainPctRow = sharesGainRow != null && sharesCost > 0 ? (sharesGainRow / sharesCost) * 100 : null;
                                    const gainTotal = batchCurrentValue != null ? batchCurrentValue - costBasis : null;
                                    const gainTotalPct = gainTotal != null && costBasis > 0 ? (gainTotal / costBasis) * 100 : null;
                                    return (
                                        <tr key={tx.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                                            <td style={{ padding: "8px 10px", fontWeight: 700, color: "#6b7280" }}>
                                                #{sortedTxs.length - i}
                                            </td>
                                            <td style={{ padding: "8px 10px" }}>
                                                <div>{new Date(tx.transactionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</div>
                                                {tx.notes && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{tx.notes}</div>}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#3b82f6" }}>
                                                {tx.quantity.toLocaleString()}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                                {fmt(tx.priceUnit)}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#f59e0b" }}>
                                                {fmt(tx.commission)}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#f59e0b" }}>
                                                {fmt(sharesCost)}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                                {sharesGainRow != null && sharesGainPctRow != null
                                                    ? <GainBadge gain={sharesGainRow} pct={sharesGainPctRow} />
                                                    : <span style={{ color: "#9ca3af" }}>—</span>}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#6366f1" }}>
                                                {fmt(costBasis)}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                                {gainTotal != null && gainTotalPct != null
                                                    ? <GainBadge gain={gainTotal} pct={gainTotalPct} />
                                                    : <span style={{ color: "#9ca3af" }}>—</span>}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#059669", fontWeight: 600, background: "#f0fdf4" }}>
                                                {batchCurrentValue != null ? fmt(batchCurrentValue) : <span style={{ color: "#9ca3af" }}>—</span>}
                                            </td>
                                            <td style={{ padding: "8px 10px" }}>
                                                <button onClick={() => handleDeleteTx(tx.id)} disabled={deleteTransaction.isPending}
                                                    style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #fee2e2", background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Monthly Value History */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 4px #0001" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1f2937", marginBottom: 12 }}>Monthly Value History</div>
                <AddPricePerShareForm investmentId={investment.id} totalShares={totalShares} totalCost={totalCost} />
                {sortedSnaps.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#9ca3af", padding: 16, fontSize: 13 }}>
                        No entries yet. Enter the current value of your holding above.
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: "#f9fafb" }}>
                                <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Month</th>
                                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Price / Share</th>
                                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Cost Basis</th>
                                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#059669" }}>Current Value</th>
                                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Gain / Loss</th>
                                <th style={{ padding: "8px 10px" }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedSnaps.map((snap) => {
                                const snapCurrentValue = snap.pricePerShare * totalShares;
                                const snapGain = snapCurrentValue - totalCost;
                                const snapGainPct = totalCost > 0 ? (snapGain / totalCost) * 100 : 0;
                                return (
                                    <tr key={snap.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                                        <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                                            {MONTHS[snap.month - 1]} {snap.year}
                                        </td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#0891b2", fontWeight: 600 }}>
                                            {fmt(snap.pricePerShare)}
                                        </td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#6b7280" }}>
                                            {fmt(totalCost)}
                                        </td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#059669" }}>
                                            {fmt(snapCurrentValue)}
                                        </td>
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                            <GainBadge gain={snapGain} pct={snapGainPct} />
                                        </td>
                                        <td style={{ padding: "8px 10px" }}>
                                            <button onClick={() => handleDeleteSnap(snap.id)} disabled={deletePriceSnap.isPending}
                                                style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #fee2e2", background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ── Stock List ─────────────────────────────────────────────────────────

function StockList({
    investments,
    allTransactions,
    allPriceSnapshots,
    onSelect,
}: {
    investments: Stock[];
    allTransactions: StockTransaction[];
    allPriceSnapshots: StockPriceSnapshot[];
    onSelect: (id: string) => void;
}) {
    const [showNewForm, setShowNewForm] = useState(false);
    const removeStock = useRemoveStock();

    const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        if (!confirm(`Delete stock "${name}"? This cannot be undone.`)) return;
        await removeStock.mutateAsync(id);
    };

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1f2937" }}>Stocks</span>
                <button onClick={() => setShowNewForm(!showNewForm)}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#7c3aed", color: "#fff", fontWeight: 600, fontSize: 12 }}>
                    + New Stock
                </button>
            </div>

            {showNewForm && <NewStockForm onClose={() => setShowNewForm(false)} />}

            {investments.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 10, padding: 32, textAlign: "center", color: "#9ca3af", boxShadow: "0 1px 4px #0001" }}>
                    <p style={{ margin: 0, fontSize: 14 }}>No stocks yet.</p>
                    <p style={{ margin: "6px 0 0", fontSize: 12 }}>Click &quot;+ New Stock&quot; to get started.</p>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                    {investments.map((inv) => {
                        const txs = allTransactions.filter((t) => t.investmentId === inv.id);
                        const snaps = allPriceSnapshots.filter((s) => s.investmentId === inv.id);
                        const latest = latestSnapshot(snaps);
                        const totalCost = computeTotalCost(txs);
                        const totalShares = computeTotalShares(txs);
                        const latestPrice = latest?.pricePerShare ?? 0;
                        const latestValue = latestPrice > 0 ? latestPrice * totalShares : 0;
                        const gain = latestValue > 0 ? latestValue - totalCost : null;
                        const gainPct = gain != null && totalCost > 0 ? (gain / totalCost) * 100 : 0;
                        const netIfSold = gain !== null ? gain - inv.sellCommission : null;
                        const netIfSoldPct = netIfSold !== null && totalCost > 0 ? (netIfSold / totalCost) * 100 : 0;

                        return (
                            <div key={inv.id} onClick={() => onSelect(inv.id)}
                                style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001", cursor: "pointer", borderLeft: `4px solid ${inv.color}` }}
                                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px #0002")}
                                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 4px #0001")}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ width: 10, height: 10, borderRadius: 3, background: inv.color, flexShrink: 0 }} />
                                        <span style={{ fontWeight: 700, fontSize: 14, color: "#1f2937" }}>{inv.name}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 11, color: "#9ca3af" }}>{txs.length} purchase{txs.length !== 1 ? "s" : ""}</span>
                                        <button
                                            onClick={(e) => handleDelete(e, inv.id, inv.name)}
                                            disabled={removeStock.isPending}
                                            style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #fee2e2", background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                            Delete
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>SHARES</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#3b82f6" }}>{totalShares.toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>TOTAL INVESTED</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>{fmt(totalCost)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>CURRENT VALUE</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>{latestValue > 0 ? fmt(latestValue) : "—"}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>GAIN / LOSS</div>
                                        <div style={{ fontSize: 14 }}>
                                            {gain != null ? <GainBadge gain={gain} pct={gainPct} /> : "—"}
                                        </div>
                                    </div>
                                    <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #f3f4f6", paddingTop: 8 }}>
                                        <div style={{ fontSize: 10, color: "#dc2626", fontWeight: 600 }}>NET IF SOLD <span style={{ color: "#9ca3af", fontWeight: 400 }}>(-{fmt(inv.sellCommission)} com.)</span></div>
                                        <div style={{ fontSize: 13 }}>
                                            {netIfSold != null ? <GainBadge gain={netIfSold} pct={netIfSoldPct} /> : "—"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Main Tab ───────────────────────────────────────────────────────────

export default function StockTransactionsTab() {
    const { data: stocks = [] } = useStocks();
    const { data: allTransactions = [] } = useStockTransactions();
    const { data: allPriceSnapshots = [] } = useStockPriceSnapshots();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const selectedStock = useMemo(
        () => stocks.find((s) => s.id === selectedId) ?? null,
        [stocks, selectedId]
    );

    if (selectedId && selectedStock) {
        return <StockDetail investment={selectedStock} onBack={() => setSelectedId(null)} />;
    }

    return (
        <StockList
            investments={stocks}
            allTransactions={allTransactions}
            allPriceSnapshots={allPriceSnapshots}
            onSelect={(id) => setSelectedId(id)}
        />
    );
}
