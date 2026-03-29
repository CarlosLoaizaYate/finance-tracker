#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# Finance Tracker — API + Data Layer Setup
# Run this from your project root: bash setup-api.sh
# ═══════════════════════════════════════════════════════════════════════

set -e
echo "📦 Installing dependencies..."
npm install @tanstack/react-query@5 zustand@5

echo "📁 Creating directories..."
mkdir -p src/app/api/categories
mkdir -p src/app/api/expense-items
mkdir -p src/app/api/expense-records
mkdir -p src/app/api/investments
mkdir -p src/app/api/investment-snapshots
mkdir -p src/app/api/seed
mkdir -p src/hooks
mkdir -p src/providers

# ═══════════════════════════════════════════════════════════════════════
# 1. Server-side Supabase client (reads auth cookies)
# ═══════════════════════════════════════════════════════════════════════
echo "🔐 Creating server auth helpers..."

cat > src/lib/supabase-server.ts << 'ENDFILE'
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Can fail in Server Components — safe to ignore
          }
        },
      },
    }
  );
}
ENDFILE

cat > src/lib/auth.ts << 'ENDFILE'
import { createServerSupabase } from "./supabase-server";
import { prisma } from "./prisma";

export async function getAuthUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Ensure user exists in our DB (auto-create on first login)
  let dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: {
        id: user.id,
        email: user.email!,
        name: user.user_metadata?.name ?? null,
      },
    });
  }
  return dbUser;
}
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# 2. API Routes
# ═══════════════════════════════════════════════════════════════════════
echo "🌐 Creating API routes..."

# ── Categories ─────────────────────────────────────────────────────────
cat > src/app/api/categories/route.ts << 'ENDFILE'
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    include: { items: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const category = await prisma.category.create({
    data: { name: body.name, color: body.color, userId: user.id },
  });
  return NextResponse.json(category);
}
ENDFILE

# ── Expense Items ──────────────────────────────────────────────────────
cat > src/app/api/expense-items/route.ts << 'ENDFILE'
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.expenseItem.findMany({
    where: { userId: user.id, active: true },
    include: { category: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const item = await prisma.expenseItem.create({
    data: {
      name: body.name,
      monthlyBudget: body.monthlyBudget,
      categoryId: body.categoryId,
      userId: user.id,
    },
    include: { category: true },
  });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const item = await prisma.expenseItem.update({
    where: { id: body.id },
    data: { name: body.name, monthlyBudget: body.monthlyBudget, active: body.active },
  });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Soft-delete: mark as inactive
  await prisma.expenseItem.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({ ok: true });
}
ENDFILE

# ── Expense Records ────────────────────────────────────────────────────
cat > src/app/api/expense-records/route.ts << 'ENDFILE'
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "2025");

  const records = await prisma.expenseRecord.findMany({
    where: { userId: user.id, year },
    orderBy: [{ month: "asc" }],
  });
  return NextResponse.json(records);
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const record = await prisma.expenseRecord.upsert({
    where: {
      itemId_month_year: {
        itemId: body.itemId,
        month: body.month,
        year: body.year,
      },
    },
    update: { realValue: body.realValue },
    create: {
      itemId: body.itemId,
      month: body.month,
      year: body.year,
      realValue: body.realValue,
      userId: user.id,
    },
  });
  return NextResponse.json(record);
}
ENDFILE

# ── Investments ────────────────────────────────────────────────────────
cat > src/app/api/investments/route.ts << 'ENDFILE'
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const investments = await prisma.investment.findMany({
    where: { userId: user.id, active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(investments);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const investment = await prisma.investment.create({
    data: {
      name: body.name,
      type: body.type,
      color: body.color,
      investedCapital: body.investedCapital,
      userId: user.id,
    },
  });
  return NextResponse.json(investment);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.investment.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({ ok: true });
}
ENDFILE

# ── Investment Snapshots ───────────────────────────────────────────────
cat > src/app/api/investment-snapshots/route.ts << 'ENDFILE'
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "2025");

  const snapshots = await prisma.investmentSnapshot.findMany({
    where: { userId: user.id, year },
    orderBy: [{ month: "asc" }],
  });
  return NextResponse.json(snapshots);
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const snapshot = await prisma.investmentSnapshot.upsert({
    where: {
      investmentId_month_year: {
        investmentId: body.investmentId,
        month: body.month,
        year: body.year,
      },
    },
    update: { currentValue: body.currentValue, contribution: body.contribution },
    create: {
      investmentId: body.investmentId,
      month: body.month,
      year: body.year,
      currentValue: body.currentValue,
      contribution: body.contribution,
      userId: user.id,
    },
  });
  return NextResponse.json(snapshot);
}
ENDFILE

