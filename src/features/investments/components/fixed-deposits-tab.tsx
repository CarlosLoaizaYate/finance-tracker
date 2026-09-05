"use client";

import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  useFixedDepositGroups,
  useAddFixedDepositGroup,
  useDeleteFixedDepositGroup,
  useAddFixedDepositCycle,
  useCloseCycle,
  useUpdateCycleEndDate,
  useDeleteFixedDeposit,
  useFixedDepositSnapshots,
  useUpsertFixedDepositSnapshot,
  useDeleteFixedDepositSnapshot,
  type FixedDepositGroup,
  type FixedDeposit,
  type FixedDepositSnapshot,
} from "@/hooks/use-finance-data";
import { fmt } from "@/lib/formatters";
import Money from "@/components/ui/money";
import { useTranslation } from "@/hooks/use-translation";

type TermUnit = "DAYS" | "MONTHS";
type TFunc = (key: string, vars?: Record<string, string | number>) => string;

/** Parses "YYYY-MM-DD" (or ISO string) as LOCAL midnight — avoids UTC offset shifting the day. */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Formats a Date as "YYYY-MM-DD" in local time (for date inputs). */
function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addTerm(date: Date, term: number, unit: TermUnit): Date {
  const d = new Date(date);
  if (unit === "MONTHS") {
    // Colombian banking convention: end date is the day before the same date N months later
    // e.g. May 1 + 3 months = Aug 1 - 1 day = July 31
    d.setMonth(d.getMonth() + term);
    d.setDate(d.getDate() - 1);
  } else {
    d.setDate(d.getDate() + term);
  }
  return d;
}

function calcExpectedValue(capital: number, rateEA: number, term: number, unit: TermUnit): number {
  const exponent = unit === "DAYS" ? term / 365 : term / 12;
  return Math.round(capital * Math.pow(1 + rateEA / 100, exponent));
}

function termLabel(t: TFunc, term: number, unit: TermUnit): string {
  const unitWord = unit === "DAYS"
    ? (term === 1 ? t("fixedDeposits.day") : t("fixedDeposits.days"))
    : (term === 1 ? t("fixedDeposits.month") : t("fixedDeposits.months"));
  return `${term} ${unitWord}`;
}

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function buildMonthlyHistory(cycle: FixedDeposit) {
  const start = parseLocalDate(cycle.startDate);
  const end = parseLocalDate(cycle.endDate);
  const capital = cycle.capital;
  const rate = cycle.interestRate / 100;

  // Build measurement dates: start, then 1st of each month, then end
  const dates: Date[] = [start];

  // Skip 1st-of-month entries that would duplicate the start date
  const seen = new Set<string>();
  seen.add(`${start.getFullYear()}-${start.getMonth()}`);

  const cursor = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  while (cursor < end) {
    const k = `${cursor.getFullYear()}-${cursor.getMonth()}`;
    if (!seen.has(k)) {
      seen.add(k);
      dates.push(new Date(cursor));
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Always add end date — even if same month as last intermediate entry (e.g. Jul 1 + Jul 31)
  if (dates.at(-1)!.getTime() !== end.getTime()) {
    dates.push(end);
  }

  const unique = dates;

  return unique.map((d, i) => {
    const daysElapsed = Math.round((d.getTime() - start.getTime()) / 86400000);
    const prevDate = i > 0 ? unique[i - 1] : null;
    const prevDays = prevDate ? Math.round((prevDate.getTime() - start.getTime()) / 86400000) : 0;
    const value = daysElapsed === 0
      ? capital
      : Math.round(capital * Math.pow(1 + rate, daysElapsed / 365));
    const prevValue = i === 0
      ? capital
      : Math.round(capital * Math.pow(1 + rate, prevDays / 365));

    return {
      label: d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }),
      day: d.getDate(),
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      daysElapsed,
      projectedValue: value,
      projectedGain: value - prevValue,
      isStart: i === 0,
      isEnd: i === unique.length - 1,
    };
  });
}

function formatDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

function isActive(cycle: FixedDeposit): boolean {
  return cycle.earnedInterest === null;
}

function compareSnapshots(a: FixedDepositSnapshot, b: FixedDepositSnapshot): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

interface GroupSummary {
  initialCapital: number;
  totalInvested: number;
  realAccumulatedGain: number;
  currentValue: number;
  activeCycle: FixedDeposit | null;
  hasRealData: boolean;
}

