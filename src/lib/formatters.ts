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
