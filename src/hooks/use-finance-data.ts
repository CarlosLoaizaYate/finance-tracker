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
  isImportant: boolean;
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

export interface Stock {
  id: string;
  name: string;
  typeId: string;
  type: InvestmentType;
  color: string;
  createdAt: string;
  investedCapital: number;
  sellCommission: number;
  active: boolean;
}

export interface StockTransaction {
  id: string;
  investmentId: string;
  quantity: number;
  priceUnit: number;
  commission: number;
  transactionDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export interface StockPriceSnapshot {
  id: string;
  investmentId: string;
  month: number;
  year: number;
  pricePerShare: number;
  createdAt: string;
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
  toMonth: number, toYear: number,
) {
  return useQuery<ExpenseRecord[]>({
    queryKey: ["expense-records-range", fromMonth, fromYear, toMonth, toYear],
    queryFn: () =>
      get(`/api/expense-records?fromYear=${fromYear}&fromMonth=${fromMonth}&toYear=${toYear}&toMonth=${toMonth}`),
  });
}

export function useStocks() {
  return useQuery<Stock[]>({
    queryKey: ["stocks"],
    queryFn: () => get("/api/stocks"),
  });
}

export function useInvestmentTypes() {
  return useQuery<InvestmentType[]>({
    queryKey: ["investment-types"],
    queryFn: () => get("/api/investment-types"),
  });
}


// ── Mutation Hooks ────────────────────────────────────────────────────

export function useAddExpenseItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; monthlyBudget: number; categoryId: string; isImportant?: boolean; defaultDay?: number }) =>
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
    mutationFn: (data: { id: string; name?: string; categoryId?: string; monthlyBudget?: number; isImportant?: boolean; defaultDay?: number }) =>
      put("/api/expense-items", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-items"] }),
  });
}

export function useUpsertExpenseRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data:
      | { id: string; day?: number; realValue?: number; comment?: string; itemId?: string }
      | { itemId: string; day: number; month: number; year: number; realValue: number; comment?: string }
    ) => put("/api/expense-records", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-records"] });
      qc.invalidateQueries({ queryKey: ["expense-records-range"] });
    },
  });
}

export function useAddStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; typeId: string; color: string; investedCapital?: number }) =>
      post("/api/stocks", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stocks"] }),
  });
}

export function useRemoveStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/stocks?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stocks"] }),
  });
}

export function useUpdateStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; sellCommission?: number }) =>
      put("/api/stocks", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stocks"] }),
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

export function useToggleImportant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isImportant }: { id: string; isImportant: boolean }) =>
      put("/api/expense-items", { id, isImportant }),
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

// ── Stock Transactions Hooks ──────────────────────────────────────────

export function useStockTransactions(investmentId?: string) {
  return useQuery<StockTransaction[]>({
    queryKey: ["stock-transactions", investmentId],
    queryFn: () => {
      const url = investmentId
        ? `/api/stock-transactions?investmentId=${investmentId}`
        : "/api/stock-transactions";
      return get(url);
    },
  });
}

export function useAddStockTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      investmentId: string;
      quantity: number;
      priceUnit: number;
      commission: number;
      transactionDate: string;
      notes?: string;
    }) => post("/api/stock-transactions", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transactions"] });
      qc.invalidateQueries({ queryKey: ["investment-metrics"] });
    },
  });
}

export function useDeleteStockTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/stock-transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transactions"] });
      qc.invalidateQueries({ queryKey: ["investment-metrics"] });
    },
  });
}

export function useStockPriceSnapshots(investmentId?: string) {
  return useQuery<StockPriceSnapshot[]>({
    queryKey: ["stock-price-snapshots", investmentId ?? "all"],
    queryFn: () => {
      const url = investmentId
        ? `/api/stock-price-snapshots?investmentId=${investmentId}`
        : "/api/stock-price-snapshots";
      return get(url);
    },
  });
}

export function useUpsertStockPriceSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { investmentId: string; month: number; year: number; pricePerShare: number }) =>
      post("/api/stock-price-snapshots", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock-price-snapshots"] }),
  });
}

export function useDeleteStockPriceSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/stock-price-snapshots?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock-price-snapshots"] }),
  });
}

// ── Funds Hooks ───────────────────────────────────────────────────────

export interface FundSnapshot {
  id: string;
  fundId: string;
  day: number;
  month: number;
  year: number;
  currentValue: number;
  contribution: number;
  createdAt: string;
}

export interface Fund {
  id: string;
  name: string;
  color: string;
  baseCapital: number;
  startDate: string;
  typeId: string | null;
  type: InvestmentType | null;
  createdAt: string;
  snapshots: FundSnapshot[];
}

export function useFunds() {
  return useQuery<Fund[]>({
    queryKey: ["funds"],
    queryFn: () => get("/api/funds"),
  });
}

export function useAddFund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color: string; baseCapital: number; typeId?: string; startDate?: string }) =>
      post("/api/funds", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funds"] }),
  });
}

export function useDeleteFund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/funds?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funds"] }),
  });
}

export function useUpsertFundSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { fundId: string; day: number; month: number; year: number; currentValue: number; contribution: number }) =>
      post("/api/fund-snapshots", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funds"] }),
  });
}

export function useDeleteFundSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/fund-snapshots?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funds"] }),
  });
}

// ── Fixed Deposits (CDTs) Hooks ───────────────────────────────────────

export interface FixedDepositSnapshot {
  id: string;
  depositId: string;
  day: number;
  month: number;
  year: number;
  gain: number;
  createdAt: string;
}