function computeSummary(group: FixedDepositGroup): GroupSummary {
  const sorted = [...group.cycles].sort(
    (a, b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime()
  );
  const initialCapital = sorted[0]?.capital ?? 0;
  const totalInvested = sorted.reduce((s, c) => s + c.capitalAdded, 0);
  const activeCycle = sorted.find(isActive) ?? null;

  // Real data: all snapshots across all cycles, ordered chronologically
  const allSnaps = sorted.flatMap(c =>
    (c.snapshots ?? []).map(s => ({ ...s, capital: c.capital }))
  ).sort(compareSnapshots);

  // snap.gain stores the TOTAL CDT VALUE at that date (not a monthly increment)
  // Per-cycle gain = lastSnapshot.gain - cycle.capital
  const realAccumulatedGain = sorted.reduce((total, cycle) => {
    const cycleSnaps = (cycle.snapshots ?? []).sort(compareSnapshots);
    const last = cycleSnaps.at(-1);
    return total + (last ? last.gain - cycle.capital : 0);
  }, 0);

  const hasRealData = allSnaps.length > 0;

  // Current value = last snapshot value of the most recent cycle that has data
  const lastCycleWithData = [...sorted].reverse().find(c => (c.snapshots ?? []).length > 0);
  const lastSnap = lastCycleWithData
    ? [...(lastCycleWithData.snapshots ?? [])].sort(compareSnapshots).at(-1)
    : null;
  const baseCycle = activeCycle ?? sorted.at(-1);
  const currentValue = lastSnap ? lastSnap.gain : (baseCycle?.capital ?? 0);

  return { initialCapital, totalInvested, realAccumulatedGain, currentValue, activeCycle, hasRealData };
}

// ── Styles ────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "16px 20px",
};

const btn = (color = "#7c3aed"): React.CSSProperties => ({
  padding: "6px 14px",
  background: color,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
});

const ghost: React.CSSProperties = {
  padding: "6px 14px",
  background: "transparent",
  color: "#6b7280",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};

const input: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

const label: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 4,
  display: "block",
  fontWeight: 500,
};

// ── Sub-components ────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: GroupSummary }) {
  const { t } = useTranslation();
  const pct = summary.totalInvested > 0 ? (summary.realAccumulatedGain / summary.totalInvested) * 100 : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>{t("fixedDeposits.initialCapital")}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#6b7280" }}>{<Money amount={summary.initialCapital} />}</div>
      </div>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>{t("fixedDeposits.totalInvested")}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#2563eb" }}>{<Money amount={summary.totalInvested} />}</div>
      </div>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>{t("fixedDeposits.accumulatedRealGain")}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>
          {summary.hasRealData ? <>+<Money amount={summary.realAccumulatedGain} /></> : "—"}
        </div>
        {summary.hasRealData && (
          <div style={{ fontSize: 11, marginTop: 2 }}>
            <span style={{
              color: pct >= 0 ? "#16a34a" : "#ef4444",
              background: pct >= 0 ? "#dcfce7" : "#fee2e2",
              padding: "1px 6px", borderRadius: 99, fontWeight: 600,
            }}>
              {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
            </span>
          </div>
        )}
      </div>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>{t("fixedDeposits.currentValue")}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#7c3aed" }}>
          {<Money amount={summary.currentValue} />}
        </div>
        {!summary.hasRealData && (
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{t("fixedDeposits.noRealDataYet")}</div>
        )}
      </div>
    </div>
  );
}

