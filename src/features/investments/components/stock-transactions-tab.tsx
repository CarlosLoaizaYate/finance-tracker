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
    useStockSales,
    useAddStockSale,
    useDeleteStockSale,
    useStockPriceSnapshots,
    useUpsertStockPriceSnapshot,
    useDeleteStockPriceSnapshot,
    type Stock,
    type StockTransaction,
    type StockSale,
    type StockPriceSnapshot,
} from "@/hooks/use-finance-data";
import MoneyBase from "@/components/ui/money";
import { useTranslation } from "@/hooks/use-translation";

/** Stock-currency-aware wrapper: renders with the given stock's currency (COP or USD) instead of
 * always defaulting to COP, so a component handling a single stock can shadow this with its own
 * `currency` in scope and every plain `<Money amount={x} />` call below it just works. */
function Money({ amount, currency = "COP" }: { amount: number; currency?: "COP" | "USD" }) {
    return <MoneyBase amount={amount} currency={currency} />;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = ["#7c3aed", "#2563eb", "#059669", "#dc2626", "#d97706", "#0891b2", "#db2777", "#be185d", "#065f46", "#92400e"];

// ── Helpers ────────────────────────────────────────────────────────────

function latestSnapshot(snapshots: StockPriceSnapshot[]): StockPriceSnapshot | null {
    if (!snapshots.length) return null;
    return [...snapshots].sort((a, b) => b.year - a.year || b.month - a.month)[0];
}

interface StockLot { id: string; quantity: number; sharesCost: number; commissionCost: number }

/** FIFO-matches sales against buy lots (oldest shares sold first), so a sale realizes gain only
 * on the specific shares it closes out — not a blend of the whole position. Mirrors the crypto
 * FIFO pattern (see crypto-tab.tsx), but in a single currency since stocks are COP-native. */
function fifoStockLots(
    buys: Array<{ id: string; date: string; quantity: number; sharesCost: number; commissionCost: number }>,
    sells: Array<{ id: string; date: string; quantity: number; proceeds: number }>
) {
    type Event =
        | { type: "buy"; date: number; id: string; quantity: number; sharesCost: number; commissionCost: number }
        | { type: "sell"; date: number; id: string; quantity: number; proceeds: number };

    const events: Event[] = [
        ...buys.map(b => ({ type: "buy" as const, date: new Date(b.date).getTime(), id: b.id, quantity: b.quantity, sharesCost: b.sharesCost, commissionCost: b.commissionCost })),
        ...sells.map(s => ({ type: "sell" as const, date: new Date(s.date).getTime(), id: s.id, quantity: s.quantity, proceeds: s.proceeds })),
    ].sort((a, b) => a.date - b.date);

    const lots: StockLot[] = [];
    let realizedGain = 0;
    let totalProceeds = 0;
    const realizedGainBySaleId: Record<string, number> = {};

    for (const ev of events) {
        if (ev.type === "buy") {
            if (ev.quantity > 0) lots.push({ id: ev.id, quantity: ev.quantity, sharesCost: ev.sharesCost, commissionCost: ev.commissionCost });
        } else {
            let remaining = ev.quantity;
            let costBasis = 0;
            while (remaining > 0 && lots.length > 0) {
                const lot = lots[0];
                const consumed = Math.min(lot.quantity, remaining);
                const frac = consumed / lot.quantity;
                const consumedSharesCost = lot.sharesCost * frac;
                const consumedCommissionCost = lot.commissionCost * frac;
                costBasis += consumedSharesCost + consumedCommissionCost;
                lot.quantity -= consumed;
                lot.sharesCost -= consumedSharesCost;
                lot.commissionCost -= consumedCommissionCost;
                remaining -= consumed;
                if (lot.quantity <= 0) lots.shift();
            }
            totalProceeds += ev.proceeds;
            const gain = ev.proceeds - costBasis;
            realizedGain += gain;
            realizedGainBySaleId[ev.id] = gain;
        }
    }

    const heldShares = lots.reduce((s, l) => s + l.quantity, 0);
    const sharesCostHeld = lots.reduce((s, l) => s + l.sharesCost, 0);
    const commissionCostHeld = lots.reduce((s, l) => s + l.commissionCost, 0);
    const remainingByTxId: Record<string, number> = {};
    lots.forEach(l => { remainingByTxId[l.id] = (remainingByTxId[l.id] ?? 0) + l.quantity; });

    return { heldShares, sharesCostHeld, commissionCostHeld, realizedGain, totalProceeds, remainingByTxId, realizedGainBySaleId };
}

/** Single source of truth for "what do I actually still hold" once sales exist — held shares,
 * cost basis of only the unsold shares, and the cumulative realized gain from closed sales.
 * Exported so investments-tab.tsx and summary-tab.tsx don't each re-derive this by hand. */
export function computeStockPosition(txs: StockTransaction[], sales: StockSale[] = []) {
    const r = fifoStockLots(
        txs.map(t => ({ id: t.id, date: t.transactionDate, quantity: t.quantity, sharesCost: t.quantity * t.priceUnit, commissionCost: t.commission })),
        sales.map(s => ({ id: s.id, date: s.saleDate, quantity: s.quantity, proceeds: s.quantity * s.priceUnit - s.commission }))
    );
    return {
        heldShares: r.heldShares,
        sharesCostHeld: r.sharesCostHeld,
        costBasisHeld: r.sharesCostHeld + r.commissionCostHeld,
        realizedGain: r.realizedGain,
        totalProceeds: r.totalProceeds,
        remainingByTxId: r.remainingByTxId,
        realizedGainBySaleId: r.realizedGainBySaleId,
    };
}

function GainBadge({ gain, pct, currency = "COP" }: { gain: number; pct: number; currency?: "COP" | "USD" }) {
    const positive = gain >= 0;
    return (
        <span style={{ color: positive ? "#059669" : "#dc2626", fontWeight: 700, fontSize: 12 }}>
            {positive ? "+" : ""}{<MoneyBase amount={gain} currency={currency} />} ({positive ? "+" : ""}{pct.toFixed(2)}%)
        </span>
    );
}

// ── New Stock Form ─────────────────────────────────────────────────────

function NewStockForm({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const { data: types = [] } = useInvestmentTypes();
    const addStock = useAddStock();
    const addTransaction = useAddStockTransaction();

    const now = new Date();
    const [form, setForm] = useState({
        name: "",
        color: COLORS[0],
        currency: "COP" as "COP" | "USD",
        typeId: "",
        quantity: "",
        priceUnit: "",
        commission: "",
        transactionDate: now.toISOString().split("T")[0],
        notes: "",
    });
    const currency = form.currency;
    const Money = ({ amount }: { amount: number }) => <MoneyBase amount={amount} currency={currency} />;

    const qty = parseInt(form.quantity) || 0;
    const price = parseFloat(form.priceUnit) || 0;
    const commission = parseFloat(form.commission) || 0;
    const previewCost = qty * price + commission;

    const handleSave = async () => {
        if (!form.name.trim() || !form.typeId || !form.quantity || !form.priceUnit || !form.commission) {
            alert(t("stockTransactions.alertFillRequired"));
            return;
        }
        try {
            const inv = await addStock.mutateAsync({
                name: form.name.trim(),
                typeId: form.typeId,
                color: form.color,
                currency: form.currency,
            }) as Stock;

            await addTransaction.mutateAsync({
                investmentId: inv.id,
                quantity: qty,
                priceUnit: price,
                commission: commission,
                transactionDate: form.transactionDate,
                notes: form.notes,
            });

            onClose();
        } catch {
            alert(t("stockTransactions.alertCreateFailed"));
        }
    };

    const isPending = addStock.isPending || addTransaction.isPending;

    if (!types.length) {
        return (
            <div style={{ background: "#fef3c7", borderRadius: 10, padding: 16, marginBottom: 12, fontSize: 13, color: "#92400e" }}>
                {t("stockTransactions.noTypesFoundPre")} <strong>{t("stockTransactions.settingsInvestmentTypes")}</strong> {t("stockTransactions.noTypesFoundPost")}
                <button onClick={onClose} style={{ marginLeft: 12, fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>{t("stockTransactions.cancel")}</button>
            </div>
        );
    }

    return (
        <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 4px #0001" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>{t("stockTransactions.newStockTitle")}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.nameLabel")}</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Apple" style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 140 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.typeLabel")}</label>
                    <select value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })}
                        style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
                        <option value="">{t("stockTransactions.selectPlaceholder")}</option>
                        {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.colorLabel")}</label>
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        {COLORS.map((c) => (
                            <button key={c} onClick={() => setForm({ ...form, color: c })}
                                style={{ width: 20, height: 20, borderRadius: 4, background: c, border: form.color === c ? "2px solid #1f2937" : "2px solid transparent", cursor: "pointer" }} />
                        ))}
                    </div>
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.currencyLabel")}</label>
                    <div style={{ display: "inline-flex", border: "1px solid #d1d5db", borderRadius: 6, overflow: "hidden" }}>
                        {(["COP", "USD"] as const).map((c) => (
                            <button key={c} onClick={() => setForm({ ...form, currency: c })}
                                style={{
                                    padding: "6px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                                    background: form.currency === c ? "#7c3aed" : "transparent",
                                    color: form.currency === c ? "#fff" : "#6b7280",
                                }}>
                                {c}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{t("stockTransactions.initialPurchase")}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 6 }}>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.quantityLabel")}</label>
                    <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                        placeholder="10" style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 90 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.priceShareLabel")}</label>
                    <input type="number" step="any" value={form.priceUnit} onChange={(e) => setForm({ ...form, priceUnit: e.target.value })}
                        placeholder="2500" style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 110 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.commissionLabel")}</label>
                    <input type="number" step="any" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })}
                        placeholder="0" style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 100 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.dateLabel")}</label>
                    <input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                        style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.notesLabel")}</label>
                    <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder={t("stockTransactions.notesPlaceholderOptional")} style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: "100%" }} />
                </div>
            </div>
            {previewCost > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                    {t("stockTransactions.totalCostInline")} <strong style={{ color: "#1f2937" }}>{<Money amount={previewCost} />}</strong>
                </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={handleSave} disabled={isPending}
                    style={{ padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 12, opacity: isPending ? 0.6 : 1 }}>
                    {isPending ? t("stockTransactions.saving") : t("stockTransactions.save")}
                </button>
                <button onClick={onClose}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 12 }}>
                    {t("stockTransactions.cancel")}
                </button>
            </div>
        </div>
    );
}

