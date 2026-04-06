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

export interface BudgetHistoryEntry {
  id: string;
  amount: number;
  effectiveMonth: number;
  effectiveYear: number;
  itemId: string;
}

export interface ExpenseItem {
  id: string;
  name: string;
  monthlyBudget: number;
  defaultDay: number;
  active: boolean;
  recurring: boolean;
  categoryId: string;
  category?: Category;
  budgetHistory?: BudgetHistoryEntry[];
}

export interface IncomeHistoryEntry {
  id: string;
  amount: number;
  effectiveMonth: number;
  effectiveYear: number;
  sourceId: string;
}

export interface IncomeSource {
  id: string;
  name: string;
  history: IncomeHistoryEntry[];
}

/** Returns the effective amount for a source at the given month/year */
export function effectiveIncomeAmount(source: IncomeSource, month: number, year: number): number {
  const applicable = source.history
    .filter((h) => h.effectiveYear < year || (h.effectiveYear === year && h.effectiveMonth <= month))
    .sort((a, b) => b.effectiveYear - a.effectiveYear || b.effectiveMonth - a.effectiveMonth);
  return applicable[0]?.amount ?? 0;
}

/** Returns the effective budget for an item at the given month/year */
export function effectiveBudget(item: ExpenseItem, month: number, year: number): number {
  const applicable = (item.budgetHistory ?? [])
    .filter((h) => h.effectiveYear < year || (h.effectiveYear === year && h.effectiveMonth <= month))
    .sort((a, b) => b.effectiveYear - a.effectiveYear || b.effectiveMonth - a.effectiveMonth);
  return applicable[0]?.amount ?? item.monthlyBudget;
}

export interface ExpenseRecord {
  id: string;
  day: number;
  month: number;
  year: number;
  realValue: number;
  comment: string;
  itemId: string;
}

export interface InvestmentType {
  id: string;
  name: string;
}

export interface Investment {
  id: string;
  name: string;
  typeId: string;
  type: InvestmentType;
  color: string;
  createdAt: string;
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
    queryFn: () => get("/api/expense-items?includeBudgetHistory=1"),
  });
}

export function useExpenseRecords(year: number) {
  return useQuery<ExpenseRecord[]>({
    queryKey: ["expense-records", year],
    queryFn: () => get(`/api/expense-records?year=${year}`),
  });
}

export function useExpenseRecordsRange(
  fromMonth: number, fromYear: number,
  toMonth: number,   toYear: number,
) {
  return useQuery<ExpenseRecord[]>({
    queryKey: ["expense-records-range", fromMonth, fromYear, toMonth, toYear],
    queryFn: () =>
      get(`/api/expense-records?fromYear=${fromYear}&fromMonth=${fromMonth}&toYear=${toYear}&toMonth=${toMonth}`),
  });
}

export function useInvestments() {
  return useQuery<Investment[]>({
    queryKey: ["investments"],
    queryFn: () => get("/api/investments"),
  });
}

export function useInvestmentTypes() {
  return useQuery<InvestmentType[]>({
    queryKey: ["investment-types"],
    queryFn: () => get("/api/investment-types"),
  });
}

export function useInvestmentSnapshots(year: number | "all") {
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

export function useUpdateExpenseItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; name?: string; categoryId?: string; monthlyBudget?: number }) =>
      put("/api/expense-items", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-items"] }),
  });
}

export function useUpsertExpenseRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data:
      | { id: string; day?: number; realValue?: number; comment?: string }
      | { itemId: string; day: number; month: number; year: number; realValue: number; comment?: string }
    ) => put("/api/expense-records", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-records"] });
      qc.invalidateQueries({ queryKey: ["expense-records-range"] });
    },
  });
}

export function useAddInvestment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; typeId: string; color: string; investedCapital: number; month: number; year: number }) =>
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

export function useAddInvestmentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => post("/api/investment-types", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investment-types"] }),
  });
}

export function useDeleteInvestmentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/investment-types?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investment-types"] }),
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

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/categories?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; name?: string; color?: string }) =>
      put("/api/categories", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useAddCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color: string }) => post("/api/categories", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useIncomeSources() {
  return useQuery<IncomeSource[]>({
    queryKey: ["income-sources"],
    queryFn: () => get("/api/income-sources"),
  });
}

export function useAddIncomeSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; amount: number; effectiveMonth: number; effectiveYear: number }) =>
      post("/api/income-sources", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["income-sources"] }),
  });
}

export function useDeleteIncomeSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/income-sources?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["income-sources"] }),
  });
}

export function useAddIncomeHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sourceId: string; amount: number; effectiveMonth: number; effectiveYear: number }) =>
      post("/api/income-history", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["income-sources"] }),
  });
}

export function useDeleteExpenseRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/expense-records?id=${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-records"] });
      qc.invalidateQueries({ queryKey: ["expense-records-range"] });
    },
  });
}

export function useInitExpenseMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ month, year }: { month: number; year: number }) =>
      post("/api/expense-records", { month, year }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-records"] });
      qc.invalidateQueries({ queryKey: ["expense-records-range"] });
    },
  });
}

export function useToggleRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, recurring }: { id: string; recurring: boolean }) =>
      put("/api/expense-items", { id, recurring }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-items"] }),
  });
}

export function useUpdateItemDefaultDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, defaultDay }: { id: string; defaultDay: number }) =>
      put("/api/expense-items", { id, defaultDay }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-items"] }),
  });
}

export function useAddBudgetHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { itemId: string; amount: number; effectiveMonth: number; effectiveYear: number }) =>
      post("/api/budget-history", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-items"] }),
  });
}