function CyclesChart({ cycles }: { cycles: FixedDeposit[] }) {
  const { t } = useTranslation();
  const totalValueLabel = t("fixedDeposits.totalValue");
  const accumulatedCapitalLabel = t("fixedDeposits.accumulatedCapital");
  const sorted = [...cycles].sort((a, b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime());
  let cumInvested = 0;
  const data = sorted.map((c, i) => {
    cumInvested += c.capitalAdded;
    const value = isActive(c) ? c.capital : c.capital + (c.earnedInterest ?? 0);
    return {
      name: t("fixedDeposits.cycleLabel", { n: i + 1 }),
      [accumulatedCapitalLabel]: cumInvested,
      [totalValueLabel]: value,
    };
  });

  if (data.length < 2) return null;

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>{t("fixedDeposits.cdtEvolution")}</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => fmt(Number(v))} />
          <Line type="monotone" dataKey={totalValueLabel} stroke="#7c3aed" strokeWidth={2} dot />
          <Line type="monotone" dataKey={accumulatedCapitalLabel} stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Cycle Monthly History ─────────────────────────────────────────────

function CycleMonthlyHistory({ cycle }: { cycle: FixedDeposit }) {
  const { t } = useTranslation();
  const { data: snapshots = [] } = useFixedDepositSnapshots(cycle.id);
  const upsertMut = useUpsertFixedDepositSnapshot();
  const deleteMut = useDeleteFixedDepositSnapshot();

  const snapshotMap = useMemo(
    () => new Map(snapshots.map(s => [`${s.year}-${s.month}-${s.day}`, s])),
    [snapshots]
  );

  const projected = useMemo(() => buildMonthlyHistory(cycle), [cycle]);

  function handleSave(day: number, month: number, year: number, value: string) {
    const gain = Number(value.replace(/\D/g, ""));
    if (isNaN(gain)) return;
    upsertMut.mutate({ depositId: cycle.id, day, month, year, gain });
  }

  function handleDelete(day: number, month: number, year: number) {
    deleteMut.mutate({ depositId: cycle.id, day, month, year });
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {[t("fixedDeposits.colDate"), t("fixedDeposits.colDay"), t("fixedDeposits.colProjection"), t("fixedDeposits.colRealGain"), t("fixedDeposits.accumulatedRealGain"), t("fixedDeposits.colPctReturn"), ""].map(h => (
            <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {projected.map(pt => {
          const snapKey = `${pt.year}-${pt.month}-${pt.day}`;
          const snap = snapshotMap.get(snapKey) ?? null;
          return (
            <MonthRow
              key={`${pt.year}-${pt.month}-${pt.day}-${pt.daysElapsed}`}
              pt={pt}
              capital={cycle.capital}
              snap={snap}
              allSnaps={snapshots}
              onSave={handleSave}
              onDelete={handleDelete}
              saving={upsertMut.isPending}
            />
          );
        })}
      </tbody>
    </table>
  );
}

interface MonthlyPoint {
  label: string;
  day: number;
  month: number;
  year: number;
  daysElapsed: number;
  projectedValue: number;
  projectedGain: number;
  isStart: boolean;
  isEnd: boolean;
}

interface MonthRowProps {
  pt: MonthlyPoint;
  capital: number;
  snap: FixedDepositSnapshot | null;
  allSnaps: FixedDepositSnapshot[];
  onSave: (day: number, month: number, year: number, value: string) => void;
  onDelete: (day: number, month: number, year: number) => void;
  saving: boolean;
}

function MonthRow({ pt, capital, snap, allSnaps, onSave, onDelete, saving }: MonthRowProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(snap?.gain ?? ""));

  useMemo(() => { if (!editing) setValue(String(snap?.gain ?? "")); }, [snap, editing]);

  // snap.gain = total CDT value at that date → gain = value - capital
  const cumulativeReal = snap ? snap.gain - capital : 0;
  const realValue = snap ? snap.gain : 0;
  const pct = capital > 0 ? (cumulativeReal / capital) * 100 : 0;
  const hasReal = snap !== null;

  function handleSave() {
    onSave(pt.day, pt.month, pt.year, value);
    setEditing(false);
  }

  return (
    <tr style={{ borderTop: "1px solid #e5e7eb" }}>
      {/* Fecha */}
      <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 500 }}>
        {pt.label}
        {pt.isStart && <span style={{ fontSize: 10, color: "#7c3aed", marginLeft: 4, fontWeight: 600 }}>{t("fixedDeposits.startBadge")}</span>}
        {pt.isEnd && <span style={{ fontSize: 10, color: "#f59e0b", marginLeft: 4, fontWeight: 600 }}>{t("fixedDeposits.endsBadge")}</span>}
      </td>
      {/* Días desde inicio */}
      <td style={{ padding: "7px 10px", fontSize: 12, color: "#6b7280" }}>
        {pt.daysElapsed === 0 ? "—" : t("fixedDeposits.dayCount", { n: pt.daysElapsed })}
      </td>
      {/* Proyección: capital + ganancia proyectada acumulada */}
      <td style={{ padding: "7px 10px", fontSize: 12, color: "#6b7280" }}>{<Money amount={pt.projectedValue} />}</td>
      {/* Ganancia real: usuario ingresa valor total del CDT; se muestra ese valor */}
      <td style={{ padding: "7px 10px", fontSize: 12 }}>
        {editing ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
              style={{ ...input, width: 110, padding: "3px 6px" }}
              placeholder={t("fixedDeposits.currentCdtValuePlaceholder")}
              autoFocus
            />
            <button onClick={handleSave} disabled={saving} style={{ ...btn("#16a34a"), padding: "3px 8px", fontSize: 12 }}>✓</button>
            <button onClick={() => setEditing(false)} style={{ ...ghost, padding: "3px 8px", fontSize: 12 }}>✕</button>
          </div>
        ) : snap ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span
              style={{ fontWeight: 600, cursor: "pointer", borderBottom: "1px dashed #374151" }}
              onClick={() => { setValue(String(snap.gain)); setEditing(true); }}
              title={t("fixedDeposits.clickToEdit")}
            >
              {<Money amount={realValue} />}
            </span>
            <button
              onClick={() => onDelete(pt.day, pt.month, pt.year)}
              style={{ background: "none", borderTop: "none", borderLeft: "none", borderRight: "none", borderBottom: "none", cursor: "pointer", color: "#d1d5db", fontSize: 11, padding: 0 }}
              title={t("fixedDeposits.deleteWord")}
            >✕</button>
          </div>
        ) : (
          <button onClick={() => { setValue(""); setEditing(true); }} style={{ ...ghost, padding: "3px 10px", fontSize: 11 }}>
            {t("fixedDeposits.addButton")}
          </button>
        )}
      </td>
      {/* Ganancia acumulada real: solo los intereses */}
      <td style={{ padding: "7px 10px", fontSize: 12, color: hasReal ? "#16a34a" : "#9ca3af", fontWeight: hasReal ? 600 : 400 }}>
        {hasReal ? <>+<Money amount={cumulativeReal} /></> : "—"}
      </td>
      {/* % rentabilidad */}
      <td style={{ padding: "7px 10px", fontSize: 12 }}>
        {hasReal ? (
          <span style={{
            fontWeight: 600,
            color: pct >= 0 ? "#16a34a" : "#ef4444",
            background: pct >= 0 ? "#dcfce7" : "#fee2e2",
            padding: "2px 7px", borderRadius: 99, fontSize: 11,
          }}>
            {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
          </span>
        ) : "—"}
      </td>
      <td />
    </tr>
  );
}

