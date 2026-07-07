import { fmtMoney, type MoneyCurrency } from "@/lib/formatters";

interface MoneyProps {
  amount: number;
  currency?: MoneyCurrency;
}

/** Renders a monetary amount with its currency code next to it (e.g. "$500.000 COP"). */
export default function Money({ amount, currency = "COP" }: MoneyProps) {
  return <>{fmtMoney(amount, currency)}</>;
}
