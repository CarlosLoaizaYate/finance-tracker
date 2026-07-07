"use client";

import { useState, useMemo } from "react";
import {
    useFunds,
    useAddFund,
    useDeleteFund,
    useUpsertFundSnapshot,
    useDeleteFundSnapshot,
    useInvestmentTypes,
    type Fund,
    type FundSnapshot,
} from "@/hooks/use-finance-data";
import Money from "@/components/ui/money";

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = ["#7c3aed", "#2563eb", "#059669", "#dc2626", "#d97706", "#0891b2", "#db2777", "#be185d", "#065f46", "#92400e"];

// ── Helpers ────────────────────────────────────────────────────────────

function absMonth(year: number, month: number) {
    return year * 12 + month;
}

function GainBadge({ gain, pct }: { gain: number; pct: number }) {
    const pos = gain >= 0;
    return (
        <span style={{ color: pos ? "#059669" : "#dc2626", fontWeight: 700, fontSize: 12 }}>
            {pos ? "+" : ""}{<Money amount={gain} />} ({pos ? "+" : ""}{pct.toFixed(2)}%)
        </span>
    );
}

// Cumulative invested strictly before a date (for form preview — no id/createdAt available yet).
function cumulativeInvestedBefore(baseCapital: number, snapshots: FundSnapshot[], year: number, month: number, day: number): number {
    return baseCapital + snapshots
        .filter((s) => {
            const sAbs = absMonth(s.year, s.month);
            const tAbs = absMonth(year, month);
            return sAbs < tAbs || (sAbs === tAbs && s.day < day);
        })
        .reduce((sum, s) => sum + s.contribution, 0);
}

// Build a map of { snapId → cumulative invested up to that entry } using chronological order.
// Uses createdAt as tiebreaker for same day; avoids timestamp precision issues by falling back to id.
function buildInvestedMap(baseCapital: number, snapshots: FundSnapshot[]): Map<string, number> {
    const sorted = [...snapshots].sort((a, b) => {
        const mDiff = absMonth(a.year, a.month) - absMonth(b.year, b.month);
        if (mDiff !== 0) return mDiff;
        const dDiff = a.day - b.day;
        if (dDiff !== 0) return dDiff;
        const tDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return tDiff !== 0 ? tDiff : a.id.localeCompare(b.id);
    });
    const map = new Map<string, number>();
    let running = baseCapital;
    for (const s of sorted) {
        running += s.contribution;
        map.set(s.id, running);
    }
    return map;
}

// ── New Fund Form ──────────────────────────────────────────────────────

function NewFundForm({ onClose }: { onClose: () => void }) {
    const addFund = useAddFund();
    const { data: investmentTypes = [] } = useInvestmentTypes();
    const today = new Date().toISOString().split("T")[0];
    const [form, setForm] = useState({ name: "", color: COLORS[0], baseCapital: "", typeId: "", startDate: today });

    const handleSave = async () => {
        if (!form.name.trim() || !form.baseCapital) {
            alert("Fill in all required fields");
            return;
        }
        try {
            await addFund.mutateAsync({
                name: form.name.trim(),
                color: form.color,
                baseCapital: parseFloat(form.baseCapital),
                ...(form.typeId ? { typeId: form.typeId } : {}),
                startDate: form.startDate || today,
            });
            onClose();
        } catch (err) {
            alert("Failed to create fund: " + (err instanceof Error ? err.message : String(err)));
        }
    };

    return (
        <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 4px #0001" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>New Fund</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Name *</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Fiduciaria XYZ"
                        style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 200 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Base Capital *</label>
                    <input type="number" value={form.baseCapital} onChange={(e) => setForm({ ...form, baseCapital: e.target.value })}
                        placeholder="e.g. 1000000"
                        style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 150 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Start Date *</label>
                    <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                        style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Investment Type</label>
                    <select value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })}
                        style={{ display: "block", padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 160 }}>
                        <option value="">— None —</option>
                        {investmentTypes.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
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
                <button onClick={handleSave} disabled={addFund.isPending}
                    style={{ padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: "#10b981", color: "#fff", fontWeight: 600, fontSize: 12, opacity: addFund.isPending ? 0.6 : 1 }}>
                    {addFund.isPending ? "Saving…" : "Save"}
                </button>
                <button onClick={onClose}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 12 }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ── Add Monthly Entry Form ─────────────────────────────────────────────