// ── Cycle Row ─────────────────────────────────────────────────────────

interface CycleRowProps {
  cycle: FixedDeposit;
  index: number;
  onSaveInterest: (id: string, earnedInterest: number | null) => void;
  onDelete: (id: string) => void;
}

function CycleRow({ cycle, index, onSaveInterest, onDelete }: CycleRowProps) {
  const { t } = useTranslation();
  const active = isActive(cycle);
  const expected = calcExpectedValue(cycle.capital, cycle.interestRate, cycle.term, cycle.termUnit);
  const isExpired = parseLocalDate(cycle.endDate) < new Date();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(cycle.earnedInterest ?? 0));
  // snap.gain = total CDT value → gain for this cycle = lastSnap.gain - capital
  const sortedSnaps = [...(cycle.snapshots ?? [])].sort(compareSnapshots);
  const lastSnap = sortedSnaps.at(-1);
  const realAccGain = lastSnap ? lastSnap.gain - cycle.capital : 0;
  const hasRealSnaps = sortedSnaps.length > 0;
  const [showHistory, setShowHistory] = useState(false);

  function handleSave() {
    onSaveInterest(cycle.id, Number(editValue));
    setEditing(false);
  }

  function handleReopen() {
    onSaveInterest(cycle.id, null);
  }

  const statusBg = active ? (isExpired ? "#fef3c7" : "#dcfce7") : "#f3f4f6";
  const statusColor = active ? (isExpired ? "#92400e" : "#166534") : "#6b7280";
  const statusText = active ? (isExpired ? t("fixedDeposits.expired") : t("fixedDeposits.active")) : t("fixedDeposits.closed");

  return (
    <>
    <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
      <td style={{ padding: "10px 12px", fontSize: 13, color: "#6b7280" }}>{t("fixedDeposits.cycleLabel", { n: index + 1 })}</td>
      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 500 }}>{<Money amount={cycle.capital} />}</td>
      <td style={{ padding: "10px 12px", fontSize: 13, color: "#2563eb" }}>
        {index === 0 ? <Money amount={cycle.capitalAdded} /> : <>+<Money amount={cycle.capitalAdded} /></>}
      </td>
      <td style={{ padding: "10px 12px", fontSize: 13 }}>{cycle.interestRate}% EA · {termLabel(t, cycle.term, cycle.termUnit)}</td>
      <td style={{ padding: "10px 12px", fontSize: 13 }}>{formatDate(cycle.startDate)}</td>
      <td style={{ padding: "10px 12px", fontSize: 13 }}>{formatDate(cycle.endDate)}</td>
      <td style={{ padding: "10px 12px", fontSize: 13, color: "#16a34a", fontWeight: 500 }}>
        {editing ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              type="number"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              style={{ ...input, width: 100, padding: "3px 6px" }}
              autoFocus
            />
            <button onClick={handleSave} style={{ ...btn("#16a34a"), padding: "3px 8px", fontSize: 12 }}>✓</button>
            <button onClick={() => setEditing(false)} style={{ ...ghost, padding: "3px 8px", fontSize: 12 }}>✕</button>
          </div>
        ) : hasRealSnaps ? (
          <span style={{ color: "#16a34a", fontWeight: 600 }}>+{<Money amount={realAccGain} />}</span>
        ) : active ? (
          <span style={{ color: "#9ca3af" }}>~{<Money amount={expected - cycle.capital} />}</span>
        ) : (
          <span
            style={{ cursor: "pointer", borderBottom: "1px dashed #16a34a" }}
            onClick={() => { setEditValue(String(cycle.earnedInterest ?? 0)); setEditing(true); }}
            title={t("fixedDeposits.clickToEdit")}
          >
            {<Money amount={cycle.earnedInterest ?? 0} />}
          </span>
        )}
      </td>
      <td style={{ padding: "10px 12px" }}>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: statusBg, color: statusColor }}>
          {statusText}
        </span>
      </td>
      <td style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {active && (
            <button
              onClick={() => onSaveInterest(cycle.id, expected - cycle.capital)}
              style={{ ...btn("#16a34a"), padding: "4px 10px", fontSize: 12 }}
            >
              {t("fixedDeposits.closeButton")}
            </button>
          )}
          {!active && (
            <button onClick={handleReopen} style={{ ...ghost, padding: "4px 10px", fontSize: 12 }}>
              {t("fixedDeposits.reopen")}
            </button>
          )}
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{ ...ghost, padding: "4px 10px", fontSize: 12 }}
          >
            {showHistory ? "▲" : "▼"} {t("fixedDeposits.historyToggle")}
          </button>
          <button
            onClick={() => onDelete(cycle.id)}
            style={{ ...ghost, padding: "4px 8px", fontSize: 12, color: "#ef4444", borderColor: "#fca5a5" }}
          >✕</button>
        </div>
      </td>
    </tr>
    {showHistory && (
      <tr>
        <td colSpan={9} style={{ padding: 0, background: "#f9fafb" }}>
          <div style={{ padding: "12px 24px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
              {t("fixedDeposits.monthlyHistoryTitle", { n: index + 1 })}
            </div>
            <CycleMonthlyHistory cycle={cycle} />
          </div>
        </td>
      </tr>
    )}
    </>
  );
}