// ── Add Purchase Form ──────────────────────────────────────────────────

function AddPurchaseForm({ investmentId, currency, onClose }: { investmentId: string; currency: "COP" | "USD"; onClose: () => void }) {
    const { t } = useTranslation();
    const addTransaction = useAddStockTransaction();
    const Money = ({ amount }: { amount: number }) => <MoneyBase amount={amount} currency={currency} />;
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
            alert(t("stockTransactions.alertFillRequired"));
            return;
        }
        try {
            await addTransaction.mutateAsync({
                investmentId,
                quantity: qty,
                priceUnit: price,
                commission: commission,
                transactionDate: form.transactionDate,
                notes: form.notes,
            });
            onClose();
        } catch {
            alert(t("stockTransactions.alertAddFailed"));
        }
    };

    return (
        <div style={{ background: "#f9fafb", borderRadius: 8, padding: 12, marginBottom: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "#374151" }}>{t("stockTransactions.addPurchaseTitle")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.quantityLabel")}</label>
                    <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                        placeholder="10" style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 80 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.priceShareLabel")}</label>
                    <input type="number" step="any" value={form.priceUnit} onChange={(e) => setForm({ ...form, priceUnit: e.target.value })}
                        placeholder="2500" style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 100 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.commissionLabel")}</label>
                    <input type="number" step="any" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })}
                        placeholder="0" style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 90 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.dateLabel")}</label>
                    <input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                        style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.notesLabel")}</label>
                    <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder={t("stockTransactions.notesPlaceholderOptional")} style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: "100%" }} />
                </div>
                <button onClick={handleSave} disabled={addTransaction.isPending}
                    style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 12, opacity: addTransaction.isPending ? 0.6 : 1 }}>
                    {addTransaction.isPending ? t("stockTransactions.saving") : t("stockTransactions.save")}
                </button>
                <button onClick={onClose}
                    style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 12 }}>
                    {t("stockTransactions.cancel")}
                </button>
            </div>
            {previewCost > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                    {t("stockTransactions.costBasisInline")} <strong style={{ color: "#1f2937" }}>{<Money amount={previewCost} />}</strong>
                </div>
            )}
        </div>
    );
}