# ── Seed (carga los datos iniciales) ──────────────────────────────────
cat > src/app/api/seed/route.ts << 'ENDFILE'
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const CATS_SEED = [
  { name: "streaming", color: "#ec4899" },
  { name: "telefonia", color: "#3b82f6" },
  { name: "vivienda",  color: "#6366f1" },
  { name: "credito",   color: "#ef4444" },
  { name: "salud",     color: "#10b981" },
  { name: "seguros",   color: "#f97316" },
  { name: "salidas",   color: "#f59e0b" },
];

const ITEMS_SEED = [
  { name: "Netflix",          cat: "streaming", budget: 40000 },
  { name: "Spotify",          cat: "streaming", budget: 30000 },
  { name: "Crunchyroll",      cat: "streaming", budget: 20000 },
  { name: "Claro 1",          cat: "telefonia", budget: 55000 },
  { name: "Movistar",         cat: "telefonia", budget: 150000 },
  { name: "Apartamento",      cat: "vivienda",  budget: 770000 },
  { name: "Administración",   cat: "vivienda",  budget: 200000 },
  { name: "TC Nu",            cat: "credito",   budget: 1000000 },
  { name: "Seguro Moto",      cat: "seguros",   budget: 100000 },
  { name: "Compensar",        cat: "salud",     budget: 600000 },
  { name: "Salidas / Comidas",cat: "salidas",   budget: 500000 },
];

const INV_SEED = [
  { name: "Nubank Bolsillos",           type: "Ahorro Digital",     color: "#7c3aed", invested: 1000000 },
  { name: "Trii – Acciones GEB",        type: "Renta Variable",     color: "#d97706", invested: 387810 },
  { name: "Accicuenta Mayor Riesgo",    type: "Fondo Mayor Riesgo", color: "#dc2626", invested: 600000 },
  { name: "Acciones Dinámico",          type: "Fondo Dinámico",     color: "#059669", invested: 600000 },
  { name: "Estructurado Potencial USA", type: "Moderado",           color: "#2563eb", invested: 1000000 },
];

const SNAP_SEED = [
  { inv: "Nubank Bolsillos",           month: 2, value: 1028257, contrib: 0 },
  { inv: "Trii – Acciones GEB",        month: 2, value: 387810,  contrib: 0 },
  { inv: "Accicuenta Mayor Riesgo",    month: 2, value: 644000,  contrib: 0 },
  { inv: "Acciones Dinámico",          month: 2, value: 585000,  contrib: 0 },
  { inv: "Estructurado Potencial USA", month: 2, value: 1000000, contrib: 0 },
];

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Create categories
  const catMap: Record<string, string> = {};
  for (const c of CATS_SEED) {
    const cat = await prisma.category.upsert({
      where: { name_userId: { name: c.name, userId: user.id } },
      update: { color: c.color },
      create: { name: c.name, color: c.color, userId: user.id },
    });
    catMap[c.name] = cat.id;
  }

  // Create expense items
  for (const item of ITEMS_SEED) {
    const existing = await prisma.expenseItem.findFirst({
      where: { name: item.name, userId: user.id },
    });
    if (!existing) {
      await prisma.expenseItem.create({
        data: {
          name: item.name,
          monthlyBudget: item.budget,
          categoryId: catMap[item.cat],
          userId: user.id,
        },
      });
    }
  }

  // Create investments
  const invMap: Record<string, string> = {};
  for (const inv of INV_SEED) {
    const existing = await prisma.investment.findFirst({
      where: { name: inv.name, userId: user.id },
    });
    if (existing) {
      invMap[inv.name] = existing.id;
    } else {
      const created = await prisma.investment.create({
        data: {
          name: inv.name,
          type: inv.type,
          color: inv.color,
          investedCapital: inv.invested,
          userId: user.id,
        },
      });
      invMap[inv.name] = created.id;
    }
  }

  // Create initial snapshots (March = month 2)
  for (const snap of SNAP_SEED) {
    const investmentId = invMap[snap.inv];
    if (investmentId) {
      await prisma.investmentSnapshot.upsert({
        where: {
          investmentId_month_year: {
            investmentId,
            month: snap.month,
            year: 2025,
          },
        },
        update: { currentValue: snap.value, contribution: snap.contrib },
        create: {
          investmentId,
          month: snap.month,
          year: 2025,
          currentValue: snap.value,
          contribution: snap.contrib,
          userId: user.id,
        },
      });
    }
  }

  return NextResponse.json({ ok: true, message: "Seed complete" });
}
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# 3. TanStack Query Provider
# ═══════════════════════════════════════════════════════════════════════
echo "⚛️  Creating React providers and hooks..."