// ── New Group Form ────────────────────────────────────────────────────

interface NewGroupFormProps {
  onSave: (data: {
    name: string; entity: string; capital: number;
    interestRate: number; term: number; termUnit: TermUnit; startDate: string; endDate: string;
  }) => void;
  onCancel: () => void;
  loading: boolean;
}

function NewGroupForm({ onSave, onCancel, loading }: NewGroupFormProps) {
  const { t } = useTranslation();
  const today = new Date().toISOString().split("T")[0];
  const [name, setName] = useState("");
  const [entity, setEntity] = useState("");
  const [capital, setCapital] = useState("");
  const [rate, setRate] = useState("");
  const [term, setTerm] = useState("90");
  const [termUnit, setTermUnit] = useState<TermUnit>("DAYS");
  const [startDate, setStartDate] = useState(today);

  const endDate = useMemo(() => {
    if (!startDate) return "";
    return toDateInput(addTerm(parseLocalDate(startDate), Number(term), termUnit));
  }, [startDate, term, termUnit]);

  const expectedValue = useMemo(() => {
    const c = Number(capital.replace(/\D/g, ""));
    const r = Number(rate);
    const t = Number(term);
    if (!c || !r || !t) return null;
    return calcExpectedValue(c, r, t, termUnit);
  }, [capital, rate, term, termUnit]);

  function handleSubmit() {
    const c = Number(capital.replace(/\D/g, ""));
    if (!name || !entity || !c || !rate || !startDate) return;
    onSave({ name, entity, capital: c, interestRate: Number(rate), term: Number(term), termUnit, startDate, endDate });
  }

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "#374151" }}>{t("fixedDeposits.newCdtTitle")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <span style={label}>{t("fixedDeposits.nameLabel")}</span>
          <input style={input} placeholder="CDT Bancolombia" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("fixedDeposits.entityLabel")}</span>
          <input style={input} placeholder="Bancolombia" value={entity} onChange={e => setEntity(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("fixedDeposits.initialCapitalCOP")}</span>
          <input style={input} placeholder="1.000.000" value={capital}
            onChange={e => setCapital(e.target.value.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, "."))} />
        </div>
        <div>
          <span style={label}>{t("fixedDeposits.eaRate")}</span>
          <input style={input} type="number" placeholder="12.5" value={rate} onChange={e => setRate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("fixedDeposits.termLabelWord")}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...input, flex: 1 }} type="number" min={1} value={term} onChange={e => setTerm(e.target.value)} />
            <select
              value={termUnit}
              onChange={e => {
                const next = e.target.value as TermUnit;
                setTermUnit(next);
                setTerm(next === "DAYS" ? "90" : "3");
              }}
              style={{ ...input, width: 90 }}
            >
              <option value="DAYS">{t("fixedDeposits.daysOption")}</option>
              <option value="MONTHS">{t("fixedDeposits.monthsOption")}</option>
            </select>
          </div>
        </div>
        <div>
          <span style={label}>{t("fixedDeposits.startDateLabel")}</span>
          <input style={input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
      </div>
      {endDate && (
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
          {t("fixedDeposits.maturityLabel")} <strong>{formatDate(endDate)}</strong>
          {expectedValue !== null && <>
            {" "}· {t("fixedDeposits.expectedValueLabel")} <strong style={{ color: "#16a34a" }}>{<Money amount={expectedValue} />}</strong>
            {" "}· {t("fixedDeposits.estimatedInterestLabel")} <strong style={{ color: "#16a34a" }}>{<Money amount={expectedValue - Number(capital.replace(/\D/g, ""))} />}</strong>
          </>}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSubmit} style={btn()} disabled={loading}>
          {loading ? t("fixedDeposits.saving") : t("fixedDeposits.save")}
        </button>
        <button onClick={onCancel} style={ghost}>{t("fixedDeposits.cancel")}</button>
      </div>
    </div>
  );
}