// ── Add Sale Form ──────────────────────────────────────────────────────

function AddSaleForm({ investmentId, currency, availableShares, onClose }: { investmentId: string; currency: "COP" | "USD"; availableShares: number; onClose: () => void }) {
    const { t } = useTranslation();
    const addSale = useAddStockSale();
    const Money = ({ amount }: { amount: number }) => <MoneyBase amount={amount} currency={currency} />;
    const [form, setForm] = useState({
        quantity: "",
        priceUnit: "",
        commission: "",
        saleDate: new Date().toISOString().split("T")[0],
        notes: "",
    });

    const qty = parseInt(form.quantity) || 0;
    const price = parseFloat(form.priceUnit) || 0;
    const commission = parseFloat(form.commission) || 0;
    const previewProceeds = qty * price - commission;
    const qtyExceedsAvailable = qty > availableShares;

    const handleSave = async () => {
        if (!form.quantity || !form.priceUnit || !form.commission) {
            alert(t("stockTransactions.alertFillRequired"));
            return;
        }
        if (qtyExceedsAvailable) return;
        try {
            await addSale.mutateAsync({
                investmentId,
                quantity: qty,
                priceUnit: price,
                commission: commission,
                saleDate: form.saleDate,
                notes: form.notes,
            });
            onClose();
        } catch {
            alert(t("stockTransactions.alertAddSaleFailed"));
        }
    };

    return (
        <div style={{ background: "#fef2f2", borderRadius: 8, padding: 12, marginBottom: 12, border: "1px solid #fecaca" }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "#374151" }}>
                {t("stockTransactions.addSaleTitle")} <span style={{ color: "#9ca3af", fontWeight: 400 }}>{t("stockTransactions.availableSharesInline", { n: availableShares.toLocaleString() })}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.quantityLabel")}</label>
                    <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                        placeholder="10" style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 80 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.sellPriceShareLabel")}</label>
                    <input type="number" step="any" value={form.priceUnit} onChange={(e) => setForm({ ...form, priceUnit: e.target.value })}
                        placeholder="2500" style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 100 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.commissionLabel")}</label>
                    <input type="number" step="any" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })}
                        placeholder="0" style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 90 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.dateLabel")}</label>
                    <input type="date" value={form.saleDate} onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
                        style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.notesLabel")}</label>
                    <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder={t("stockTransactions.notesPlaceholderOptional")} style={{ display: "block", padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: "100%" }} />
                </div>
                <button onClick={handleSave} disabled={addSale.isPending || qtyExceedsAvailable}
                    style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: (addSale.isPending || qtyExceedsAvailable) ? "not-allowed" : "pointer", background: "#dc2626", color: "#fff", fontWeight: 600, fontSize: 12, opacity: (addSale.isPending || qtyExceedsAvailable) ? 0.6 : 1 }}>
                    {addSale.isPending ? t("stockTransactions.saving") : t("stockTransactions.save")}
                </button>
                <button onClick={onClose}
                    style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 12 }}>
                    {t("stockTransactions.cancel")}
                </button>
            </div>
            {qtyExceedsAvailable && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#dc2626" }}>
                    {t("stockTransactions.onlySharesAvailable", { n: availableShares.toLocaleString() })}
                </div>
            )}
            {!qtyExceedsAvailable && previewProceeds > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                    {t("stockTransactions.proceedsInline")} <strong style={{ color: "#1f2937" }}>{<Money amount={previewProceeds} />}</strong>
                </div>
            )}
        </div>
    );
}

