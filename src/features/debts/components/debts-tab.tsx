"use client";

import { Fragment, useMemo, useState } from "react";
import {
  useMortgages,
  useAddMortgage,
  useDeleteMortgage,
  useAddMortgagePayment,
  useUpdateMortgagePayment,
  useDeleteMortgagePayment,
  type Mortgage,
  type MortgagePayment,
} from "@/hooks/use-finance-data";
import { formatCopInput, parse, fmtMoney } from "@/lib/formatters";
import Money from "@/components/ui/money";
import Kpi from "@/components/ui/kpi";
import EditableCell from "@/components/ui/editable-cell";
import { useTranslation } from "@/hooks/use-translation";
import {
  ComposedChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function todayInput(): string {
  return new Date().toISOString().split("T")[0];
}

function addMonths(iso: string, months: number): Date {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// ── Summary calculations ─────────────────────────────────────────────

function computeMortgageSummary(mortgage: Mortgage) {
  const totalPrincipalPaid = mortgage.payments.reduce((s, p) => s + p.principalPaid, 0);
  const totalInterestPaid = mortgage.payments.reduce((s, p) => s + p.interestPaid, 0);
  const totalInterestCovered = mortgage.payments.reduce((s, p) => s + p.interestCovered, 0);
  const totalInsurancePaid = mortgage.payments.reduce((s, p) => s + p.insurancePaid, 0);
  const totalPaid = totalPrincipalPaid + totalInterestPaid + totalInsurancePaid;
  const outstandingBalance = mortgage.principal - totalPrincipalPaid;
  const pctPaidOff = mortgage.principal > 0 ? (totalPrincipalPaid / mortgage.principal) * 100 : 0;
  const regularCuotasPaid = mortgage.payments.filter(p => !p.isExtra).length;

  const withRealBalance = [...mortgage.payments]
    .filter(p => p.realBalance != null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const lastVerified = withRealBalance[0] ?? null;

  return {
    totalPrincipalPaid, totalInterestPaid, totalInterestCovered, totalInsurancePaid, totalPaid,
    outstandingBalance, pctPaidOff, regularCuotasPaid,
    lastVerifiedBalance: lastVerified?.realBalance ?? null,
    lastVerifiedDate: lastVerified?.date ?? null,
  };
}

type PaymentWithBalance = MortgagePayment & { balanceAfter: number; cuotaNumber: number };

function groupByYear<T extends { date: string }>(rows: T[]): Array<[number, T[]]> {
  const map = new Map<number, T[]>();
  for (const r of rows) {
    const y = new Date(r.date).getUTCFullYear();
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(r);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

// ── Trend-based projection (estimate only, not stored) ──────────────────
//
// We don't have a reliable closed-form for this loan's real cuota — the
// Colombian rate-coverage subsidy is a capped peso amount (not a clean
// rate), so a fresh fixed-payment amortization formula produces jumps that
// don't match reality. Instead we extrapolate the recent observed trend
// (principal rising, interest falling by a similar amount each month),
// and fold the subsidy's contribution into the client's own interest once
// the benefit period ends.

interface ProjectedRow {
  date: string;
  cuotaNumber: number;
  principalPaid: number;
  interestPaid: number;
  extraPaid: number;
  balanceAfter: number;
}

function projectRemaining(mortgage: Mortgage, extraMonthly: number): ProjectedRow[] {
  const sorted = [...mortgage.payments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  // Trend/anchor must come from regular cuotas only — an extra principal
  // payment (large principal, zero interest) is a one-off event, not part
  // of the recurring monthly pattern, and would otherwise distort the
  // extrapolated interest/principal trend if it happens to be the most
  // recent payment on file.
  const regular = sorted.filter(p => !p.isExtra);
  if (regular.length < 3) return [];
  const totalPrincipalPaid = sorted.reduce((s, p) => s + p.principalPaid, 0);
  let balance = mortgage.principal - totalPrincipalPaid;
  const regularCuotasPaid = regular.length;
  const remainingMonths = mortgage.termMonths - regularCuotasPaid;
  if (remainingMonths <= 0 || balance <= 0) return [];

  const n = Math.min(6, regular.length);
  const recent = regular.slice(-n);
  const avgDelta = (get: (p: MortgagePayment) => number) => {
    let total = 0;
    for (let i = 1; i < recent.length; i++) total += get(recent[i]) - get(recent[i - 1]);
    return total / (recent.length - 1);
  };
  const deltaPrincipal = avgDelta(p => p.principalPaid);
  const deltaCovered = avgDelta(p => p.interestCovered);

  let principal = recent[recent.length - 1].principalPaid;
  let interest = recent[recent.length - 1].interestPaid;
  let covered = recent[recent.length - 1].interestCovered;

  const subsidyEnd = mortgage.subsidyEndDate ? new Date(mortgage.subsidyEndDate) : null;
  let cursor = new Date(regular[regular.length - 1].date);

  const rows: ProjectedRow[] = [];
  for (let month = 0; month < remainingMonths && balance > 1; month++) {
    cursor = new Date(cursor);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    const subsidized = subsidyEnd ? cursor <= subsidyEnd : false;

    principal = principal + deltaPrincipal;
    if (subsidized) {
      interest = Math.max(0, interest - deltaPrincipal);
      covered = Math.max(0, covered + deltaCovered);
    } else {
      // Subsidy over: the client now also absorbs what the benefit used to
      // cover, added once at the transition, then the trend continues.
      interest = Math.max(0, interest - deltaPrincipal) + covered;
      covered = 0;
    }
    if (principal < 0) principal = 0;
    if (principal > balance) principal = balance;

    const extra = Math.min(extraMonthly, Math.max(0, balance - principal));
    balance = Math.max(0, balance - principal - extra);

    rows.push({
      date: cursor.toISOString().slice(0, 10),
      cuotaNumber: regularCuotasPaid + month + 1,
      principalPaid: Math.round(principal),
      interestPaid: Math.round(interest),
      extraPaid: Math.round(extra),
      balanceAfter: Math.round(balance),
    });
  }
  return rows;
}

function summarizeProjection(rows: ProjectedRow[]) {
  const months = rows.length;
  const totalInterest = rows.reduce((s, r) => s + r.interestPaid, 0);
  const payoffDate = rows.length > 0 ? rows[rows.length - 1].date : null;
  return { months, totalInterest, payoffDate };
}

// Counterfactual: interest still owed if NO extra-to-principal payment had
// ever been made (real history only — no assumed future extras either).
// Reconstructs the balance as if every isExtra payment never happened (so
// it's higher than the real outstanding balance), then extrapolates the
// same real recent trend forward. Regular cuotas already paid don't change
// in this counterfactual (extras never consume a cuota slot), so the loan
// simply takes longer than the nominal term to reach zero.
function projectNoExtraCounterfactual(mortgage: Mortgage): ProjectedRow[] {
  const sorted = [...mortgage.payments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  // Same reasoning as projectRemaining: the trend/anchor must come from
  // regular cuotas only, never from a one-off extra payment.
  const regular = sorted.filter(p => !p.isExtra);
  if (regular.length < 3) return [];
  const regularPrincipalPaid = regular.reduce((s, p) => s + p.principalPaid, 0);
  let balance = mortgage.principal - regularPrincipalPaid;
  const regularCuotasPaid = regular.length;
  if (balance <= 0) return [];

  const n = Math.min(6, regular.length);
  const recent = regular.slice(-n);
  const avgDelta = (get: (p: MortgagePayment) => number) => {
    let total = 0;
    for (let i = 1; i < recent.length; i++) total += get(recent[i]) - get(recent[i - 1]);
    return total / (recent.length - 1);
  };
  const deltaPrincipal = avgDelta(p => p.principalPaid);
  const deltaCovered = avgDelta(p => p.interestCovered);

  let principal = recent[recent.length - 1].principalPaid;
  let interest = recent[recent.length - 1].interestPaid;
  let covered = recent[recent.length - 1].interestCovered;

  const subsidyEnd = mortgage.subsidyEndDate ? new Date(mortgage.subsidyEndDate) : null;
  let cursor = new Date(regular[regular.length - 1].date);

  // Same month cap as the real-extras projection below, so that when there
  // are no real extra payments yet (totalExtraPrincipalPaid === 0) both
  // starting balances and both projections are identical — no artificial gap.
  const remainingMonths = mortgage.termMonths - regularCuotasPaid;
  const rows: ProjectedRow[] = [];
  for (let month = 0; month < remainingMonths && balance > 1; month++) {
    cursor = new Date(cursor);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    const subsidized = subsidyEnd ? cursor <= subsidyEnd : false;

    principal = principal + deltaPrincipal;
    if (subsidized) {
      interest = Math.max(0, interest - deltaPrincipal);
      covered = Math.max(0, covered + deltaCovered);
    } else {
      interest = Math.max(0, interest - deltaPrincipal) + covered;
      covered = 0;
    }
    if (principal < 0) principal = 0;
    if (principal > balance) principal = balance;

    balance = Math.max(0, balance - principal);

    rows.push({
      date: cursor.toISOString().slice(0, 10),
      cuotaNumber: regularCuotasPaid + month + 1,
      principalPaid: Math.round(principal),
      interestPaid: Math.round(interest),
      extraPaid: 0,
      balanceAfter: Math.round(balance),
    });
  }
  return rows;
}

// ── Main tab ──────────────────────────────────────────────────────────

export default function DebtsTab() {
  const { t } = useTranslation();
  const { data: mortgages = [] } = useMortgages();
  const addMortgageMut = useAddMortgage();
  const deleteMortgageMut = useDeleteMortgage();
  const [showNewForm, setShowNewForm] = useState(false);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>{t("debts.title")}</h2>
        {!showNewForm && <button onClick={() => setShowNewForm(true)} style={btn()}>{t("debts.newMortgage")}</button>}
      </div>

      {showNewForm && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#374151" }}>{t("debts.newMortgageTitle")}</div>
          <NewMortgageForm
            onSave={data => { addMortgageMut.mutate(data); setShowNewForm(false); }}
            onCancel={() => setShowNewForm(false)}
            loading={addMortgageMut.isPending}
          />
        </div>
      )}

      {mortgages.length === 0 && !showNewForm && (
        <div style={{ ...card, color: "#9ca3af", fontSize: 13 }}>{t("debts.noMortgages")}</div>
      )}

      {mortgages.map(m => (
        <MortgageCard key={m.id} mortgage={m} onDelete={() => deleteMortgageMut.mutate(m.id)} />
      ))}
    </>
  );
}

function StatRow({ label: l, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
      <span style={{ color: "#6b7280" }}>{l}</span>
      <span style={{ fontWeight: 600, color: valueColor ?? "#1f2937" }}>{value}</span>
    </div>
  );
}

function MortgageCard({ mortgage, onDelete }: { mortgage: Mortgage; onDelete: () => void }) {
  const { t } = useTranslation();
  const addPaymentMut = useAddMortgagePayment();
  const updatePaymentMut = useUpdateMortgagePayment();
  const deletePaymentMut = useDeleteMortgagePayment();
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const summary = computeMortgageSummary(mortgage);
  const payoffDate = addMonths(mortgage.startDate, mortgage.termMonths);

  const sortedPayments = [...mortgage.payments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const paymentsWithBalance = sortedPayments.reduce<PaymentWithBalance[]>((acc, p) => {
    const prevBalance = acc.length > 0 ? acc[acc.length - 1].balanceAfter : mortgage.principal;
    const prevCuota = acc.length > 0 ? acc[acc.length - 1].cuotaNumber : 0;
    // Only regular cuotas advance the installment counter — an abono extra
    // a capital is associated with the cuota it follows, not its own number.
    const cuotaNumber = p.isExtra ? prevCuota : prevCuota + 1;
    acc.push({ ...p, balanceAfter: prevBalance - p.principalPaid, cuotaNumber });
    return acc;
  }, []);

  const paymentYears = useMemo(() => groupByYear(paymentsWithBalance), [paymentsWithBalance]);
  const latestYear = paymentYears[0]?.[0];
  const [expandedYears, setExpandedYears] = useState<Set<number> | null>(null);
  const effectiveExpandedYears = expandedYears ?? new Set(latestYear != null ? [latestYear] : []);
  function toggleYear(y: number) {
    const next = new Set(effectiveExpandedYears);
    if (next.has(y)) next.delete(y); else next.add(y);
    setExpandedYears(next);
  }

  // Shared "what if I pay extra to principal" scenario — used by both the
  // interest KPI cards and the detailed projection section below, so typing
  // an amount once is reflected everywhere.
  const [extraMonthlyInput, setExtraMonthlyInput] = useState("");
  const extraMonthly = parse(extraMonthlyInput) || 0;
  const baselineProjection = useMemo(() => projectRemaining(mortgage, 0), [mortgage]);
  const withExtraProjection = useMemo(
    () => extraMonthly > 0 ? projectRemaining(mortgage, extraMonthly) : baselineProjection,
    [mortgage, extraMonthly, baselineProjection]
  );
  const baseProjSummary = summarizeProjection(baselineProjection);
  const extraProjSummary = summarizeProjection(withExtraProjection);
  const interestSaved = baseProjSummary.totalInterest - extraProjSummary.totalInterest;
  const monthsSaved = baseProjSummary.months - extraProjSummary.months;
  const totalInterestLifeOfLoan = summary.totalInterestPaid + baseProjSummary.totalInterest;

  // Real (not hypothetical) figures: `baselineProjection` above already
  // starts from the real current balance, so it already reflects every real
  // extra payment made so far — that's "interest remaining, with real
  // extras." The counterfactual below reconstructs what would still be owed
  // had none of those real extras ever been paid, so the gap between the two
  // is "interest saved," grounded entirely in real history.
  const totalExtraPrincipalPaid = useMemo(
    () => mortgage.payments.filter(p => p.isExtra).reduce((s, p) => s + p.principalPaid, 0),
    [mortgage]
  );
  const extraPaymentCount = useMemo(() => mortgage.payments.filter(p => p.isExtra).length, [mortgage]);
  const noExtraProjection = useMemo(() => projectNoExtraCounterfactual(mortgage), [mortgage]);
  const noExtraSummary = summarizeProjection(noExtraProjection);
  const realInterestSaved = noExtraSummary.totalInterest - baseProjSummary.totalInterest;

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
            {mortgage.name}
            {mortgage.isUvrIndexed && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#7c3aed", background: "#ede9fe", padding: "2px 8px", borderRadius: 20 }}>UVR</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>{mortgage.entity}</div>
        </div>
        <button
          onClick={() => { if (confirm(t("debts.confirmDeleteMortgage"))) onDelete(); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 13 }}
        >✕</button>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
            {t("debts.installmentProgress", { count: summary.regularCuotasPaid, total: mortgage.termMonths })}
          </span>
          <span style={{ textAlign: "right" }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#7c3aed" }}>{summary.pctPaidOff.toFixed(1)}%</span>
            <div style={{ fontSize: 10, color: "#9ca3af" }}>{t("debts.pctPaidOffLabel")}</div>
          </span>
        </div>
        <div style={{ height: 10, borderRadius: 6, background: "#ede9fe", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${Math.min(100, summary.pctPaidOff)}%`, borderRadius: 6,
            background: "linear-gradient(90deg,#a78bfa,#7c3aed)", transition: "width .3s",
          }} />
        </div>
      </div>

      {/* KPI cards — capital */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Kpi title={t("debts.principal")} value={<Money amount={mortgage.principal} />} sub={fmtDate(mortgage.startDate)} color="#6366f1" />
        <Kpi title={t("debts.outstandingBalance")} value={<Money amount={summary.outstandingBalance} />} color="#7c3aed" />
        {summary.lastVerifiedBalance != null && summary.lastVerifiedDate && (
          <Kpi
            title={t("debts.lastVerifiedBalance")}
            value={<Money amount={summary.lastVerifiedBalance} />}
            sub={fmtDate(summary.lastVerifiedDate)}
            color="#059669"
            tag={{ bg: "#d1fae5", fg: "#065f46", text: t("debts.bankTag") }}
          />
        )}
        <Kpi title={t("debts.principalPaid")} value={<Money amount={summary.totalPrincipalPaid} />} color="#059669" />
        {extraPaymentCount > 0 && (
          <Kpi
            title={t("debts.extraPaid")}
            value={<Money amount={totalExtraPrincipalPaid} />}
            sub={t(extraPaymentCount === 1 ? "debts.extraPaymentCount" : "debts.extraPaymentCountPlural", { count: extraPaymentCount })}
            color="#059669"
          />
        )}
      </div>

      {/* KPI cards — interest */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Kpi title={t("debts.totalInterestLifeOfLoan")} value={<Money amount={totalInterestLifeOfLoan} />} color="#dc2626" />
        <Kpi title={t("debts.interestPaid")} value={<Money amount={summary.totalInterestPaid} />} color="#dc2626" />
        <Kpi title={t("debts.interestRemaining")} value={<Money amount={noExtraSummary.totalInterest} />} sub={t("debts.noExtraPaymentSub")} color="#f59e0b" />
        <Kpi title={t("debts.interestRemaining")} value={<Money amount={baseProjSummary.totalInterest} />} sub={t("debts.withRealExtraSub")} color="#f59e0b"
          tag={{ bg: "#d1fae5", fg: "#065f46", text: t("debts.realTag") }} />
        {totalExtraPrincipalPaid > 0 && (
          <Kpi
            title={t("debts.interestSaved")}
            value={<Money amount={realInterestSaved} />}
            sub={t(extraPaymentCount === 1 ? "debts.fromRealExtraPayment" : "debts.fromRealExtraPayments", { count: extraPaymentCount })}
            color="#059669"
            tag={{ bg: "#d1fae5", fg: "#065f46", text: t("debts.realTag") }}
          />
        )}
      </div>

      {/* Secondary stats */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 28px", marginBottom: 4, fontSize: 12 }}>
        <span style={{ color: "#9ca3af" }}>{t("debts.totalPaid")}: <strong style={{ color: "#374151" }}><Money amount={summary.totalPaid} /></strong></span>
        <span style={{ color: "#9ca3af" }}>{t("debts.insurancePaid")}: <strong style={{ color: "#374151" }}><Money amount={summary.totalInsurancePaid} /></strong></span>
        <span style={{ color: "#9ca3af" }}>{t("debts.rateContracted")}: <strong style={{ color: "#374151" }}>{mortgage.interestRate.toFixed(2)}%</strong></span>
        {mortgage.subsidizedRate != null && (
          <span style={{ color: "#9ca3af" }}>{t("debts.rateCharged")}: <strong style={{ color: "#059669" }}>{mortgage.subsidizedRate.toFixed(2)}%</strong></span>
        )}
        <span style={{ color: "#9ca3af" }}>{t("debts.term")}: <strong style={{ color: "#374151" }}>{t("debts.termValue", { months: mortgage.termMonths, start: fmtDate(mortgage.startDate), end: fmtDate(payoffDate.toISOString()) })}</strong></span>
      </div>

      {(mortgage.subsidyRate != null || summary.totalInterestCovered > 0) && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "8px 14px", marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#065f46", marginBottom: 2 }}>{t("debts.rateBenefit")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 20px", fontSize: 12 }}>
            {mortgage.subsidyRate != null && (
              <span style={{ color: "#6b7280" }}>{t("debts.rateCoverage")}: <strong style={{ color: "#059669" }}>{mortgage.subsidyRate.toFixed(2)}%</strong></span>
            )}
            {mortgage.subsidyEndDate && (
              <span style={{ color: "#6b7280" }}>{t("debts.expires")}: <strong style={{ color: "#374151" }}>{fmtDate(mortgage.subsidyEndDate)}</strong></span>
            )}
            <span style={{ color: "#6b7280" }}>{t("debts.totalBenefitReceived")}: <strong style={{ color: "#059669" }}><Money amount={summary.totalInterestCovered} /></strong></span>
          </div>
        </div>
      )}

      <MortgageCharts mortgage={mortgage} paymentsWithBalance={paymentsWithBalance} paymentYears={paymentYears} summary={summary} />

      <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 12, paddingTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showPaymentForm ? 12 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("debts.payments")}</div>
          {!showPaymentForm && <button onClick={() => setShowPaymentForm(true)} style={btn()}>{t("debts.addPayment")}</button>}
        </div>

        {showPaymentForm && (
          <PaymentForm
            lastPayment={sortedPayments.length > 0 ? sortedPayments[sortedPayments.length - 1] : null}
            onSave={data => { addPaymentMut.mutate({ mortgageId: mortgage.id, ...data }); setShowPaymentForm(false); }}
            onCancel={() => setShowPaymentForm(false)}
            loading={addPaymentMut.isPending}
          />
        )}

        {paymentsWithBalance.length === 0 ? (
          <div style={{ padding: "12px 0", color: "#9ca3af", fontSize: 12 }}>{t("debts.noPayments")}</div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {[t("debts.colNo"), t("debts.colDate"), t("debts.colType"), t("debts.colPrincipal"), t("debts.colInterest"), t("debts.colInsurance"), t("debts.colBenefit"), t("debts.colTotal"), t("debts.colBalanceAfter"), t("debts.colRealBalance"), t("debts.colNotes"), ""].map((h, i) => (
                    <th key={i} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paymentYears.map(([year, rows]) => {
                  const expanded = effectiveExpandedYears.has(year);
                  const yearPrincipal = rows.reduce((s, r) => s + r.principalPaid, 0);
                  const yearInterest = rows.reduce((s, r) => s + r.interestPaid, 0);
                  return (
                    <Fragment key={`y-${year}`}>
                      <tr style={{ borderTop: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer" }}
                        onClick={() => toggleYear(year)}>
                        <td colSpan={11} style={{ padding: "6px 10px", fontWeight: 700, color: "#374151", fontSize: 12 }}>
                          {expanded ? "▾" : "▸"} {year} · {rows.length} {t("debts.paymentWord")}{rows.length !== 1 ? "s" : ""} ·{" "}
                          <span style={{ color: "#059669", fontWeight: 500 }}>{t("debts.colPrincipal")} <Money amount={yearPrincipal} /></span>
                          {" · "}
                          <span style={{ color: "#dc2626", fontWeight: 500 }}>{t("debts.colInterest")} <Money amount={yearInterest} /></span>
                        </td>
                      </tr>
                      {expanded && [...rows].reverse().map(p => (
                        <tr key={p.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "7px 10px", color: "#9ca3af" }}>#{p.cuotaNumber}</td>
                          <td style={{ padding: "7px 10px" }}>{fmtDate(p.date)}</td>
                          <td style={{ padding: "7px 10px" }}>
                            {p.isExtra
                              ? <span style={{ color: "#7c3aed", fontWeight: 600 }}>{t("debts.typeExtraPayment")}</span>
                              : <span style={{ color: "#6b7280" }}>{t("debts.typeInstallment")}</span>}
                          </td>
                          <td style={{ padding: "7px 10px" }}>
                            <EditableCell value={p.principalPaid} edited onChange={(v) => updatePaymentMut.mutate({ id: p.id, principalPaid: v })} />
                          </td>
                          <td style={{ padding: "7px 10px" }}>
                            <EditableCell value={p.interestPaid} edited onChange={(v) => updatePaymentMut.mutate({ id: p.id, interestPaid: v })} />
                          </td>
                          <td style={{ padding: "7px 10px" }}>
                            <EditableCell value={p.insurancePaid} edited={p.insurancePaid > 0} onChange={(v) => updatePaymentMut.mutate({ id: p.id, insurancePaid: v })} />
                          </td>
                          <td style={{ padding: "7px 10px" }}>
                            <EditableCell value={p.interestCovered} edited={p.interestCovered > 0} onChange={(v) => updatePaymentMut.mutate({ id: p.id, interestCovered: v })} />
                          </td>
                          <td style={{ padding: "7px 10px" }}>{<Money amount={p.principalPaid + p.interestPaid + p.insurancePaid} />}</td>
                          <td style={{ padding: "7px 10px", color: "#7c3aed", fontWeight: 600 }}>{<Money amount={p.balanceAfter} />}</td>
                          <td style={{ padding: "7px 10px" }}>
                            <EditableCell
                              value={p.realBalance ?? 0}
                              edited={p.realBalance != null}
                              onChange={(v) => updatePaymentMut.mutate({ id: p.id, realBalance: v })}
                            />
                            {p.realBalance != null && Math.abs(p.realBalance - p.balanceAfter) > 1000 && (
                              <span style={{ color: "#d97706", fontWeight: 400, fontSize: 11 }} title={t("debts.realBalanceDiffHint")}> ⚠</span>
                            )}
                          </td>
                          <td style={{ padding: "7px 10px", color: /Estimad/.test(p.notes) ? "#d97706" : "#6b7280", fontStyle: /Estimad/.test(p.notes) ? "italic" : "normal" }}>{p.notes || "—"}</td>
                          <td style={{ padding: "7px 10px", textAlign: "right" }}>
                            <button
                              onClick={() => deletePaymentMut.mutate(p.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 11 }}
                            >✕</button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProjectionSection
        extraMonthlyInput={extraMonthlyInput}
        setExtraMonthlyInput={setExtraMonthlyInput}
        extraMonthly={extraMonthly}
        baseline={baselineProjection}
        withExtra={withExtraProjection}
        baseSummary={baseProjSummary}
        extraSummary={extraProjSummary}
        interestSaved={interestSaved}
        monthsSaved={monthsSaved}
      />
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────

const CHART_COLORS = {
  principal: "#059669",
  interest: "#dc2626",
  insurance: "#6b7280",
  benefit: "#7c3aed",
  balance: "#7c3aed",
  balanceProjected: "#c4b5fd",
  realBalance: "#059669",
};

function MortgageCharts({ mortgage, paymentsWithBalance, paymentYears, summary }: {
  mortgage: Mortgage;
  paymentsWithBalance: PaymentWithBalance[];
  paymentYears: Array<[number, PaymentWithBalance[]]>;
  summary: ReturnType<typeof computeMortgageSummary>;
}) {
  const { t } = useTranslation();

  const balanceData = useMemo(() => {
    const actual = paymentsWithBalance.map(p => ({
      cuota: p.cuotaNumber,
      label: fmtDate(p.date),
      balance: p.balanceAfter,
    }));
    const projected = projectRemaining(mortgage, 0).map(r => ({
      cuota: r.cuotaNumber,
      label: fmtDate(r.date),
      projectedBalance: r.balanceAfter,
    }));
    if (actual.length > 0 && projected.length > 0) {
      const bridge = { ...actual[actual.length - 1], projectedBalance: actual[actual.length - 1].balance };
      return [...actual.slice(0, -1), bridge, ...projected];
    }
    return actual;
  }, [mortgage, paymentsWithBalance]);

  const yearlyData = useMemo(() =>
    [...paymentYears].reverse().map(([year, rows]) => ({
      year: String(year),
      principal: rows.reduce((s, r) => s + r.principalPaid, 0),
      interest: rows.reduce((s, r) => s + r.interestPaid, 0),
    })), [paymentYears]);

  const breakdownData = [
    { name: t("debts.colPrincipal"), value: summary.totalPrincipalPaid, color: CHART_COLORS.principal },
    { name: t("debts.colInterest"), value: summary.totalInterestPaid, color: CHART_COLORS.interest },
    { name: t("debts.colInsurance"), value: summary.totalInsurancePaid, color: CHART_COLORS.insurance },
    { name: t("debts.colBenefit"), value: summary.totalInterestCovered, color: CHART_COLORS.benefit },
  ].filter(d => d.value > 0);

  const moneyTick = (v: number) => `${(v / 1_000_000).toFixed(0)}M`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moneyTooltip = (v: any) => fmtMoney(Number(v), "COP");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dateLabelFormatter = (_label: any, payload: any) => payload?.[0]?.payload?.label ?? _label;
  const balanceXTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let c = 5; c <= mortgage.termMonths; c += 5) ticks.push(c);
    return ticks;
  }, [mortgage.termMonths]);
  const cuotaTick = (v: number) => `#${v}`;

  if (paymentsWithBalance.length === 0) return null;

  return (
    <div style={{ marginTop: 4, marginBottom: 4 }}>
      <div style={{ background: "#fff", border: "1px solid #f3f4f6", borderRadius: 10, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>{t("debts.chartBalanceTitle")}</div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={balanceData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="cuota" tick={{ fontSize: 10 }} tickFormatter={cuotaTick} ticks={balanceXTicks} interval={0} />
            <YAxis
              tick={{ fontSize: 10 }} tickFormatter={moneyTick} width={40}
              domain={([dataMin, dataMax]: readonly [number, number]) => {
                const pad = (dataMax - dataMin) * 0.1 || dataMax * 0.05;
                return [Math.max(0, dataMin - pad), dataMax + pad] as [number, number];
              }}
            />
            <Tooltip formatter={moneyTooltip} labelFormatter={dateLabelFormatter} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="balance" name={t("debts.chartBalanceActual")} stroke={CHART_COLORS.balance} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="projectedBalance" name={t("debts.chartBalanceProjected")} stroke={CHART_COLORS.balanceProjected} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 280, background: "#fff", border: "1px solid #f3f4f6", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>{t("debts.chartYearlyTitle")}</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={yearlyData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={moneyTick} width={40} />
              <Tooltip formatter={moneyTooltip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="principal" name={t("debts.colPrincipal")} stackId="a" fill={CHART_COLORS.principal} />
              <Bar dataKey="interest" name={t("debts.colInterest")} stackId="a" fill={CHART_COLORS.interest} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ flex: 1, minWidth: 220, background: "#fff", border: "1px solid #f3f4f6", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>{t("debts.chartBreakdownTitle")}</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={breakdownData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {breakdownData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={moneyTooltip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Projection section ───────────────────────────────────────────────

function ProjectionSection({
  extraMonthlyInput, setExtraMonthlyInput, extraMonthly,
  baseline, withExtra, baseSummary, extraSummary, interestSaved, monthsSaved,
}: {
  extraMonthlyInput: string;
  setExtraMonthlyInput: (v: string) => void;
  extraMonthly: number;
  baseline: ProjectedRow[];
  withExtra: ProjectedRow[];
  baseSummary: ReturnType<typeof summarizeProjection>;
  extraSummary: ReturnType<typeof summarizeProjection>;
  interestSaved: number;
  monthsSaved: number;
}) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  if (baseline.length === 0) return null;

  const rowsToShow = extraMonthly > 0 ? withExtra : baseline;
  const years = groupByYear(rowsToShow);

  function toggleYear(y: number) {
    const next = new Set(expandedYears);
    if (next.has(y)) next.delete(y); else next.add(y);
    setExpandedYears(next);
  }

  return (
    <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 12, paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{t("debts.projectionTitle")}</div>
        <button onClick={() => setShow(s => !s)} style={ghost}>{show ? t("debts.hide") : t("debts.show")}</button>
      </div>

      {show && (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 12, maxWidth: 260 }}>
            <span style={label}>{t("debts.extraMonthlyPayment")}</span>
            <input style={input} placeholder="0" value={extraMonthlyInput}
              onChange={e => setExtraMonthlyInput(formatCopInput(e.target.value))} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: extraMonthly > 0 ? "1fr 1fr" : "1fr", gap: "0 24px", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>{t("debts.withoutExtra")}</div>
              <StatRow label={t("debts.installmentsRemaining")} value={baseSummary.months} />
              <StatRow label={t("debts.interestRemaining")} value={<Money amount={baseSummary.totalInterest} />} valueColor="#dc2626" />
              <StatRow label={t("debts.estimatedPayoff")} value={baseSummary.payoffDate ? fmtDate(baseSummary.payoffDate) : "—"} />
            </div>
            {extraMonthly > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 4 }}>{t("debts.withExtra")}</div>
                <StatRow label={t("debts.installmentsRemaining")} value={extraSummary.months} />
                <StatRow label={t("debts.interestRemaining")} value={<Money amount={extraSummary.totalInterest} />} valueColor="#dc2626" />
                <StatRow label={t("debts.estimatedPayoff")} value={extraSummary.payoffDate ? fmtDate(extraSummary.payoffDate) : "—"} />
              </div>
            )}
          </div>

          {extraMonthly > 0 && (
            <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
              <StatRow label={t("debts.interestSaved")} value={<Money amount={interestSaved} />} valueColor="#059669" />
              <StatRow label={t("debts.monthsSaved")} value={monthsSaved} valueColor="#059669" />
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {[t("debts.colNo"), t("debts.colDate"), t("debts.colPrincipal"), t("debts.colInterest"), extraMonthly > 0 ? t("debts.colExtra") : null, t("debts.colBalanceAfter")].filter(Boolean).map((h, i) => (
                    <th key={i} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {years.map(([year, rows]) => {
                  const expanded = expandedYears.has(year);
                  const yearPrincipal = rows.reduce((s, r) => s + r.principalPaid + r.extraPaid, 0);
                  const yearInterest = rows.reduce((s, r) => s + r.interestPaid, 0);
                  return (
                    <Fragment key={`py-${year}`}>
                      <tr style={{ borderTop: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer" }}
                        onClick={() => toggleYear(year)}>
                        <td colSpan={6} style={{ padding: "6px 10px", fontWeight: 700, color: "#374151", fontSize: 12 }}>
                          {expanded ? "▾" : "▸"} {year} · {rows.length} {t("debts.installmentWord")}{rows.length !== 1 ? "s" : ""} · #{rows[0].cuotaNumber}–#{rows[rows.length - 1].cuotaNumber} ·{" "}
                          <span style={{ color: "#059669", fontWeight: 500 }}>{t("debts.colPrincipal")} <Money amount={yearPrincipal} /></span>
                          {" · "}
                          <span style={{ color: "#dc2626", fontWeight: 500 }}>{t("debts.colInterest")} <Money amount={yearInterest} /></span>
                        </td>
                      </tr>
                      {expanded && rows.map(r => (
                        <tr key={r.date} style={{ borderTop: "1px solid #f3f4f6", color: "#9ca3af" }}>
                          <td style={{ padding: "6px 10px" }}>#{r.cuotaNumber}</td>
                          <td style={{ padding: "6px 10px" }}>{fmtDate(r.date)}</td>
                          <td style={{ padding: "6px 10px" }}>{<Money amount={r.principalPaid} />}</td>
                          <td style={{ padding: "6px 10px" }}>{<Money amount={r.interestPaid} />}</td>
                          {extraMonthly > 0 && <td style={{ padding: "6px 10px" }}>{r.extraPaid > 0 ? <Money amount={r.extraPaid} /> : "—"}</td>}
                          <td style={{ padding: "6px 10px" }}>{<Money amount={r.balanceAfter} />}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────

function NewMortgageForm({ onSave, onCancel, loading }: {
  onSave: (data: {
    name: string; entity: string; principal: number; interestRate: number;
    subsidizedRate?: number; subsidyRate?: number; subsidyEndDate?: string;
    isUvrIndexed: boolean; termMonths: number; startDate: string;
  }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("Mortgage");
  const [entity, setEntity] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [subsidizedRate, setSubsidizedRate] = useState("");
  const [subsidyRate, setSubsidyRate] = useState("");
  const [subsidyEndDate, setSubsidyEndDate] = useState("");
  const [isUvrIndexed, setIsUvrIndexed] = useState(false);
  const [termMonths, setTermMonths] = useState("180");
  const [startDate, setStartDate] = useState(todayInput());

  function handleSubmit() {
    const p = parse(principal);
    const rate = Number(interestRate);
    const term = Number(termMonths);
    if (!name || !entity || !p || !rate || !term || !startDate) return;
    onSave({
      name, entity, principal: p, interestRate: rate,
      subsidizedRate: subsidizedRate ? Number(subsidizedRate) : undefined,
      subsidyRate: subsidyRate ? Number(subsidyRate) : undefined,
      subsidyEndDate: subsidyEndDate || undefined,
      isUvrIndexed, termMonths: term, startDate,
    });
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <span style={label}>{t("debts.formName")}</span>
          <input style={input} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("debts.formEntity")}</span>
          <input style={input} placeholder="Bancolombia" value={entity} onChange={e => setEntity(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("debts.formPrincipalCOP")}</span>
          <input style={input} placeholder="200.000.000" value={principal}
            onChange={e => setPrincipal(formatCopInput(e.target.value))} />
        </div>
        <div>
          <span style={label}>{t("debts.formRateContracted")}</span>
          <input style={input} type="number" step="any" placeholder="14.52" value={interestRate} onChange={e => setInterestRate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("debts.formRateCharged")}</span>
          <input style={input} type="number" step="any" placeholder="12.00" value={subsidizedRate} onChange={e => setSubsidizedRate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("debts.formRateCoverage")}</span>
          <input style={input} type="number" step="any" placeholder="4.00" value={subsidyRate} onChange={e => setSubsidyRate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("debts.formBenefitExpires")}</span>
          <input style={input} type="date" value={subsidyEndDate} onChange={e => setSubsidyEndDate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("debts.formTermMonths")}</span>
          <input style={input} type="number" value={termMonths} onChange={e => setTermMonths(e.target.value)} />
        </div>
        <div>
          <span style={label}>{t("debts.formStartDate")}</span>
          <input style={input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: 13, color: "#374151", cursor: "pointer" }}>
        <input type="checkbox" checked={isUvrIndexed} onChange={e => setIsUvrIndexed(e.target.checked)} />
        {t("debts.formUvr")}
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSubmit} style={btn()} disabled={loading}>{loading ? t("debts.saving") : t("debts.save")}</button>
        <button onClick={onCancel} style={ghost}>{t("debts.cancel")}</button>
      </div>
    </div>
  );
}

function PaymentForm({ lastPayment, onSave, onCancel, loading }: {
  lastPayment?: MortgagePayment | null;
  onSave: (data: { date: string; principalPaid: number; interestPaid: number; interestCovered: number; insurancePaid: number; realBalance?: number; isExtra: boolean; notes?: string }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayInput());
  const [isExtra, setIsExtra] = useState(false);
  const [principalPaid, setPrincipalPaid] = useState(lastPayment ? formatCopInput(String(lastPayment.principalPaid)) : "");
  const [interestPaid, setInterestPaid] = useState(lastPayment ? formatCopInput(String(lastPayment.interestPaid)) : "0");
  const [interestCovered, setInterestCovered] = useState(lastPayment ? formatCopInput(String(lastPayment.interestCovered)) : "0");
  const [insurancePaid, setInsurancePaid] = useState(lastPayment ? formatCopInput(String(lastPayment.insurancePaid)) : "0");
  const [realBalance, setRealBalance] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit() {
    const p = parse(principalPaid);
    const i = isExtra ? 0 : parse(interestPaid);
    const c = isExtra ? 0 : parse(interestCovered);
    const ins = isExtra ? 0 : parse(insurancePaid);
    const rb = !isExtra && realBalance ? parse(realBalance) : undefined;
    if (!date || !p) return;
    onSave({ date, principalPaid: p, interestPaid: i, interestCovered: c, insurancePaid: ins, realBalance: rb, isExtra, notes });
  }

  return (
    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="radio" checked={!isExtra} onChange={() => setIsExtra(false)} />
          {t("debts.formRegularInstallment")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="radio" checked={isExtra} onChange={() => { setIsExtra(true); setPrincipalPaid(""); setInterestPaid("0"); setInterestCovered("0"); setInsurancePaid("0"); }} />
          {t("debts.formExtraPrincipalPayment")}
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px 16px", marginBottom: 12 }}>
        <div>
          <span style={label}>{t("debts.formDate")}</span>
          <input style={input} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <span style={label}>{isExtra ? t("debts.formAmountCOP") : t("debts.formPrincipalCOP")}</span>
          <input style={input} placeholder="500.000" value={principalPaid}
            onChange={e => setPrincipalPaid(formatCopInput(e.target.value))} />
        </div>
        {!isExtra && (
          <div>
            <span style={label}>{t("debts.formInterestPaidCOP")}</span>
            <input style={input} placeholder="478.932" value={interestPaid}
              onChange={e => setInterestPaid(formatCopInput(e.target.value))} />
          </div>
        )}
        {!isExtra && (
          <div>
            <span style={label}>{t("debts.formInterestCoveredCOP")}</span>
            <input style={input} placeholder="253.153" value={interestCovered}
              onChange={e => setInterestCovered(formatCopInput(e.target.value))} />
          </div>
        )}
        {!isExtra && (
          <div>
            <span style={label}>{t("debts.formInsuranceCOP")}</span>
            <input style={input} placeholder="57.466" value={insurancePaid}
              onChange={e => setInsurancePaid(formatCopInput(e.target.value))} />
          </div>
        )}
        {!isExtra && (
          <div>
            <span style={label}>{t("debts.formRealBalance")}</span>
            <input style={input} placeholder="56.463.073" value={realBalance}
              onChange={e => setRealBalance(formatCopInput(e.target.value))} />
          </div>
        )}
        <div>
          <span style={label}>{t("debts.formNotes")}</span>
          <input style={input} placeholder={t("debts.formOptional")} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSubmit} style={btn()} disabled={loading}>{loading ? t("debts.saving") : t("debts.save")}</button>
        <button onClick={onCancel} style={ghost}>{t("debts.cancel")}</button>
      </div>
    </div>
  );
}
