export const MONTHS = [
  "Ene","Feb","Mar","Abr","May","Jun",
  "Jul","Ago","Sep","Oct","Nov","Dic",
];

export const INCOME = {
  salarioBase: 5500000,
  deducciones: 500000,
  salario: 5000000,
  arriendo: 1000000,
};

export const INCOME_TOTAL = INCOME.salario + INCOME.arriendo;

export const CAT_LABELS: Record<string, { label: string; color: string }> = {
  streaming: { label: "Streaming",    color: "#ec4899" },
  telefonia: { label: "Telefonía",    color: "#3b82f6" },
  vivienda:  { label: "Vivienda",     color: "#6366f1" },
  credito:   { label: "Crédito / TC", color: "#ef4444" },
  salud:     { label: "Salud",        color: "#10b981" },
  seguros:   { label: "Seguros",      color: "#f97316" },
  salidas:   { label: "Salidas",      color: "#f59e0b" },
};

export const DEFAULT_YEAR = 2025;
