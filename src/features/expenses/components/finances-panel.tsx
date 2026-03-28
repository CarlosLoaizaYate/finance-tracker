// @ts-nocheck
"use client";

import { useState, useMemo, useRef } from "react";
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ComposedChart, Area,
} from "recharts";

// ── Constantes ───────────────────────────────────────────────────────────────
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const INCOME = { salarioBase: 5500000, deducciones: 500000, salario: 5000000, arriendo: 1000000 };

// Ítems de gasto granulares
const EXPENSE_ITEMS_DEF = [
    { id: "netflix", name: "Netflix", cat: "streaming", budget: 40000 },
    { id: "spotify", name: "Spotify", cat: "streaming", budget: 30000 },
    { id: "crunchy", name: "Crunchyroll", cat: "streaming", budget: 20000 },
    { id: "claro", name: "Claro 1", cat: "telefonia", budget: 55000 },
    { id: "movistar", name: "Movistar", cat: "telefonia", budget: 150000 },
    { id: "apto", name: "Apartamento", cat: "vivienda", budget: 770000 },
    { id: "admin", name: "Administración", cat: "vivienda", budget: 200000 },
    { id: "tcnu", name: "TC Nu", cat: "credito", budget: 1000000 },
    { id: "smoto", name: "Seguro Moto", cat: "seguros", budget: 100000 },
    { id: "compensar", name: "Compensar", cat: "salud", budget: 600000 },
    { id: "salidas", name: "Salidas / Comidas", cat: "salidas", budget: 500000 },
];

const CATS = {
    streaming: { label: "Streaming", color: "#ec4899" },
    telefonia: { label: "Telefonía", color: "#3b82f6" },
    vivienda: { label: "Vivienda", color: "#6366f1" },
    credito: { label: "Crédito / TC", color: "#ef4444" },
    salud: { label: "Salud", color: "#10b981" },
    seguros: { label: "Seguros", color: "#f97316" },
    salidas: { label: "Salidas", color: "#f59e0b" },
};

// Portfolio de inversiones — snapshot inicial en Marzo (índice 2)
const INV_DEF = [
    { id: "nu", name: "Nubank Bolsillos", type: "Ahorro Digital", color: "#7c3aed", invested: 1000000 },
    { id: "geb", name: "Trii – Acciones GEB", type: "Renta Variable", color: "#d97706", invested: 387810 },
    { id: "amr", name: "Accicuenta Mayor Riesgo", type: "Fondo Mayor Riesgo", color: "#dc2626", invested: 600000 },
    { id: "din", name: "Acciones Dinámico", type: "Fondo Dinámico", color: "#059669", invested: 600000 },
    { id: "pot", name: "Estructurado Potencial USA", type: "Moderado", color: "#2563eb", invested: 1000000 },
];

// Snapshot inicial (Marzo = índice 2)
// contrib = aporte nuevo ese mes; value = valor de mercado actual
const SNAP0 = {
    2: {
        nu: { value: 1028257, contrib: 0 },
        geb: { value: 387810, contrib: 0 },
        amr: { value: 644000, contrib: 0 },
        din: { value: 585000, contrib: 0 },
        pot: { value: 1000000, contrib: 0 },
    }
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = n => "$" + Math.round(n).toLocaleString("es-CO");
const parse = s => { const n = parseInt(String(s).replace(/\D/g, ""), 10); return isNaN(n) ? 0 : n; };
const gainPc = (v, i) => i === 0 ? 0 : (v - i) / i * 100;

// ── Componentes pequeños ──────────────────────────────────────────────────────
const Badge = ({ val }) => (
    <span style={{
        background: val > 0 ? "#d1fae5" : val < 0 ? "#fee2e2" : "#f3f4f6",
        color: val > 0 ? "#065f46" : val < 0 ? "#991b1b" : "#6b7280",
        borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    }}>
        {val > 0 ? "+" : ""}{val.toFixed(2)}%
    </span>
);

const KPI = ({ title, value, sub, color, tag }) => (
    <div style={{
        background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 6px #0001",
        borderLeft: `4px solid ${color}`, minWidth: 140, flex: 1, position: "relative"
    }}>
        {tag && <span style={{
            position: "absolute", top: 10, right: 12, background: tag.bg, color: tag.fg,
            fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 7px"
        }}>{tag.text}</span>}
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{sub}</div>}
    </div>
);