cat > src/providers/query-provider.tsx << 'ENDFILE'
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# 4. Custom hooks for data fetching
# ═══════════════════════════════════════════════════════════════════════

cat > src/hooks/use-finance-data.ts << 'ENDFILE'
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Fetcher helpers ───────────────────────────────────────────────────
async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
  return res.json();
}

async function put<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
  return res.json();
}

async function del(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${url} failed: ${res.status}`);
}

// ── Types ─────────────────────────────────────────────────────────────
export interface Category {
  id: string;
  name: string;
  color: string;
  items?: ExpenseItem[];
}

export interface ExpenseItem {
  id: string;
  name: string;
  monthlyBudget: number;
  active: boolean;
  categoryId: string;
  category?: Category;
}

export interface ExpenseRecord {
  id: string;
  month: number;
  year: number;
  realValue: number;
  itemId: string;
}

export interface Investment {
  id: string;
  name: string;
  type: string;
  color: string;
  investedCapital: number;
  active: boolean;
}

export interface InvestmentSnapshot {
  id: string;
  month: number;
  year: number;
  currentValue: number;
  contribution: number;
  investmentId: string;
}

// ── Query Hooks ───────────────────────────────────────────────────────

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => get("/api/categories"),
  });
}

export function useExpenseItems() {
  return useQuery<ExpenseItem[]>({
    queryKey: ["expense-items"],
    queryFn: () => get("/api/expense-items"),
  });
}

export function useExpenseRecords(year: number) {
  return useQuery<ExpenseRecord[]>({
    queryKey: ["expense-records", year],
    queryFn: () => get(`/api/expense-records?year=${year}`),
  });
}

export function useInvestments() {
  return useQuery<Investment[]>({
    queryKey: ["investments"],
    queryFn: () => get("/api/investments"),
  });
}

export function useInvestmentSnapshots(year: number) {
  return useQuery<InvestmentSnapshot[]>({
    queryKey: ["investment-snapshots", year],
    queryFn: () => get(`/api/investment-snapshots?year=${year}`),
  });
}

// ── Mutation Hooks ────────────────────────────────────────────────────

export function useAddExpenseItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; monthlyBudget: number; categoryId: string }) =>
      post("/api/expense-items", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-items"] }),
  });
}

export function useRemoveExpenseItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/expense-items?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-items"] }),
  });
}

export function useUpsertExpenseRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { itemId: string; month: number; year: number; realValue: number }) =>
      put("/api/expense-records", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-records"] }),
  });
}

export function useAddInvestment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type: string; color: string; investedCapital: number }) =>
      post("/api/investments", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investments"] }),
  });
}

export function useRemoveInvestment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/investments?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investments"] }),
  });
}

export function useUpsertSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      investmentId: string;
      month: number;
      year: number;
      currentValue: number;
      contribution: number;
    }) => put("/api/investment-snapshots", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investment-snapshots"] }),
  });
}

export function useSeedData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post("/api/seed", {}),
    onSuccess: () => qc.invalidateQueries(),
  });
}
ENDFILE

# ═══════════════════════════════════════════════════════════════════════
# 5. Update layout.tsx to include QueryProvider
# ═══════════════════════════════════════════════════════════════════════
echo "📄 Updating layout.tsx..."

# Read current layout to preserve metadata, then rewrite
cat > src/app/layout.tsx << 'ENDFILE'
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import QueryProvider from "@/providers/query-provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Finance Tracker",
  description: "Personal finance dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
ENDFILE

echo ""
echo "✅ Setup complete! Files created:"
echo ""
echo "  src/lib/supabase-server.ts      — Server-side Supabase client"
echo "  src/lib/auth.ts                 — Auth helper (gets user from cookie)"
echo "  src/app/api/categories/route.ts  — Categories API"
echo "  src/app/api/expense-items/route.ts — Expense items API"
echo "  src/app/api/expense-records/route.ts — Expense records API"
echo "  src/app/api/investments/route.ts — Investments API"
echo "  src/app/api/investment-snapshots/route.ts — Snapshots API"
echo "  src/app/api/seed/route.ts        — Seed initial data"
echo "  src/providers/query-provider.tsx  — TanStack Query provider"
echo "  src/hooks/use-finance-data.ts    — All data hooks"
echo "  src/app/layout.tsx               — Updated with QueryProvider"
echo ""
echo "👉 Next steps:"
echo "   1. Update finance-panel.tsx to use the hooks"
echo "   2. Run: npm run dev"
echo "   3. Login, then visit /api/seed (POST) to load initial data"
echo ""