function AddEntryForm({ fund }: { fund: Fund }) {
    const upsert = useUpsertFundSnapshot();
    const now = new Date();
    const [day, setDay] = useState(now.getDate());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [capitalAdded, setCapitalAdded] = useState("");
    const [currentValue, setCurrentValue] = useState("");

    const enteredCapital = parseFloat(capitalAdded) || 0;
    const enteredValue = parseFloat(currentValue) || 0;

    const priorInvested = cumulativeInvestedBefore(fund.baseCapital, fund.snapshots, year, month, day);
    const totalInvested = priorInvested + enteredCapital;
    const gain = enteredValue > 0 ? enteredValue - totalInvested : null;
    const gainPct = gain != null && totalInvested > 0 ? (gain / totalInvested) * 100 : null;

    const handleSave = async () => {
        if (!currentValue || enteredValue <= 0) {
            alert("Enter the current value");
            return;
        }
        try {
            await upsert.mutateAsync({
                fundId: fund.id,
                day,
                month,
                year,
                currentValue: Math.round(enteredValue),
                contribution: Math.round(enteredCapital),
            });
            setCapitalAdded("");
            setCurrentValue("");
        } catch (err) {
            alert("Failed to save: " + (err instanceof Error ? err.message : String(err)));
        }
    };

    return (
        <div style={{ background: "#f9fafb", borderRadius: 8, padding: 12, marginBottom: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#374151", marginBottom: 8 }}>Add Entry</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Day</label>
                    <input type="number" value={day} min={1} max={31} onChange={(e) => setDay(parseInt(e.target.value) || 1)}
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 60 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Month</label>
                    <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
                        {MONTHS_EN.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Year</label>
                    <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))}
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 80 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Capital Added</label>
                    <input type="number" value={capitalAdded} onChange={(e) => setCapitalAdded(e.target.value)}
                        placeholder="0"
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 130 }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Current Value *</label>
                    <input type="number" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)}
                        placeholder="e.g. 1350000"
                        style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12, width: 140 }} />
                </div>
                <button onClick={handleSave} disabled={upsert.isPending || !currentValue}
                    style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#7c3aed", color: "#fff", fontWeight: 600, fontSize: 12, opacity: (upsert.isPending || !currentValue) ? 0.6 : 1 }}>
                    {upsert.isPending ? "Saving…" : "Save"}
                </button>
            </div>
            {enteredValue > 0 && gain != null && gainPct != null && (
                <div style={{ marginTop: 8, fontSize: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span style={{ color: "#6b7280" }}>Total invested: <strong style={{ color: "#1f2937" }}>{<Money amount={totalInvested} />}</strong></span>
                    <span style={{ color: "#6b7280" }}>Gain / Loss: <GainBadge gain={gain} pct={gainPct} /></span>
                </div>
            )}
        </div>
    );
}

// ── Fund Detail ────────────────────────────────────────────────────────