// ── Renew Cycle Form ──────────────────────────────────────────────────

interface RenewFormProps {
  group: FixedDepositGroup;
  prevCycle: FixedDeposit;
  onSave: (data: {
    groupId: string; capital: number; capitalAdded: number;
    interestRate: number; term: number; termUnit: TermUnit; startDate: string; endDate: string;
  }) => void;
  onCancel: () => void;
  loading: boolean;
}

function RenewForm({ group, prevCycle, onSave, onCancel, loading }: RenewFormProps) {
  const { t } = useTranslation();
  const sortedSnaps = [...(prevCycle.snapshots ?? [])].sort(compareSnapshots);
  const lastSnap = sortedSnaps.at(-1);
  const hasRealSnaps = sortedSnaps.length > 0;
  const realAccGain = lastSnap ? lastSnap.gain - prevCycle.capital : 0;
  const prevValue = hasRealSnaps ? (lastSnap!.gain) : prevCycle.capital + (prevCycle.earnedInterest ?? 0);
  const [extraCapital, setExtraCapital] = useState("0");
  const [rate, setRate] = useState(String(prevCycle.interestRate));
  const [term, setTerm] = useState(String(prevCycle.term));
  const [termUnit, setTermUnit] = useState<TermUnit>(prevCycle.termUnit);
  const [startDate, setStartDate] = useState(prevCycle.endDate.split("T")[0]);

  const capitalAdded = Number(extraCapital.replace(/\D/g, "")) || 0;
  const newCapital = prevValue + capitalAdded;

  const endDate = useMemo(() => {
    if (!startDate) return "";
    return toDateInput(addTerm(parseLocalDate(startDate), Number(term), termUnit));
  }, [startDate, term, termUnit]);

  const expectedValue = calcExpectedValue(newCapital, Number(rate), Number(term), termUnit);

  function handleSubmit() {
    onSave({
      groupId: group.id,
      capital: newCapital,
      capitalAdded,
      interestRate: Number(rate),
      term: Number(term),
      termUnit,
      startDate,
      endDate,
    });
  }

  return (
    <div style={{ ...card, marginBottom: 16, borderColor: "#ddd6fe" }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "#374151" }}>
        {t("fixedDeposits.renewCdtTitle", { name: group.name })}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
        {t("fixedDeposits.previousCycleValue")} <strong>{<Money amount={prevValue} />}</strong>
        <span style={{ marginLeft: 6, color: "#9ca3af" }}>
          (<Money amount={prevCycle.capital} /> {t("fixedDeposits.capitalWord")}{hasRealSnaps ? <> + <Money amount={realAccGain} /> {t("fixedDeposits.realGainWord")}</> : prevCycle.earnedInterest ? <> + <Money amount={prevCycle.earnedInterest} /> {t("fixedDeposits.interestWord")}</> : ` ${t("fixedDeposits.noRealData")}`})
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <span style={label}>{t("fixedDeposits.additionalCapital")}</span>
          <input style={input} placeholder="0" value={extraCapital}
            onChange={e => setExtraCapital(e.target.value.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, "."))} />
        </div>
        <div>
          <span style={label}>{t("fixedDeposits.eaRate")}</span>
          <input style={input} type="number" value={rate} onChange={e => setRate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("fixedDeposits.termLabelWord")}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...input, flex: 1 }} type="number" min={1} value={term} onChange={e => setTerm(e.target.value)} />
            <select
              value={termUnit}
              onChange={e => setTermUnit(e.target.value as TermUnit)}
              style={{ ...input, width: 90 }}
            >
              <option value="DAYS">{t("fixedDeposits.daysOption")}</option>
              <option value="MONTHS">{t("fixedDeposits.monthsOption")}</option>
            </select>
          </div>
        </div>
        <div>
          <span style={label}>{t("fixedDeposits.startDateLabel")}</span>
          <input style={input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
        {t("fixedDeposits.newCapitalLabel")} <strong>{<Money amount={newCapital} />}</strong>
        {capitalAdded > 0 && <span> ({<Money amount={prevValue} />} + {<Money amount={capitalAdded} />})</span>}
        {" "}· {t("fixedDeposits.expectedValueLabel")} <strong style={{ color: "#16a34a" }}>{<Money amount={expectedValue} />}</strong>
        {endDate && <>{" "}· {t("fixedDeposits.maturityLabel")} <strong>{formatDate(endDate)}</strong></>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSubmit} style={btn()} disabled={loading}>
          {loading ? t("fixedDeposits.saving") : t("fixedDeposits.renew")}
        </button>
        <button onClick={onCancel} style={ghost}>{t("fixedDeposits.cancel")}</button>
      </div>
    </div>
  );
}