// ── Add Price Per Share Form ───────────────────────────────────────────

function AddPricePerShareForm({ investmentId, currency, totalShares, totalCost }: { investmentId: string; currency: "COP" | "USD"; totalShares: number; totalCost: number }) {
    const { t } = useTranslation();
    const upsert = useUpsertStockPriceSnapshot();
    const Money = ({ amount }: { amount: number }) => <MoneyBase amount={amount} currency={currency} />;
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
                pricePerShare,
            });
            setPrice("");
        } catch (err) {
            console.error("[AddPricePerShareForm]", err);
            alert(t("stockTransactions.alertSaveFailed", { error: err instanceof Error ? err.message : String(err) }));
        }
    };

    return (
        <div style={{ background: "#f9fafb", borderRadius: 8, padding: 12, marginBottom: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.monthLabel")}</label>
                    <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
                        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.yearLabel")}</label>
                    <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))}
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 80 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>{t("stockTransactions.priceShareRequiredLabel")}</label>
                    <input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)}
                        placeholder="e.g. 3200"
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 120 }} />
                </div>
                <button onClick={handleSave} disabled={upsert.isPending || !price || pricePerShare <= 0}
                    style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#7c3aed", color: "#fff", fontWeight: 600, fontSize: 12, opacity: (upsert.isPending || !price) ? 0.6 : 1 }}>
                    {upsert.isPending ? t("stockTransactions.saving") : t("stockTransactions.save")}
                </button>
            </div>
            {currentValue != null && gain != null && gainPct != null && (
                <div style={{ marginTop: 8, fontSize: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span style={{ color: "#6b7280" }}>{t("stockTransactions.currentValueInline")} <strong style={{ color: "#059669" }}>{<Money amount={currentValue} />}</strong></span>
                    <span style={{ color: "#6b7280" }}>{t("stockTransactions.investedInline")} <strong style={{ color: "#1f2937" }}>{<Money amount={totalCost} />}</strong></span>
                    <span style={{ color: "#6b7280" }}>{t("stockTransactions.gainLossInline")} <GainBadge gain={gain} pct={gainPct} currency={currency} /></span>
                </div>
            )}
        </div>
    );
}