function FundDetail({ fund, onBack, onDelete }: { fund: Fund; onBack: () => void; onDelete: () => void }) {
    const deleteSnapshot = useDeleteFundSnapshot();

    const snapshots = useMemo(
        () => [...fund.snapshots].sort((a, b) => {
            const mDiff = absMonth(b.year, b.month) - absMonth(a.year, a.month);
            if (mDiff !== 0) return mDiff;
            const dDiff = b.day - a.day;
            if (dDiff !== 0) return dDiff;
            const tDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            return tDiff !== 0 ? tDiff : b.id.localeCompare(a.id);
        }),
        [fund.snapshots]
    );

    const investedBySnapId = useMemo(
        () => buildInvestedMap(fund.baseCapital, fund.snapshots),
        [fund.baseCapital, fund.snapshots]
    );

    const totalContribs = snapshots.reduce((s, x) => s + x.contribution, 0);
    const totalInvested = fund.baseCapital + totalContribs;
    const latestSnap = snapshots[0];
    const currentValue = latestSnap?.currentValue ?? 0;
    const gain = currentValue > 0 ? currentValue - totalInvested : null;
    const gainPct = gain != null && totalInvested > 0 ? (gain / totalInvested) * 100 : 0;

    const handleDeleteSnap = async (id: string) => {
        if (!confirm("Delete this entry?")) return;
        await deleteSnapshot.mutateAsync(id);
    };

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <button onClick={onBack}
                    style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer", background: "#fff", color: "#374151", fontSize: 12, fontWeight: 600 }}>
                    ← Back
                </button>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: fund.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 15, color: "#1f2937" }}>{fund.name}</span>
                {fund.type && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed", background: "#f3f0ff", borderRadius: 4, padding: "2px 8px" }}>
                        {fund.type.name}
                    </span>
                )}
                <button onClick={onDelete}
                    style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 6, border: "1px solid #fee2e2", background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                    Delete fund
                </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
                {([
                    { label: "Start Date", value: new Date(fund.startDate).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }), color: "#6b7280" },
                    { label: "Base Capital", value: <Money amount={fund.baseCapital} />, color: "#6b7280" },
                    { label: "Total Contributions", value: <Money amount={totalContribs} />, color: "#f59e0b" },
                    { label: "Total Invested", value: <Money amount={totalInvested} />, color: "#7c3aed" },
                    { label: "Current Value", value: currentValue > 0 ? <Money amount={currentValue} /> : "—", color: "#059669" },
                    { label: "Gain / Loss", value: gain != null ? <GainBadge gain={gain} pct={gainPct} /> : "—", color: gain != null && gain >= 0 ? "#059669" : "#dc2626" },
                ] as { label: string; value: React.ReactNode; color: string }[]).map(({ label, value, color }) => (
                    <div key={label} style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 1px 4px #0001" }}>
                        <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
                    </div>
                ))}
            </div>

            <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 4px #0001" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1f2937", marginBottom: 12 }}>Monthly History</div>
                <AddEntryForm fund={fund} />
                {snapshots.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#9ca3af", padding: 24, fontSize: 13 }}>
                        No entries yet. Add the first monthly record above.
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: "#f9fafb" }}>
                                    <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Date</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Capital Added</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Current Value</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Total Invested</th>
                                    <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Gain / Loss</th>
                                    <th style={{ padding: "8px 10px" }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {snapshots.map((snap) => {
                                    const invAtSnap = investedBySnapId.get(snap.id) ?? fund.baseCapital;
                                    const snapGain = snap.currentValue - invAtSnap;
                                    const snapGainPct = invAtSnap > 0 ? (snapGain / invAtSnap) * 100 : 0;
                                    return (
                                        <tr key={snap.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                                            <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                                                {snap.day} {MONTHS_EN[snap.month - 1]} {snap.year}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", color: snap.contribution > 0 ? "#f59e0b" : "#9ca3af" }}>
                                                {snap.contribution > 0 ? <>+<Money amount={snap.contribution} /></> : "—"}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#059669" }}>
                                                {<Money amount={snap.currentValue} />}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#7c3aed" }}>
                                                {<Money amount={invAtSnap} />}
                                            </td>
                                            <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                                <GainBadge gain={snapGain} pct={snapGainPct} />
                                            </td>
                                            <td style={{ padding: "8px 10px" }}>
                                                <button onClick={() => handleDeleteSnap(snap.id)} disabled={deleteSnapshot.isPending}
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
        </div>
    );
}

// ── Fund List ──────────────────────────────────────────────────────────

function FundList({ funds, onSelect, onDelete }: { funds: Fund[]; onSelect: (id: string) => void; onDelete: (id: string) => void }) {
    const [showNewForm, setShowNewForm] = useState(false);

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1f2937" }}>Funds</span>
                <button onClick={() => setShowNewForm(!showNewForm)}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#7c3aed", color: "#fff", fontWeight: 600, fontSize: 12 }}>
                    + New Fund
                </button>
            </div>

            {showNewForm && <NewFundForm onClose={() => setShowNewForm(false)} />}

            {funds.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 10, padding: 32, textAlign: "center", color: "#9ca3af", boxShadow: "0 1px 4px #0001" }}>
                    <p style={{ margin: 0, fontSize: 14 }}>No funds yet.</p>
                    <p style={{ margin: "6px 0 0", fontSize: 12 }}>Click &quot;+ New Fund&quot; to get started.</p>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                    {funds.map((fund) => {
                        const totalContribs = fund.snapshots.reduce((s, x) => s + x.contribution, 0);
                        const totalInvested = fund.baseCapital + totalContribs;
                        const sorted = [...fund.snapshots].sort((a, b) => absMonth(b.year, b.month) - absMonth(a.year, a.month));
                        const currentValue = sorted[0]?.currentValue ?? 0;
                        const gain = currentValue > 0 ? currentValue - totalInvested : null;
                        const gainPct = gain != null && totalInvested > 0 ? (gain / totalInvested) * 100 : 0;

                        return (
                            <div key={fund.id}
                                onClick={() => onSelect(fund.id)}
                                style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px #0001", borderLeft: `4px solid ${fund.color}`, cursor: "pointer" }}
                                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px #0002")}
                                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 4px #0001")}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ width: 10, height: 10, borderRadius: 3, background: fund.color, flexShrink: 0 }} />
                                        <span style={{ fontWeight: 700, fontSize: 14, color: "#1f2937" }}>{fund.name}</span>
                                        {fund.type && (
                                            <span style={{ fontSize: 10, fontWeight: 600, color: "#7c3aed", background: "#f3f0ff", borderRadius: 4, padding: "2px 6px" }}>
                                                {fund.type.name}
                                            </span>
                                        )}
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); onDelete(fund.id); }}
                                        style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 14, padding: 2 }}
                                        title="Delete">✕</button>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>TOTAL INVESTED</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#7c3aed" }}>{<Money amount={totalInvested} />}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>CURRENT VALUE</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>{currentValue > 0 ? <Money amount={currentValue} /> : "—"}</div>
                                    </div>
                                </div>
                                {gain != null && (
                                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>{fund.snapshots.length} entr{fund.snapshots.length !== 1 ? "ies" : "y"}</span>
                                        <GainBadge gain={gain} pct={gainPct} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Main Tab ───────────────────────────────────────────────────────────

export default function FundsTab() {
    const { data: funds = [] } = useFunds();
    const deleteFund = useDeleteFund();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const selectedFund = useMemo(() => funds.find((f) => f.id === selectedId) ?? null, [funds, selectedId]);

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this fund and all its history?")) return;
        await deleteFund.mutateAsync(id);
        if (selectedId === id) setSelectedId(null);
    };

    if (selectedId && selectedFund) {
        return <FundDetail fund={selectedFund} onBack={() => setSelectedId(null)} onDelete={() => handleDelete(selectedId)} />;
    }

    return <FundList funds={funds} onSelect={setSelectedId} onDelete={handleDelete} />;
}