// ── Close Cycle Form ──────────────────────────────────────────────────

interface CloseCycleFormProps {
  cycle: FixedDeposit;
  onSave: (earnedInterest: number) => void;
  onCancel: () => void;
  loading: boolean;
}

function CloseCycleForm({ cycle, onSave, onCancel, loading }: CloseCycleFormProps) {
  const { t } = useTranslation();
  const estimated = calcExpectedValue(cycle.capital, cycle.interestRate, cycle.term, cycle.termUnit) - cycle.capital;
  const [earned, setEarned] = useState(String(estimated));

  return (
    <div style={{ ...card, marginBottom: 16, borderColor: "#bbf7d0" }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#374151" }}>{t("fixedDeposits.closeCycleTitle")}</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
        {t("fixedDeposits.enterActualInterest")} {<Money amount={estimated} />}).
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div style={{ width: 200 }}>
          <span style={label}>{t("fixedDeposits.earnedInterestCOP")}</span>
          <input style={input} type="number" value={earned} onChange={e => setEarned(e.target.value)} />
        </div>
        <button onClick={() => onSave(Number(earned))} style={btn("#16a34a")} disabled={loading}>
          {loading ? t("fixedDeposits.saving") : t("fixedDeposits.confirm")}
        </button>
        <button onClick={onCancel} style={ghost}>{t("fixedDeposits.cancel")}</button>
      </div>
    </div>
  );
}

// ── Group Detail ──────────────────────────────────────────────────────

interface GroupDetailProps {
  group: FixedDepositGroup;
  onBack: () => void;
}