export interface FixedDeposit {
  id: string;
  groupId: string;
  capital: number;
  capitalAdded: number;
  interestRate: number;
  term: number;
  termUnit: "DAYS" | "MONTHS";
  startDate: string;
  endDate: string;
  earnedInterest: number | null;
  notes: string;
  createdAt: string;
  snapshots: FixedDepositSnapshot[];
}

export interface FixedDepositGroup {
  id: string;
  name: string;
  entity: string;
  createdAt: string;
  cycles: FixedDeposit[];
}

export function useFixedDepositGroups() {
  return useQuery<FixedDepositGroup[]>({
    queryKey: ["fixed-deposit-groups"],
    queryFn: () => get("/api/fixed-deposit-groups"),
  });
}

export function useAddFixedDepositGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      entity: string;
      capital: number;
      interestRate: number;
      term: number;
      termUnit: "DAYS" | "MONTHS";
      startDate: string;
      endDate: string;
    }) => post("/api/fixed-deposit-groups", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fixed-deposit-groups"] }),
  });
}

export function useDeleteFixedDepositGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/fixed-deposit-groups?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fixed-deposit-groups"] }),
  });
}

export function useAddFixedDepositCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      groupId: string;
      capital: number;
      capitalAdded: number;
      interestRate: number;
      term: number;
      termUnit: "DAYS" | "MONTHS";
      startDate: string;
      endDate: string;
      notes?: string;
    }) => post("/api/fixed-deposits", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fixed-deposit-groups"] }),
  });
}

export function useCloseCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; earnedInterest: number | null }) =>
      put("/api/fixed-deposits", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fixed-deposit-groups"] }),
  });
}

export function useUpdateCycleEndDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; endDate: string }) =>
      put("/api/fixed-deposits", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fixed-deposit-groups"] }),
  });
}

export function useDeleteFixedDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/fixed-deposits?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fixed-deposit-groups"] }),
  });
}

export function useFixedDepositSnapshots(depositId: string) {
  return useQuery<FixedDepositSnapshot[]>({
    queryKey: ["fixed-deposit-snapshots", depositId],
    queryFn: () => get(`/api/fixed-deposit-snapshots?depositId=${depositId}`),
    enabled: !!depositId,
  });
}

export function useUpsertFixedDepositSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { depositId: string; day: number; month: number; year: number; gain: number }) =>
      put("/api/fixed-deposit-snapshots", data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["fixed-deposit-snapshots", vars.depositId] });
      qc.invalidateQueries({ queryKey: ["fixed-deposit-groups"] });
    },
  });
}

export function useDeleteFixedDepositSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ depositId, day, month, year }: { depositId: string; day: number; month: number; year: number }) =>
      del(`/api/fixed-deposit-snapshots?depositId=${depositId}&day=${day}&month=${month}&year=${year}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["fixed-deposit-snapshots", vars.depositId] });
      qc.invalidateQueries({ queryKey: ["fixed-deposit-groups"] });
    },
  });
}

// ── Crypto (COP -> USDW -> BTC) ─────────────────────────────────────────

export interface UsdwPurchase {
  id: string;
  date: string;
  copAmount: number;
  commissionCop: number;
  usdwAmount: number;
  notes: string;
  createdAt: string;
}

export interface BtcPurchase {
  id: string;
  date: string;
  usdwAmount: number;
  commissionUsdw: number;
  btcPriceUsdw: number;
  btcAmount: number;
  notes: string;
  createdAt: string;
}

export interface CryptoSnapshot {
  id: string;
  day: number;
  month: number;
  year: number;
  usdCopRate: number;
  btcPriceUsd: number;
  usdwBalance: number | null;
  createdAt: string;
}

export function useUsdwPurchases() {
  return useQuery<UsdwPurchase[]>({
    queryKey: ["usdw-purchases"],
    queryFn: () => get("/api/usdw-purchases"),
  });
}

export function useAddUsdwPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { date: string; copAmount: number; commissionCop: number; usdwAmount: number; notes?: string }) =>
      post("/api/usdw-purchases", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usdw-purchases"] }),
  });
}

export function useDeleteUsdwPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/usdw-purchases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usdw-purchases"] }),
  });
}

export function useBtcPurchases() {
  return useQuery<BtcPurchase[]>({
    queryKey: ["btc-purchases"],
    queryFn: () => get("/api/btc-purchases"),
  });
}

export function useAddBtcPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      date: string;
      usdwAmount: number;
      commissionUsdw: number;
      btcPriceUsdw: number;
      btcAmount: number;
      notes?: string;
    }) => post("/api/btc-purchases", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["btc-purchases"] }),
  });
}

export function useDeleteBtcPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/api/btc-purchases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["btc-purchases"] }),
  });
}

export function useCryptoSnapshots() {
  return useQuery<CryptoSnapshot[]>({
    queryKey: ["crypto-snapshots"],
    queryFn: () => get("/api/crypto-snapshots"),
  });
}

export function useUpsertCryptoSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { day: number; month: number; year: number; usdCopRate: number; btcPriceUsd: number; usdwBalance?: number | null }) =>
      put("/api/crypto-snapshots", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crypto-snapshots"] }),
  });
}

export function useDeleteCryptoSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ day, month, year }: { day: number; month: number; year: number }) =>
      del(`/api/crypto-snapshots?day=${day}&month=${month}&year=${year}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crypto-snapshots"] }),
  });
}

export function useCryptoSettings() {
  return useQuery<{ sellCommission: number; commissionRate: number }>({
    queryKey: ["crypto-settings"],
    queryFn: () => get("/api/crypto-settings"),
  });
}

export function useUpdateCryptoSellCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sellCommission: number) => put("/api/crypto-settings", { sellCommission }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crypto-settings"] }),
  });
}

export function useUpdateCryptoCommissionRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commissionRate: number) => put("/api/crypto-settings", { commissionRate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crypto-settings"] }),
  });
}


