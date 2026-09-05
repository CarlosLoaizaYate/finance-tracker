"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useDashboardStore } from "@/stores/dashboard-store";
import {
  useExpenseItems,
  useSeedData,
} from "@/hooks/use-finance-data";
import TabButton from "@/components/ui/tab-button";
import SummaryTab from "@/features/summary/components/summary-tab";
import ExpensesTab from "@/features/expenses/components/expenses-tab";
import InvestmentsTab from "@/features/investments/components/investments-tab";
import DebtsTab from "@/features/debts/components/debts-tab";
import SettingsTab from "@/features/settings/components/settings-tab";
import { useTranslation } from "@/hooks/use-translation";
import type { Language } from "@/stores/language-store";

export default function DashboardPage() {
  const { t } = useTranslation();
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
        <p style={{ color: "#6b7280" }}>{t("common.loading")}</p>
      </div>
    );
  }

  return <DashboardContent />;
}

function LanguageToggle() {
  const { language, setLanguage } = useTranslation();
  function option(value: Language, text: string) {
    const active = language === value;
    return (
      <button
        onClick={() => setLanguage(value)}
        style={{
          padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
          border: active ? "1px solid #7c3aed" : "1px solid #d1d5db",
          background: active ? "#ede9fe" : "transparent",
          color: active ? "#7c3aed" : "#6b7280",
        }}
      >{text}</button>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {option("en", "EN")}
      {option("es", "ES")}
    </div>
  );
}

function DashboardContent() {
  const { t } = useTranslation();
  const { tab, setTab, year } = useDashboardStore();
  const { data: items = [], isLoading: itemsLoading } = useExpenseItems();
  const seedMut = useSeedData();

  if (itemsLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#f3f4f6" }}>
        <p style={{ color: "#6b7280" }}>{t("common.loadingData")}</p>
      </div>
    );
  }

  // Seed prompt (no data)
  if (items.length === 0) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#f3f4f6", flexDirection: "column", gap: 16 }}>
        <h2 style={{ color: "#111827", fontWeight: 700 }}>{t("common.welcomeTitle")}</h2>
        <p style={{ color: "#6b7280", maxWidth: 400, textAlign: "center" }}>
          {t("common.welcomeBody")}
        </p>
        <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
          style={{ padding: "12px 28px", borderRadius: 10, border: "none", cursor: "pointer",
            background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 15 }}>
          {seedMut.isPending ? t("common.loadingEllipsis") : t("common.loadInitialData")}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111827" }}>
                {t("common.appName")}
              </h1>
              {process.env.NEXT_PUBLIC_APP_ENV === "development" ? (
                <span style={{
                  padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d",
                }}>DEV</span>
              ) : (
                <span style={{
                  padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: "#d1fae5", color: "#065f46", border: "1px solid #6ee7b7",
                }}>PROD</span>
              )}
            </div>
            <LanguageToggle />
          </div>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
            {year} · COP ·
            <span style={{ color: "#6366f1", fontWeight: 600 }}> {t("common.clickPurpleCell")}</span>
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>
            {t("common.tabSummary")}
          </TabButton>
          <TabButton active={tab === "expenses"} onClick={() => setTab("expenses")}>
            {t("common.tabExpenses")}
          </TabButton>
          <TabButton active={tab === "investments"} onClick={() => setTab("investments")}>
            {t("common.tabInvestments")}
          </TabButton>
          <TabButton active={tab === "debts"} onClick={() => setTab("debts")}>
            {t("common.tabDebts")}
          </TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
            {t("common.tabSettings")}
          </TabButton>
        </div>

        {/* Tab content */}
        {tab === "summary" && <SummaryTab />}
        {tab === "expenses" && <ExpensesTab />}
        {tab === "investments" && <InvestmentsTab />}
        {tab === "debts" && <DebtsTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
