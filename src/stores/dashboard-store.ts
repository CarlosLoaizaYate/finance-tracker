import { create } from "zustand";

export type TabName = "summary" | "expenses" | "investments" | "settings";

interface DashboardState {
  // Current tab
  tab: TabName;
  setTab: (tab: TabName) => void;

  // Year
  year: number;
  setYear: (year: number) => void;

  // Month range (for summary & expenses)
  monthFrom: number;
  monthTo: number;
  setMonthFrom: (m: number) => void;
  setMonthTo: (m: number) => void;

  // Active month in investments tab
  investmentMonth: number;
  setInvestmentMonth: (m: number) => void;

  // Active month/year in expenses tab
  expenseMonth: number;
  expenseYear: number;
  setExpenseMonth: (m: number) => void;
  setExpenseYear:  (y: number) => void;
}

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth();

export const useDashboardStore = create<DashboardState>((set) => ({
  tab: "summary",
  setTab: (tab) => set({ tab }),

  year: currentYear,
  setYear: (year) => set({ year }),

  monthFrom: 0, // Jan
  monthTo: 11,   // Dec
  setMonthFrom: (monthFrom) => set({ monthFrom }),
  setMonthTo: (monthTo) => set({ monthTo }),

  investmentMonth: currentMonth,
  setInvestmentMonth: (investmentMonth) => set({ investmentMonth }),

  expenseMonth: currentMonth,
  expenseYear:  currentYear,
  setExpenseMonth: (expenseMonth) => set({ expenseMonth }),
  setExpenseYear:  (expenseYear)  => set({ expenseYear }),
}));