// ── Stock Detail ───────────────────────────────────────────────────────

function StockDetail({ investment, onBack }: { investment: Stock; onBack: () => void }) {
    const { t } = useTranslation();
    const currency = investment.currency;
    const Money = ({ amount }: { amount: number }) => <MoneyBase amount={amount} currency={currency} />;
    const { data: transactions = [] } = useStockTransactions(investment.id);
    const { data: sales = [] } = useStockSales(investment.id);
    const { data: priceSnaps = [] } = useStockPriceSnapshots(investment.id);
    const deleteTransaction = useDeleteStockTransaction();
    const deleteSale = useDeleteStockSale();
    const deletePriceSnap = useDeleteStockPriceSnapshot();
    const updateStock = useUpdateStock();
    const [showAddPurchase, setShowAddPurchase] = useState(false);
    const [showAddSale, setShowAddSale] = useState(false);
    const [editingCommission, setEditingCommission] = useState(false);
    const [commissionInput, setCommissionInput] = useState(String(investment.sellCommission));

    const sortedTxs = useMemo(
        () => [...transactions].sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()),
        [transactions]
    );

    const sortedSales = useMemo(
        () => [...sales].sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()),
        [sales]
    );

    const sortedSnaps = useMemo(
        () => [...priceSnaps].sort((a, b) => b.year - a.year || b.month - a.month),
        [priceSnaps]
    );

    const position = useMemo(() => computeStockPosition(transactions, sales), [transactions, sales]);
    const { heldShares: totalShares, sharesCostHeld: totalSharesCost, costBasisHeld: totalCost, realizedGain, totalProceeds, remainingByTxId } = position;
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
    const realizedGainPct = totalProceeds > 0 ? (realizedGain / (totalProceeds - realizedGain)) * 100 : 0;

    const handleSaveCommission = async () => {
        const val = parseFloat(commissionInput);
        if (isNaN(val) || val < 0) return;
        await updateStock.mutateAsync({ id: investment.id, sellCommission: val });
        setEditingCommission(false);
    };

    const handleDeleteTx = async (id: string) => {
        if (!confirm(t("stockTransactions.confirmDeletePurchase"))) return;
        await deleteTransaction.mutateAsync(id);
    };

    const handleDeleteSale = async (id: string) => {
        if (!confirm(t("stockTransactions.confirmDeleteSale"))) return;
        await deleteSale.mutateAsync(id);
    };

    const handleDeleteSnap = async (id: string) => {
        if (!confirm(t("stockTransactions.confirmDeleteValueEntry"))) return;
        await deletePriceSnap.mutateAsync(id);
    };

    return (
        <div>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <button onClick={onBack}
                    style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer", background: "#fff", color: "#374151", fontSize: 12, fontWeight: 600 }}>
                    {t("stockTransactions.back")}
                </button>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: investment.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 15, color: "#1f2937" }}>{investment.name}</span>
            </div>

            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
                {/* Row 1: shares info */}
                {([
                    { label: t("stockTransactions.statTotalShares"), value: totalShares.toLocaleString(), color: "#3b82f6" },
                    { label: t("stockTransactions.statAvgBuyPrice"), value: totalShares > 0 ? <Money amount={avgCostPerShare} /> : "—", color: "#7c3aed" },
                    { label: t("stockTransactions.statCurrentPriceShare"), value: latestPrice > 0 ? <Money amount={latestPrice} /> : "—", color: "#0891b2" },
                    { label: t("stockTransactions.statCurrentValue"), value: latestValue > 0 ? <Money amount={latestValue} /> : "—", color: "#059669" },
                ] as { label: string; value: React.ReactNode; color: string }[]).map(({ label, value, color }) => (
                    <div key={label} style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px #0001" }}>
                        <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
                    </div>
                ))}

                {/* Shares Cost card */}
                <div style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px #0001", borderTop: "3px solid #f59e0b" }}>
                    <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>{t("stockTransactions.sharesCostLabel")} <span style={{ color: "#9ca3af" }}>{t("stockTransactions.noCommissionParen")}</span></div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#f59e0b" }}>{<Money amount={totalSharesCost} />}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{t("stockTransactions.purchaseCommissionInline")} {<Money amount={totalCommissions} />}</div>
                    {sharesGain != null && (
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                            <GainBadge gain={sharesGain} pct={sharesGainPct} currency={currency} />
                        </div>
                    )}
                </div>

                {/* Cost Basis card */}
                <div style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px #0001", borderTop: "3px solid #6366f1" }}>
                    <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>{t("stockTransactions.costBasisLabel")} <span style={{ color: "#9ca3af" }}>{t("stockTransactions.costBasisSubtitle")}</span></div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#6366f1" }}>{<Money amount={totalCost} />}</div>
                    {totalGain != null && (
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                            <GainBadge gain={totalGain} pct={totalGainPct} currency={currency} />
                        </div>
                    )}
                </div>

                {/* Net if sold card */}
                <div style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px #0001", borderTop: "3px solid #dc2626" }}>
                    <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>
                        {t("stockTransactions.netIfSoldLabel")}
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
                                    title={t("stockTransactions.editCommissionTitle")}
                                >
                                    {t("stockTransactions.sellCommissionPrefix")} {<Money amount={sellComm} />}
                                </span>
                            )}
                        </span>
                    </div>
                    {netIfSold !== null && netIfSoldPct !== null ? (
                        <>
                            <div style={{ fontSize: 16, fontWeight: 700, color: netIfSold >= 0 ? "#059669" : "#dc2626" }}>
                                {netIfSold >= 0 ? "+" : ""}{<Money amount={netIfSold} />}
                            </div>
                            <div style={{ fontSize: 11, marginTop: 2 }}>
                                <GainBadge gain={netIfSold} pct={netIfSoldPct} currency={currency} />
                            </div>
                        </>
                    ) : (
                        <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>—</div>
                    )}
                </div>

                {/* Realized gain card (from closed sales) */}
                <div style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px #0001", borderTop: "3px solid #059669" }}>
                    <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>{t("stockTransactions.realizedGainLabel")}</div>
                    {sales.length > 0 ? (
                        <div style={{ fontSize: 16, fontWeight: 700, color: realizedGain >= 0 ? "#059669" : "#dc2626" }}>
                            {realizedGain >= 0 ? "+" : ""}{<Money amount={realizedGain} />}
                            <span style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af", marginLeft: 4 }}>
                                ({realizedGain >= 0 ? "+" : ""}{realizedGainPct.toFixed(2)}%)
                            </span>
                        </div>
                    ) : (
                        <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>—</div>
                    )}
                </div>
            </div>

            {/* Purchase History */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 4px #0001", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#1f2937" }}>{t("stockTransactions.purchaseHistoryTitle")}</span>
                    <button onClick={() => setShowAddPurchase(!showAddPurchase)}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "#7c3aed", color: "#fff", fontWeight: 600, fontSize: 12 }}>
                        {t("stockTransactions.addPurchaseButton")}
                    </button>
                </div>

                {showAddPurchase && (
                    <AddPurchaseForm investmentId={investment.id} currency={currency} onClose={() => setShowAddPurchase(false)} />
                )}

                {latestPrice === 0 && sortedTxs.length > 0 && (
                    <div style={{ marginBottom: 10, fontSize: 12, color: "#92400e", background: "#fef3c7", borderRadius: 8, padding: "8px 12px" }}>
                        {t("stockTransactions.valueRequiresPricePre")} <strong>{t("stockTransactions.monthlyValueHistoryTitle")}</strong> {t("stockTransactions.valueRequiresPricePost")}
                    </div>
                )}
                {sortedTxs.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#9ca3af", padding: 24, fontSize: 13 }}>
                        {t("stockTransactions.noPurchasesYet")}
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: "#f9fafb" }}>
                                    <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colHash")}</th>
                                    <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colDate")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colShares")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colBuyPrice")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colCommission")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#f59e0b" }}>{t("stockTransactions.colSharesCost")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#f59e0b" }}>{t("stockTransactions.colGlNoCommission")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#6366f1" }}>{t("stockTransactions.colCostBasis")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#6366f1" }}>{t("stockTransactions.colGlWithCommission")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#059669", background: "#f0fdf4" }}>
                                        <div>{t("stockTransactions.colCurrentValue")}</div>
                                        {latestPrice > 0 && <div style={{ fontSize: 10, fontWeight: 400, color: "#6b7280" }}>@ {<Money amount={latestPrice} />}{t("stockTransactions.perShare")}</div>}
                                    </th>
                                    <th style={{ padding: "8px 10px" }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedTxs.map((tx, i) => {
                                    const remainingQty = remainingByTxId[tx.id] ?? tx.quantity;
                                    const soldQty = tx.quantity - remainingQty;
                                    const sharesCost = remainingQty * tx.priceUnit;
                                    const commissionRemaining = tx.quantity > 0 ? tx.commission * (remainingQty / tx.quantity) : 0;
                                    const costBasis = sharesCost + commissionRemaining;
                                    const batchCurrentValue = latestPrice > 0 ? latestPrice * remainingQty : null;
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
                                                {soldQty > 0 && <div style={{ fontSize: 10, color: "#dc2626", marginTop: 2 }}>{t("stockTransactions.soldOfLotInline", { sold: soldQty.toLocaleString() })}</div>}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#3b82f6" }}>
                                                {remainingQty.toLocaleString()}{soldQty > 0 && <span style={{ color: "#9ca3af", fontWeight: 400 }}> / {tx.quantity.toLocaleString()}</span>}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                                {<Money amount={tx.priceUnit} />}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#f59e0b" }}>
                                                {<Money amount={tx.commission} />}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#f59e0b" }}>
                                                {<Money amount={sharesCost} />}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                                {sharesGainRow != null && sharesGainPctRow != null
                                                    ? <GainBadge gain={sharesGainRow} pct={sharesGainPctRow} currency={currency} />
                                                    : <span style={{ color: "#9ca3af" }}>—</span>}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#6366f1" }}>
                                                {<Money amount={costBasis} />}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                                {gainTotal != null && gainTotalPct != null
                                                    ? <GainBadge gain={gainTotal} pct={gainTotalPct} currency={currency} />
                                                    : <span style={{ color: "#9ca3af" }}>—</span>}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#059669", fontWeight: 600, background: "#f0fdf4" }}>
                                                {batchCurrentValue != null ? <Money amount={batchCurrentValue} /> : <span style={{ color: "#9ca3af" }}>—</span>}
                                            </td>
                                            <td style={{ padding: "8px 10px" }}>
                                                <button onClick={() => handleDeleteTx(tx.id)} disabled={deleteTransaction.isPending}
                                                    style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #fee2e2", background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                                    {t("stockTransactions.deleteAction")}
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

            {/* Sales History */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 4px #0001", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#1f2937" }}>{t("stockTransactions.salesHistoryTitle")}</span>
                    <button onClick={() => setShowAddSale(!showAddSale)} disabled={totalShares === 0}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "none", cursor: totalShares === 0 ? "not-allowed" : "pointer", background: "#dc2626", color: "#fff", fontWeight: 600, fontSize: 12, opacity: totalShares === 0 ? 0.5 : 1 }}>
                        {t("stockTransactions.addSaleButton")}
                    </button>
                </div>

                {showAddSale && (
                    <AddSaleForm investmentId={investment.id} currency={currency} availableShares={totalShares} onClose={() => setShowAddSale(false)} />
                )}

                {sortedSales.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#9ca3af", padding: 24, fontSize: 13 }}>
                        {t("stockTransactions.noSalesYet")}
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: "#f9fafb" }}>
                                    <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colDate")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colShares")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colSellPrice")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colCommission")}</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#059669" }}>{t("stockTransactions.colProceeds")}</th>
                                    <th style={{ padding: "8px 10px" }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedSales.map(sale => {
                                    const proceeds = sale.quantity * sale.priceUnit - sale.commission;
                                    return (
                                        <tr key={sale.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                                            <td style={{ padding: "8px 10px" }}>
                                                <div>{new Date(sale.saleDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</div>
                                                {sale.notes && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{sale.notes}</div>}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#3b82f6" }}>
                                                {sale.quantity.toLocaleString()}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                                {<Money amount={sale.priceUnit} />}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#f59e0b" }}>
                                                {<Money amount={sale.commission} />}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#059669" }}>
                                                {<Money amount={proceeds} />}
                                            </td>
                                            <td style={{ padding: "8px 10px" }}>
                                                <button onClick={() => handleDeleteSale(sale.id)} disabled={deleteSale.isPending}
                                                    style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #fee2e2", background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                                    {t("stockTransactions.deleteAction")}
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
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1f2937", marginBottom: 12 }}>{t("stockTransactions.monthlyValueHistoryTitle")}</div>
                <AddPricePerShareForm investmentId={investment.id} currency={currency} totalShares={totalShares} totalCost={totalCost} />
                {sortedSnaps.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#9ca3af", padding: 16, fontSize: 13 }}>
                        {t("stockTransactions.noValueEntriesYet")}
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: "#f9fafb" }}>
                                <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colMonth")}</th>
                                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colPriceShare")}</th>
                                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colCostBasis")}</th>
                                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#059669" }}>{t("stockTransactions.colCurrentValue")}</th>
                                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>{t("stockTransactions.colGainLoss")}</th>
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
                                            {<Money amount={snap.pricePerShare} />}
                                        </td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#6b7280" }}>
                                            {<Money amount={totalCost} />}
                                        </td>
                                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#059669" }}>
                                            {<Money amount={snapCurrentValue} />}
                                        </td>
                                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                            <GainBadge gain={snapGain} pct={snapGainPct} currency={currency} />
                                        </td>
                                        <td style={{ padding: "8px 10px" }}>
                                            <button onClick={() => handleDeleteSnap(snap.id)} disabled={deletePriceSnap.isPending}
                                                style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #fee2e2", background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                                {t("stockTransactions.deleteAction")}
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
    allSales,
    allPriceSnapshots,
    onSelect,
}: {
    investments: Stock[];
    allTransactions: StockTransaction[];
    allSales: StockSale[];
    allPriceSnapshots: StockPriceSnapshot[];
    onSelect: (id: string) => void;
}) {
    const { t } = useTranslation();
    const [showNewForm, setShowNewForm] = useState(false);
    const removeStock = useRemoveStock();

    const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        if (!confirm(t("stockTransactions.confirmDeleteStock", { name }))) return;
        await removeStock.mutateAsync(id);
    };

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1f2937" }}>{t("stockTransactions.stocksTitle")}</span>
                <button onClick={() => setShowNewForm(!showNewForm)}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#7c3aed", color: "#fff", fontWeight: 600, fontSize: 12 }}>
                    {t("stockTransactions.newStockButton")}
                </button>
            </div>

            {showNewForm && <NewStockForm onClose={() => setShowNewForm(false)} />}

            {investments.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 10, padding: 32, textAlign: "center", color: "#9ca3af", boxShadow: "0 1px 4px #0001" }}>
                    <p style={{ margin: 0, fontSize: 14 }}>{t("stockTransactions.noStocksYet")}</p>
                    <p style={{ margin: "6px 0 0", fontSize: 12 }}>{t("stockTransactions.clickNewStock")}</p>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                    {investments.map((inv) => {
                        const txs = allTransactions.filter((t) => t.investmentId === inv.id);
                        const sales = allSales.filter((s) => s.investmentId === inv.id);
                        const snaps = allPriceSnapshots.filter((s) => s.investmentId === inv.id);
                        const latest = latestSnapshot(snaps);
                        const { heldShares: totalShares, costBasisHeld: totalCost } = computeStockPosition(txs, sales);
                        const latestPrice = latest?.pricePerShare ?? 0;
                        const latestValue = latestPrice > 0 ? latestPrice * totalShares : 0;
                        const gain = latestValue > 0 ? latestValue - totalCost : null;
                        const gainPct = gain != null && totalCost > 0 ? (gain / totalCost) * 100 : 0;
                        const netIfSold = gain !== null ? gain - inv.sellCommission : null;
                        const netIfSoldPct = netIfSold !== null && totalCost > 0 ? (netIfSold / totalCost) * 100 : 0;
                        const currency = inv.currency;
                        const Money = ({ amount }: { amount: number }) => <MoneyBase amount={amount} currency={currency} />;

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
                                        <span style={{ fontSize: 11, color: "#9ca3af" }}>{txs.length} {txs.length !== 1 ? t("stockTransactions.purchasePlural") : t("stockTransactions.purchaseSingular")}</span>
                                        <button
                                            onClick={(e) => handleDelete(e, inv.id, inv.name)}
                                            disabled={removeStock.isPending}
                                            style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #fee2e2", background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                            {t("stockTransactions.deleteAction")}
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>{t("stockTransactions.statShares")}</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#3b82f6" }}>{totalShares.toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>{t("stockTransactions.statTotalInvested")}</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>{<Money amount={totalCost} />}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>{t("stockTransactions.statCurrentValueCaps")}</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>{latestValue > 0 ? <Money amount={latestValue} /> : "—"}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>{t("stockTransactions.statGainLossCaps")}</div>
                                        <div style={{ fontSize: 14 }}>
                                            {gain != null ? <GainBadge gain={gain} pct={gainPct} currency={currency} /> : "—"}
                                        </div>
                                    </div>
                                    <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #f3f4f6", paddingTop: 8 }}>
                                        <div style={{ fontSize: 10, color: "#dc2626", fontWeight: 600 }}>{t("stockTransactions.statNetIfSold")} <span style={{ color: "#9ca3af", fontWeight: 400 }}>(-{<Money amount={inv.sellCommission} />} {t("stockTransactions.commissionAbbrev")})</span></div>
                                        <div style={{ fontSize: 13 }}>
                                            {netIfSold != null ? <GainBadge gain={netIfSold} pct={netIfSoldPct} currency={currency} /> : "—"}
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
    const { data: allSales = [] } = useStockSales();
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
            allSales={allSales}
            allPriceSnapshots={allPriceSnapshots}
            onSelect={(id) => setSelectedId(id)}
        />
    );
}
