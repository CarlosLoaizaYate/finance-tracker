/** Format a number as COP currency string. Shows decimals only when present. */
export const fmt = (n: number): string =>
  "$" + n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Parses a "." (thousands) / "," (decimal) formatted string into a number. */
export const parse = (s: string): number => {
  const hasComma = String(s).includes(",");
  const cleaned = String(s).replace(/[^\d.,]/g, "");
  const normalized = hasComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/\./g, "");
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
};

/** Formats a COP amount input live while typing: "." as thousands separator, "," as decimal separator. */
export const formatCopInput = (raw: string): string => {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const commaIdx = cleaned.indexOf(",");
  if (commaIdx === -1) {
    return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  const intPart = cleaned.slice(0, commaIdx).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decPart = cleaned.slice(commaIdx + 1).replace(/,/g, "").slice(0, 2);
  return `${intPart},${decPart}`;
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