function GroupDetail({ group, onBack }: GroupDetailProps) {
  const { t } = useTranslation();
  const [showRenew, setShowRenew] = useState(false);

  const addCycleMut = useAddFixedDepositCycle();
  const closeCycleMut = useCloseCycle();
  const updateEndDateMut = useUpdateCycleEndDate();
  const deleteCycleMut = useDeleteFixedDeposit();

  const sorted = useMemo(
    () => [...group.cycles].sort((a, b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime()),
    [group.cycles]
  );

  const summary = useMemo(() => computeSummary(group), [group]);
  const lastCycle = sorted.at(-1);

  async function handleRenew(data: Parameters<typeof addCycleMut.mutateAsync>[0]) {
    await addCycleMut.mutateAsync(data);
    setShowRenew(false);
  }

  async function handleSaveInterest(id: string, earnedInterest: number | null) {
    await closeCycleMut.mutateAsync({ id, earnedInterest });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={ghost}>{t("fixedDeposits.back")}</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{group.name}</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>{group.entity}</div>
        </div>
        {!showRenew && (
          <button onClick={() => setShowRenew(true)} style={{ ...btn(), marginLeft: "auto" }}>
            {t("fixedDeposits.addCycle")}
          </button>
        )}
      </div>

      <SummaryCards summary={summary} />
      <CyclesChart cycles={sorted} />

      {showRenew && lastCycle && (
        <RenewForm
          group={group}
          prevCycle={lastCycle}
          onSave={handleRenew}
          onCancel={() => setShowRenew(false)}
          loading={addCycleMut.isPending}
        />
      )}

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>{t("fixedDeposits.cycleHistoryTitle")}</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              {[t("fixedDeposits.colCycle"), t("fixedDeposits.colCapital"), t("fixedDeposits.colNewContribution"), t("fixedDeposits.colRate"), t("fixedDeposits.colStart"), t("fixedDeposits.colMaturity"), t("fixedDeposits.colEarnedInterest"), t("fixedDeposits.colStatus"), ""].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((cycle, i) => (
              <CycleRow
                key={cycle.id}
                cycle={cycle}
                index={i}
                onSaveInterest={handleSaveInterest}
                onDelete={id => deleteCycleMut.mutate(id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export default function FixedDepositsTab() {
  const { t } = useTranslation();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const { data: groups = [], isLoading } = useFixedDepositGroups();
  const addGroupMut = useAddFixedDepositGroup();
  const deleteGroupMut = useDeleteFixedDepositGroup();

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  if (selectedGroup) {
    return <GroupDetail group={selectedGroup} onBack={() => setSelectedGroupId(null)} />;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{t("fixedDeposits.cdtsTitle")}</div>
        <button onClick={() => setShowNewForm(true)} style={btn()}>{t("fixedDeposits.newCdtButton")}</button>
      </div>

      {showNewForm && (
        <NewGroupForm
          onSave={async (data) => {
            await addGroupMut.mutateAsync(data);
            setShowNewForm(false);
          }}
          onCancel={() => setShowNewForm(false)}
          loading={addGroupMut.isPending}
        />
      )}

      {isLoading && <div style={{ color: "#9ca3af", fontSize: 13 }}>{t("fixedDeposits.loading")}</div>}

      {!isLoading && groups.length === 0 && !showNewForm && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 13 }}>
          {t("fixedDeposits.noCdtsYet")}
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {groups.map(group => {
          const summary = computeSummary(group);
          const lastCycle = [...group.cycles].sort((a, b) => parseLocalDate(b.startDate).getTime() - parseLocalDate(a.startDate).getTime())[0];
          const active = lastCycle ? isActive(lastCycle) : false;
          const isExpired = lastCycle ? parseLocalDate(lastCycle.endDate) < new Date() : false;

          return (
            <div
              key={group.id}
              style={{ ...card, cursor: "pointer", display: "flex", alignItems: "center", gap: 16 }}
              onClick={() => setSelectedGroupId(group.id)}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{group.name}</div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>{group.entity} · {group.cycles.length} {t("fixedDeposits.cycleWord")}{group.cycles.length !== 1 ? "s" : ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{t("fixedDeposits.totalInvested")}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#2563eb" }}>{<Money amount={summary.totalInvested} />}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{t("fixedDeposits.currentValue")}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#7c3aed" }}>{<Money amount={summary.currentValue} />}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{t("fixedDeposits.accumulatedRealGain")}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#16a34a" }}>
                  {summary.hasRealData ? <>+<Money amount={summary.realAccumulatedGain} /></> : "—"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{t("fixedDeposits.pctGain")}</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {summary.hasRealData ? (
                    <span style={{
                      color: summary.realAccumulatedGain >= 0 ? "#16a34a" : "#ef4444",
                      background: summary.realAccumulatedGain >= 0 ? "#dcfce7" : "#fee2e2",
                      padding: "2px 8px", borderRadius: 99, fontSize: 12,
                    }}>
                      {summary.totalInvested > 0
                        ? `${summary.realAccumulatedGain >= 0 ? "+" : ""}${((summary.realAccumulatedGain / summary.totalInvested) * 100).toFixed(2)}%`
                        : "—"}
                    </span>
                  ) : "—"}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                background: active ? (isExpired ? "#fef3c7" : "#dcfce7") : "#f3f4f6",
                color: active ? (isExpired ? "#92400e" : "#166534") : "#6b7280",
              }}>
                {active ? (isExpired ? t("fixedDeposits.expired") : t("fixedDeposits.active")) : group.cycles.length === 0 ? t("fixedDeposits.noCycles") : t("fixedDeposits.closed")}
              </span>
              <button
                onClick={e => { e.stopPropagation(); deleteGroupMut.mutate(group.id); }}
                style={{ ...ghost, color: "#ef4444", borderColor: "#fca5a5" }}
              >✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
