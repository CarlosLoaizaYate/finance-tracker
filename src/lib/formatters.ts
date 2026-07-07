/** Format a number as COP currency string */
export const fmt = (n: number): string =>
  "$" + Math.round(n).toLocaleString("es-CO");

/** Parse a string into a number, stripping non-digit characters */
export const parse = (s: string): number => {
  const n = parseInt(String(s).replace(/\D/g, ""), 10);
  return isNaN(n) ? 0 : n;
};

/** Calculate gain/loss percentage */
export const gainPc = (value: number, invested: number): number =>
  invested === 0 ? 0 : ((value - invested) / invested) * 100;

/** Format a number as USD currency string */
export const fmtUsd = (n: number): string =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format a BTC quantity with enough precision to show small fractions */
export const fmtBtc = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }) + " BTC";

export type MoneyCurrency = "COP" | "USDW" | "USD" | "BTC";

/** Formats an amount with its currency code shown next to the value (e.g. "$500.000 COP"). */
export const fmtMoney = (amount: number, currency: MoneyCurrency): string => {
  if (currency === "BTC") return fmtBtc(amount);
  if (currency === "COP") return `${fmt(amount)} COP`;
  return `${fmtUsd(amount)} ${currency}`;
};
