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