// Celda inline editable — clic para editar, Enter/blur para confirmar
const EC = ({ value, onChange, edited }) => {
    const [on, setOn] = useState(false);
    const [v, setV] = useState("");
    const r = useRef();
    const start = () => { setV(value > 0 ? String(value) : ""); setOn(true); setTimeout(() => r.current?.select(), 0); };
    const done = () => { onChange(parse(v)); setOn(false); };
    if (on) return (
        <input ref={r} value={v}
            onChange={e => setV(e.target.value)}
            onBlur={done}
            onKeyDown={e => { if (e.key === "Enter") done(); if (e.key === "Escape") setOn(false); }}
            style={{
                width: 110, padding: "3px 6px", borderRadius: 6, border: "2px solid #6366f1",
                fontSize: 12, textAlign: "right", outline: "none"
            }}
        />
    );
    return (
        <span onClick={start} title="Clic para editar"
            style={{
                cursor: "text", padding: "3px 8px", borderRadius: 6,
                background: edited ? "#ede9fe" : "#f9fafb",
                color: edited ? "#4f46e5" : "#9ca3af", fontWeight: edited ? 700 : 400,
                fontSize: 12, display: "inline-block", minWidth: 90, textAlign: "right",
                border: "1px dashed", borderColor: edited ? "#a5b4fc" : "#e5e7eb"
            }}>
            {value > 0 ? fmt(value) : "—"}
        </span>
    );
};

const TabBtn = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
        padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
        fontSize: 13, fontWeight: 600,
        background: active ? "#6366f1" : "#f3f4f6",
        color: active ? "#fff" : "#374151",
        transition: "all 0.15s",
    }}>{children}</button>
);

