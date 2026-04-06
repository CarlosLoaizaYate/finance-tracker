"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useDashboardStore } from "@/stores/dashboard-store";
import {
  useExpenseItems,
  useInvestments,
  useSeedData,
} from "@/hooks/use-finance-data";
import TabButton from "@/components/ui/tab-button";
import SummaryTab from "@/features/summary/components/summary-tab";
import ExpensesTab from "@/features/expenses/components/expenses-tab";
import InvestmentsTab from "@/features/investments/components/investments-tab";
import SettingsTab from "@/features/settings/components/settings-tab";

export default function DashboardPage() {
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
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  return <DashboardContent />;
}

function DashboardContent() {
  const { tab, setTab, year } = useDashboardStore();
  const { data: items = [], isLoading: itemsLoading } = useExpenseItems();
  const { data: investments = [], isLoading: invLoading } = useInvestments();
  const seedMut = useSeedData();

  const isLoading = itemsLoading || invLoading;

  // Loading state
  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#f3f4f6" }}>
        <p style={{ color: "#6b7280" }}>Loading your financial data...</p>
      </div>
    );
  }

  // Seed prompt (no data)
  if (items.length === 0 && investments.length === 0) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#f3f4f6", flexDirection: "column", gap: 16 }}>
        <h2 style={{ color: "#111827", fontWeight: 700 }}>Welcome to Finance Tracker</h2>
        <p style={{ color: "#6b7280", maxWidth: 400, textAlign: "center" }}>
          No data found. Click below to load your initial categories, expenses, and investments.
        </p>
        <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
          style={{ padding: "12px 28px", borderRadius: 10, border: "none", cursor: "pointer",
            background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 15 }}>
          {seedMut.isPending ? "Loading..." : "Load Initial Data"}
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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#111827" }}>
            Finance Tracker
          </h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
            {year} · COP ·
            <span style={{ color: "#6366f1", fontWeight: 600 }}> Click a purple cell to edit</span>
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>
            Summary
          </TabButton>
          <TabButton active={tab === "expenses"} onClick={() => setTab("expenses")}>
            Expenses
          </TabButton>
          <TabButton active={tab === "investments"} onClick={() => setTab("investments")}>
            Investments
          </TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
            Configuración
          </TabButton>
        </div>

        {/* Tab content */}
        {tab === "summary" && <SummaryTab />}
        {tab === "expenses" && <ExpensesTab />}
        {tab === "investments" && <InvestmentsTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