// ── FinancePanel  principal ───────────────────────────────────────────────────────
export default function FinancePanel() {
    const [tab, setTab] = useState("resumen");
    const [mesI, setMesI] = useState(3);   // Abril por defecto
    const [mesF, setMesF] = useState(11);
    // Gastos reales por mes: {monthIdx: {itemId: amount}}
    const [gastos, setGastos] = useState({});
    // Ingresos reales por mes: {monthIdx: {salario, arriendo}}
    const [ingrs, setIngrs] = useState({});
    // Ítems de gasto (editable, permite agregar)
    const [items, setItems] = useState(EXPENSE_ITEMS_DEF);
    // Portfolio inversiones
    const [invs, setInvs] = useState(INV_DEF);
    const [snaps, setSnaps] = useState(SNAP0);
    const [invMes, setInvMes] = useState(2);  // mes activo en pestaña inversiones
    // Agregar inversión
    const [addInv, setAddInv] = useState(false);
    const [newInv, setNewInv] = useState({ name: "", type: "", invested: 0, color: "#6366f1" });
    // Agregar / quitar gasto
    const [addExp, setAddExp] = useState(false);
    const [newExp, setNewExp] = useState({ name: "", cat: "salidas", budget: 0 });
    const removeItem = (id) => setItems(p => p.filter(it => it.id !== id));
    const addNewExp = () => {
        if (!newExp.name || !newExp.budget) return;
        setItems(p => [...p, { ...newExp, id: "exp_" + Date.now(), budget: +newExp.budget }]);
        setAddExp(false);
        setNewExp({ name: "", cat: "salidas", budget: 0 });
    };

    // ── Accesors de estado ────────────────────────────────────────────────────
    const getInc = mi => ({ ...INCOME, ...(ingrs[mi] || {}) });
    const setIncF = (mi, f, v) => setIngrs(p => ({ ...p, [mi]: { ...getInc(mi), [f]: v } }));
    const getReal = (mi, id) => gastos[mi]?.[id] ?? items.find(x => x.id === id)?.budget ?? 0;
    const setReal = (mi, id, v) => setGastos(p => ({ ...p, [mi]: { ...(p[mi] || {}), [id]: v } }));
    const isGEd = (mi, id) => gastos[mi]?.[id] !== undefined;

    const setSnap = (mi, invId, field, val) =>
        setSnaps(p => ({
            ...p,
            [mi]: { ...(p[mi] || {}), [invId]: { ...(p[mi]?.[invId] || { value: 0, contrib: 0 }), [field]: val } }
        }));

    // Último valor conocido de una inversión antes del mes 'mi'
    const lastKnown = (invId, mi) => {
        for (let i = mi; i >= 0; i--) {
            const v = snaps[i]?.[invId]?.value;
            if (v) return v;
        }
        return invs.find(x => x.id === invId)?.invested ?? 0;
    };

    // ── Cómputos para Resumen / Gastos ────────────────────────────────────────
    const range = useMemo(() => { const a = []; for (let i = mesI; i <= mesF; i++) a.push(i); return a; }, [mesI, mesF]);

    const rangeData = useMemo(() =>
        range.map(mi => {
            const inc = getInc(mi);
            const ingt = inc.salario + inc.arriendo;
            const catT = {};
            Object.keys(CATS).forEach(c => { catT[c] = 0; });
            items.forEach(it => { catT[it.cat] = (catT[it.cat] || 0) + getReal(mi, it.id); });
            const gast = Object.values(catT).reduce((s, v) => s + v, 0);
            return { mes: MONTHS[mi], mi, ...catT, ingresos: ingt, gastos: gast, libre: ingt - gast };
        }),
        // eslint-disable-next-line
        [range, gastos, ingrs, items]);

    const totals = useMemo(() => {
        const t = { ingresos: 0, gastos: 0, libre: 0 };
        rangeData.forEach(d => { t.ingresos += d.ingresos; t.gastos += d.gastos; t.libre += d.libre; });
        return t;
    }, [rangeData]);

    const pieData = useMemo(() =>
        Object.entries(CATS).map(([k, v]) => ({
            name: v.label, color: v.color,
            value: rangeData.reduce((s, d) => s + (d[k] || 0), 0)
        })).filter(x => x.value > 0).sort((a, b) => b.value - a.value),
        [rangeData]);

    const catGroups = useMemo(() => {
        const g = {};
        items.forEach(it => { (g[it.cat] || (g[it.cat] = [])).push(it); });
        return g;
    }, [items]);

    const budgetTotal = items.reduce((s, it) => s + it.budget, 0);
    const incomeTotal = INCOME.salario + INCOME.arriendo;

    // ── Cómputos para Inversiones ─────────────────────────────────────────────
    const snapMonths = useMemo(() =>
        Object.keys(snaps).map(Number).sort((a, b) => a - b),
        [snaps]);

    // Resumen del último snapshot
    const lastSnap = useMemo(() => {
        const lm = snapMonths.at(-1);
        if (lm === undefined) return null;
        let tv = 0, ti = 0;
        const detail = invs.map(inv => {
            const s = snaps[lm]?.[inv.id];
            const val = s?.value ?? inv.invested;
            tv += val; ti += inv.invested;
            return {
                ...inv, val, contrib: s?.contrib ?? 0,
                gain: val - inv.invested, pct: gainPc(val, inv.invested)
            };
        });
        return { detail, tv, ti, tgain: tv - ti, tpct: gainPc(tv, ti), lmes: MONTHS[lm], lmi: lm };
    }, [snaps, invs, snapMonths]);

    // Datos para gráfica de evolución
    const chartData = useMemo(() => {
        if (snapMonths.length < 1) return [];
        return snapMonths.map(mi => {
            let tv = 0, ti = 0;
            invs.forEach(inv => {
                tv += snaps[mi]?.[inv.id]?.value ?? lastKnown(inv.id, mi);
                ti += inv.invested;
            });
            const row = { mes: MONTHS[mi], "Valor total": tv, "Invertido": ti };
            invs.forEach(inv => { row[inv.id] = snaps[mi]?.[inv.id]?.value ?? null; });
            return row;
        });
        // eslint-disable-next-line
    }, [snaps, invs, snapMonths]);

    const addNewInv = () => {
        if (!newInv.name) return;
        setInvs(p => [...p, { ...newInv, id: "inv_" + Date.now(), invested: +newInv.invested || 0 }]);
        setAddInv(false);
        setNewInv({ name: "", type: "", invested: 0, color: "#6366f1" });
    };

    return (
        <div style={{ fontFamily: "'Segoe UI',sans-serif", background: "#f3f4f6", minHeight: "100vh", padding: "24px 20px" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>

                {/* Header */}
                <div style={{ marginBottom: 20 }}>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111827" }}>💰 Finanzas Personales</h1>
                    <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
                        Año 2025 · COP ·
                        <span style={{ color: "#6366f1", fontWeight: 600 }}> Haz clic en una celda morada para editar</span>
                    </p>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <TabBtn active={tab === "resumen"} onClick={() => setTab("resumen")}>📊 Resumen</TabBtn>
                    <TabBtn active={tab === "gastos"} onClick={() => setTab("gastos")}>💸 Gastos</TabBtn>
                    <TabBtn active={tab === "inversiones"} onClick={() => setTab("inversiones")}>📈 Inversiones</TabBtn>
                </div>

                {/* ══════════════════════ RESUMEN ══════════════════════════════════════ */}
                {tab === "resumen" && (<>
                    {/* Filtros */}
                    <div style={{
                        background: "#fff", borderRadius: 12, padding: "12px 18px", marginBottom: 16, boxShadow: "0 1px 4px #0001",
                        display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Desde:</label>
                            <select value={mesI} onChange={e => setMesI(Math.min(+e.target.value, mesF))}
                                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
                                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                            </select>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Hasta:</label>
                            <select value={mesF} onChange={e => setMesF(Math.max(+e.target.value, mesI))}
                                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
                                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                            </select>
                        </div>
                        <div style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>
                            {range.length} mes{range.length !== 1 ? "es" : ""} seleccionado{range.length !== 1 ? "s" : ""}
                        </div>
                    </div>

                    {/* Banner ingresos */}
                    <div style={{
                        background: "linear-gradient(135deg,#064e3b,#065f46)", borderRadius: 12, padding: "16px 22px",
                        marginBottom: 16, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", boxShadow: "0 2px 8px #0002"
                    }}>
                        <div>
                            <div style={{ fontSize: 11, color: "#6ee7b7", fontWeight: 600, letterSpacing: 1 }}>INGRESOS NETOS / MES</div>
                            <div style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>{fmt(incomeTotal)}</div>
                        </div>
                        <div style={{ width: 1, height: 36, background: "#10b981", opacity: 0.4 }} />
                        <div>
                            <div style={{ fontSize: 11, color: "#6ee7b7" }}>Salario bruto</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{fmt(INCOME.salarioBase)}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: "#fca5a5" }}>− Deducciones</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#fca5a5" }}>−{fmt(INCOME.deducciones)}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: "#6ee7b7" }}>= Salario neto</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{fmt(INCOME.salario)}</div>
                        </div>
                        <span style={{ fontSize: 16, color: "#6ee7b7" }}>+</span>
                        <div><div style={{ fontSize: 11, color: "#6ee7b7" }}>Arriendo</div><div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{fmt(INCOME.arriendo)}</div></div>
                        <div style={{ marginLeft: "auto", textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "#6ee7b7" }}>Libre mensual (presupuesto)</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: "#a7f3d0" }}>{fmt(incomeTotal - budgetTotal)}</div>
                        </div>
                    </div>

                    {/* KPIs */}
                    <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                        <KPI title="Ingresos (periodo)" value={fmt(totals.ingresos)} sub={`${range.length} meses`} color="#10b981" />
                        <KPI title="Gastos (periodo)" value={fmt(totals.gastos)} sub="Valores reales" color="#ef4444" />
                        <KPI title="Libre (periodo)" value={fmt(totals.libre)}
                            sub={`${totals.ingresos > 0 ? ((totals.libre / totals.ingresos) * 100).toFixed(1) : 0}% del ingreso`} color="#6366f1" />
                        {lastSnap && <KPI title="Portfolio actual" value={fmt(lastSnap.tv)} sub={lastSnap.lmes} color="#7c3aed"
                            tag={{ text: (lastSnap.tgain >= 0 ? "+" : "") + fmt(lastSnap.tgain), bg: lastSnap.tgain >= 0 ? "#d1fae5" : "#fee2e2", fg: lastSnap.tgain >= 0 ? "#065f46" : "#991b1b" }} />}
                    </div>

                    {/* Gráficas */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                        <div style={{ background: "#fff", borderRadius: 12, padding: "18px 16px", boxShadow: "0 1px 4px #0001" }}>
                            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Ingresos vs Gastos</h3>
                            <ResponsiveContainer width="100%" height={210}>
                                <LineChart data={rangeData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
                                    <Tooltip formatter={fmt} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Line type="monotone" dataKey="ingresos" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} name="Ingresos" />
                                    <Line type="monotone" dataKey="gastos" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} name="Gastos" />
                                    <Line type="monotone" dataKey="libre" stroke="#6366f1" strokeWidth={2} strokeDasharray="4 3" dot={false} name="Libre" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ background: "#fff", borderRadius: 12, padding: "18px 16px", boxShadow: "0 1px 4px #0001" }}>
                            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Distribución de Gastos</h3>
                            <ResponsiveContainer width="100%" height={210}>
                                <PieChart>
                                    <Pie data={pieData} dataKey="value" nameKey="name" cx="40%" cy="50%" outerRadius={80}
                                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                                        {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                                    </Pie>
                                    <Tooltip formatter={fmt} />
                                    <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div style={{ background: "#fff", borderRadius: 12, padding: "18px 16px", boxShadow: "0 1px 4px #0001" }}>
                        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Gastos por Categoría · Mensual</h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={rangeData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={fmt} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                {Object.entries(CATS).map(([k, v]) =>
                                    <Bar key={k} dataKey={k} name={v.label} stackId="a" fill={v.color} />
                                )}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </>)}

                {/* ══════════════════════ GASTOS ═══════════════════════════════════════ */}
                {tab === "gastos" && (<>
                    {/* Selector de mes activo */}
                    <div style={{
                        background: "#fff", borderRadius: 12, padding: "12px 18px", marginBottom: 16,
                        boxShadow: "0 1px 4px #0001", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center"
                    }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Mes a registrar:</span>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {MONTHS.map((m, i) => (
                                <button key={i} onClick={() => { setMesI(i); setMesF(i); }}
                                    style={{
                                        padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                                        background: mesI === i && mesF === i ? "#6366f1" : gastos[i] && Object.keys(gastos[i]).length ? "#ede9fe" : "#f3f4f6",
                                        color: mesI === i && mesF === i ? "#fff" : gastos[i] && Object.keys(gastos[i]).length ? "#4f46e5" : "#374151",
                                    }}>
                                    {m}{gastos[i] && Object.keys(gastos[i]).length > 0 ? " ✓" : ""}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Contenido del mes activo */}
                    {[mesI].map(mi => (
                        <div key={mi}>
                            {/* Ingresos reales del mes */}
                            <div style={{
                                background: "linear-gradient(135deg,#064e3b,#065f46)", borderRadius: 12,
                                padding: "14px 20px", marginBottom: 12, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center"
                            }}>
                                <div>
                                    <div style={{ fontSize: 13, color: "#6ee7b7", fontWeight: 700 }}>INGRESOS — {MONTHS[mi]}</div>
                                    <div style={{ fontSize: 11, color: "#6ee7b7", opacity: 0.7 }}>
                                        Bruto {fmt(INCOME.salarioBase)} − Ded. {fmt(INCOME.deducciones)} = Neto {fmt(INCOME.salario)}
                                    </div>
                                </div>
                                {["salario", "arriendo"].map(f => (
                                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 12, color: "#6ee7b7", textTransform: "capitalize" }}>
                                            {f === "salario" ? "Salario neto" : "Arriendo"}:
                                        </span>
                                        <EC value={getInc(mi)[f]} edited={ingrs[mi]?.[f] !== undefined}
                                            onChange={v => setIncF(mi, f, v)} />
                                    </div>
                                ))}
                                <div style={{ marginLeft: "auto", color: "#a7f3d0", fontWeight: 800, fontSize: 16 }}>
                                    {fmt(getInc(mi).salario + getInc(mi).arriendo)}
                                </div>
                            </div>

                            {/* Grupos de categorías */}
                            {Object.entries(catGroups).map(([cat, catItems]) => {
                                const catReal = catItems.reduce((s, it) => s + getReal(mi, it.id), 0);
                                const catBudget = catItems.reduce((s, it) => s + it.budget, 0);
                                const diff = catReal - catBudget;
                                return (
                                    <div key={cat} style={{ background: "#fff", borderRadius: 12, marginBottom: 10, overflow: "hidden", boxShadow: "0 1px 4px #0001" }}>
                                        {/* Header categoría */}
                                        <div style={{
                                            padding: "10px 16px", background: `${CATS[cat].color}18`,
                                            borderLeft: `4px solid ${CATS[cat].color}`,
                                            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap"
                                        }}>
                                            <span style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{CATS[cat].label}</span>
                                            <span style={{ fontSize: 12, color: "#9ca3af" }}>Presupuesto: {fmt(catBudget)}</span>
                                            <span style={{ fontSize: 12, color: "#6b7280" }}>Real: <strong style={{ color: CATS[cat].color }}>{fmt(catReal)}</strong></span>
                                            {diff !== 0 && <Badge val={(diff / catBudget * 100)} />}
                                        </div>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
                                                    <th style={{ padding: "6px 16px", textAlign: "left", color: "#9ca3af", fontWeight: 600, fontSize: 11 }}>Ítem</th>
                                                    <th style={{ padding: "6px 12px", textAlign: "right", color: "#9ca3af", fontWeight: 600, fontSize: 11 }}>Presupuesto</th>
                                                    <th style={{ padding: "6px 12px", textAlign: "right", color: "#9ca3af", fontWeight: 600, fontSize: 11 }}>Real ✏️</th>
                                                    <th style={{ padding: "6px 12px", textAlign: "right", color: "#9ca3af", fontWeight: 600, fontSize: 11 }}>Diferencia</th>
                                                    <th style={{ padding: "6px 8px", textAlign: "center", color: "#9ca3af", fontWeight: 600, fontSize: 11 }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {catItems.map((it, idx) => {
                                                    const real = getReal(mi, it.id);
                                                    const d = real - it.budget;
                                                    const ed = isGEd(mi, it.id);
                                                    return (
                                                        <tr key={it.id} style={{ borderBottom: "1px solid #f9fafb", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                                                            <td style={{ padding: "8px 16px", fontWeight: 600, color: "#374151" }}>{it.name}</td>
                                                            <td style={{ padding: "8px 12px", textAlign: "right", color: "#6b7280" }}>{fmt(it.budget)}</td>
                                                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                                                                <EC value={real} edited={ed} onChange={v => setReal(mi, it.id, v)} />
                                                            </td>
                                                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                                                                {ed
                                                                    ? <span style={{ fontWeight: 700, color: d <= 0 ? "#059669" : "#dc2626", fontSize: 12 }}>
                                                                        {d > 0 ? "+" : ""}{fmt(d)}
                                                                    </span>
                                                                    : <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>
                                                                }
                                                            </td>
                                                            <td style={{ padding: "8px 8px", textAlign: "center" }}>
                                                                <button onClick={() => removeItem(it.id)} title="Eliminar ítem"
                                                                    style={{
                                                                        background: "none", border: "none", cursor: "pointer", fontSize: 14,
                                                                        color: "#fca5a5", lineHeight: 1, padding: "2px 4px", borderRadius: 4
                                                                    }}
                                                                    onMouseEnter={e => e.target.style.color = "#dc2626"}
                                                                    onMouseLeave={e => e.target.style.color = "#fca5a5"}>
                                                                    ×
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}

                            {/* Agregar nuevo gasto */}
                            <div style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", marginBottom: 10, boxShadow: "0 1px 4px #0001" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>➕ Agregar nuevo gasto</span>
                                    <button onClick={() => setAddExp(p => !p)}
                                        style={{
                                            padding: "5px 12px", borderRadius: 8, border: "1px solid #e5e7eb",
                                            background: addExp ? "#f9fafb" : "#f0fdf4", color: addExp ? "#374151" : "#059669",
                                            fontSize: 12, fontWeight: 600, cursor: "pointer"
                                        }}>
                                        {addExp ? "Cancelar" : "+ Agregar"}
                                    </button>
                                </div>
                                {addExp && (
                                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Nombre</div>
                                            <input value={newExp.name} onChange={e => setNewExp(p => ({ ...p, name: e.target.value }))}
                                                placeholder="Ej. Gimnasio" autoFocus
                                                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, width: 150, outline: "none" }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Categoría</div>
                                            <select value={newExp.cat} onChange={e => setNewExp(p => ({ ...p, cat: e.target.value }))}
                                                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, outline: "none" }}>
                                                {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Presupuesto mensual</div>
                                            <input value={newExp.budget || ""} type="number"
                                                onChange={e => setNewExp(p => ({ ...p, budget: +e.target.value }))}
                                                placeholder="0"
                                                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, width: 130, outline: "none" }} />
                                        </div>
                                        <button onClick={addNewExp}
                                            style={{
                                                padding: "7px 18px", borderRadius: 8, background: "#059669", color: "#fff",
                                                border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", height: 36
                                            }}>
                                            Guardar
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Resumen del mes */}
                            {(() => {
                                const inc = getInc(mi);
                                const ingt = inc.salario + inc.arriendo;
                                const gast = items.reduce((s, it) => s + getReal(mi, it.id), 0);
                                const bud = items.reduce((s, it) => s + it.budget, 0);
                                return (
                                    <div style={{
                                        background: "#1e1b4b", borderRadius: 12, padding: "16px 22px",
                                        display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center"
                                    }}>
                                        <div><div style={{ fontSize: 11, color: "#a5b4fc" }}>Ingresos</div><div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{fmt(ingt)}</div></div>
                                        <div style={{ width: 1, height: 30, background: "#4338ca" }} />
                                        <div><div style={{ fontSize: 11, color: "#a5b4fc" }}>Gastos reales</div><div style={{ fontSize: 18, fontWeight: 800, color: "#fca5a5" }}>{fmt(gast)}</div></div>
                                        <div><div style={{ fontSize: 11, color: "#a5b4fc" }}>Presupuesto</div><div style={{ fontSize: 15, fontWeight: 600, color: "#c7d2fe" }}>{fmt(bud)}</div></div>
                                        <div style={{ marginLeft: "auto", textAlign: "right" }}>
                                            <div style={{ fontSize: 11, color: "#a5b4fc" }}>Libre este mes</div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: ingt - gast >= 0 ? "#6ee7b7" : "#fca5a5" }}>{fmt(ingt - gast)}</div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    ))}
                </>)}

                {/* ══════════════════════ INVERSIONES ══════════════════════════════════ */}
                {tab === "inversiones" && (<>
                    {/* Selector de mes */}
                    <div style={{
                        background: "#fff", borderRadius: 12, padding: "12px 18px", marginBottom: 16,
                        boxShadow: "0 1px 4px #0001", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center"
                    }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Registrar mes:</span>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {MONTHS.map((m, i) => (
                                <button key={i} onClick={() => setInvMes(i)}
                                    style={{
                                        padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                                        background: invMes === i ? "#7c3aed" : snaps[i] ? "#ede9fe" : "#f3f4f6",
                                        color: invMes === i ? "#fff" : snaps[i] ? "#5b21b6" : "#374151",
                                    }}>
                                    {m}{snaps[i] ? " ✓" : ""}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* KPIs portfolio */}
                    {lastSnap && (
                        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                            <KPI title="Total invertido" value={fmt(lastSnap.ti)} sub="Capital aportado" color="#7c3aed" />
                            <KPI title="Valor actual" value={fmt(lastSnap.tv)} sub={lastSnap.lmes} color="#059669" />
                            <KPI title="Ganancia / Pérdida" value={fmt(lastSnap.tgain)} sub={`${lastSnap.tgain >= 0 ? "+" : ""}${lastSnap.tpct.toFixed(2)}%`}
                                color={lastSnap.tgain >= 0 ? "#10b981" : "#ef4444"} />
                            <KPI title="Inversiones" value={invs.length} sub="activas en portfolio" color="#3b82f6" />
                        </div>
                    )}

                    {/* Tabla del mes activo */}
                    <div style={{ background: "#fff", borderRadius: 12, padding: "18px 16px", boxShadow: "0 1px 4px #0001", marginBottom: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#374151" }}>
                                Portfolio — {MONTHS[invMes]}
                            </h3>
                            <span style={{ fontSize: 12, color: "#9ca3af", background: "#f3f4f6", borderRadius: 6, padding: "3px 10px" }}>
                                Edita <strong>Valor actual</strong> y <strong>Aporte</strong> para registrar el mes ✏️
                            </span>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}>
                                        {["Inversión", "Tipo", "Capital inv.", "Valor actual ✏️", "Aporte mes ✏️", "Ganancia $", "Ganancia %", "vs mes ant."].map(h => (
                                            <th key={h} style={{
                                                padding: "9px 11px", textAlign: h === "Inversión" || h === "Tipo" ? "left" : "right",
                                                color: "#6b7280", fontWeight: 600, fontSize: 11
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {invs.map((inv, idx) => {
                                        const snap = snaps[invMes]?.[inv.id];
                                        const curVal = snap?.value ?? lastKnown(inv.id, invMes);
                                        const contrib = snap?.contrib ?? 0;
                                        const gain = curVal - inv.invested;
                                        const gpc = gainPc(curVal, inv.invested);
                                        const hasSnap = snaps[invMes]?.[inv.id] !== undefined;
                                        // vs mes anterior
                                        let prevVal = null;
                                        for (let i = invMes - 1; i >= 0; i--) {
                                            if (snaps[i]?.[inv.id]?.value) { prevVal = snaps[i][inv.id].value; break; }
                                        }
                                        const mopc = prevVal != null ? gainPc(curVal, prevVal) : null;

                                        return (
                                            <tr key={inv.id} style={{ borderBottom: "1px solid #f3f4f6", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                                                <td style={{ padding: "10px 11px" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: inv.color, flexShrink: 0 }} />
                                                        <span style={{ fontWeight: 700, color: "#111827" }}>{inv.name}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: "10px 11px" }}>
                                                    <span style={{ background: "#f3f4f6", borderRadius: 6, padding: "2px 7px", fontSize: 11, color: "#374151" }}>{inv.type}</span>
                                                </td>
                                                <td style={{ padding: "10px 11px", textAlign: "right", color: "#374151" }}>{fmt(inv.invested)}</td>
                                                <td style={{ padding: "10px 11px", textAlign: "right" }}>
                                                    <EC value={curVal} edited={hasSnap} onChange={v => setSnap(invMes, inv.id, "value", v)} />
                                                </td>
                                                <td style={{ padding: "10px 11px", textAlign: "right" }}>
                                                    <EC value={contrib} edited={hasSnap && contrib > 0} onChange={v => setSnap(invMes, inv.id, "contrib", v)} />
                                                </td>
                                                <td style={{ padding: "10px 11px", textAlign: "right", fontWeight: 700, color: gain >= 0 ? "#059669" : "#dc2626" }}>
                                                    {gain >= 0 ? "+" : ""}{fmt(gain)}
                                                </td>
                                                <td style={{ padding: "10px 11px", textAlign: "right" }}><Badge val={gpc} /></td>
                                                <td style={{ padding: "10px 11px", textAlign: "right" }}>
                                                    {mopc != null ? <Badge val={mopc} /> : <span style={{ color: "#d1d5db" }}>—</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                {/* Totales */}
                                {snaps[invMes] && (() => {
                                    const tv = invs.reduce((s, inv) => s + (snaps[invMes]?.[inv.id]?.value ?? lastKnown(inv.id, invMes)), 0);
                                    const ti = invs.reduce((s, inv) => s + inv.invested, 0);
                                    return (
                                        <tfoot>
                                            <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f9fafb" }}>
                                                <td colSpan={2} style={{ padding: "10px 11px", fontWeight: 800, color: "#374151", fontSize: 13 }}>TOTAL</td>
                                                <td style={{ padding: "10px 11px", textAlign: "right", fontWeight: 700, color: "#374151" }}>{fmt(ti)}</td>
                                                <td style={{ padding: "10px 11px", textAlign: "right", fontWeight: 800, color: "#7c3aed" }}>{fmt(tv)}</td>
                                                <td />
                                                <td style={{ padding: "10px 11px", textAlign: "right", fontWeight: 800, color: tv - ti >= 0 ? "#059669" : "#dc2626" }}>
                                                    {tv - ti >= 0 ? "+" : ""}{fmt(tv - ti)}
                                                </td>
                                                <td style={{ padding: "10px 11px", textAlign: "right" }}><Badge val={gainPc(tv, ti)} /></td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    );
                                })()}
                            </table>
                        </div>
                    </div>

                    {/* Gráfica de evolución */}
                    <div style={{ background: "#fff", borderRadius: 12, padding: "18px 16px", boxShadow: "0 1px 4px #0001", marginBottom: 16 }}>
                        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#374151" }}>Evolución del Portfolio</h3>
                        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#9ca3af" }}>
                            Valor total vs capital invertido — cada punto = un mes registrado
                        </p>
                        {chartData.length >= 2 ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <ComposedChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
                                    <Tooltip formatter={fmt} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Area type="monotone" dataKey="Valor total" fill="#ede9fe" stroke="#7c3aed" strokeWidth={2.5} />
                                    <Line type="monotone" dataKey="Invertido" stroke="#9ca3af" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                                    {invs.map(inv => (
                                        <Line key={inv.id} type="monotone" dataKey={inv.id} name={inv.name}
                                            stroke={inv.color} strokeWidth={1.5} dot={{ r: 3 }} connectNulls />
                                    ))}
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ textAlign: "center", padding: "36px", color: "#9ca3af", fontSize: 13, background: "#f9fafb", borderRadius: 8 }}>
                                📅 Registra al menos <strong>2 meses</strong> para ver la gráfica de evolución.<br />
                                <span style={{ fontSize: 11 }}>Selecciona un mes y edita los valores actuales de cada inversión.</span>
                            </div>
                        )}
                    </div>

                    {/* Agregar nueva inversión */}
                    <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 4px #0001" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: addInv ? 14 : 0 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#374151" }}>➕ Agregar nueva inversión</h3>
                                {!addInv && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>¿Empezaste un nuevo fondo o compra de acciones?</p>}
                            </div>
                            <button onClick={() => setAddInv(p => !p)}
                                style={{
                                    padding: "6px 14px", borderRadius: 8, border: "1px solid #e5e7eb",
                                    background: addInv ? "#f9fafb" : "#ede9fe", color: addInv ? "#374151" : "#5b21b6",
                                    fontSize: 12, fontWeight: 600, cursor: "pointer"
                                }}>
                                {addInv ? "Cancelar" : "+ Agregar"}
                            </button>
                        </div>
                        {addInv && (
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", paddingTop: 4 }}>
                                {[{ f: "name", l: "Nombre", ph: "Ej. Fiducuenta" }, { f: "type", l: "Tipo", ph: "Ej. CDT, Fondo" }].map(({ f, l, ph }) => (
                                    <div key={f}>
                                        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{l}</div>
                                        <input value={newInv[f]} onChange={e => setNewInv(p => ({ ...p, [f]: e.target.value }))}
                                            placeholder={ph}
                                            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, width: 160, outline: "none" }} />
                                    </div>
                                ))}
                                <div>
                                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Capital invertido (COP)</div>
                                    <input value={newInv.invested || ""} type="number"
                                        onChange={e => setNewInv(p => ({ ...p, invested: +e.target.value }))}
                                        placeholder="0"
                                        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, width: 130, outline: "none" }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Color</div>
                                    <input type="color" value={newInv.color}
                                        onChange={e => setNewInv(p => ({ ...p, color: e.target.value }))}
                                        style={{ width: 40, height: 34, borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer", padding: 2 }} />
                                </div>
                                <button onClick={addNewInv}
                                    style={{
                                        padding: "7px 20px", borderRadius: 8, background: "#7c3aed", color: "#fff",
                                        border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", height: 36
                                    }}>
                                    Guardar
                                </button>
                            </div>
                        )}
                    </div>
                </>)}

                <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#d1d5db" }}>
                    Finanzas personales · 2025
                </div>
            </div>
        </div>
    );
}