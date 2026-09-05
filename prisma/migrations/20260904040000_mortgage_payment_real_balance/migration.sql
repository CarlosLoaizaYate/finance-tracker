-- Track the bank's own reported "Saldo a la Fecha de Corte" per payment
-- period, so the app can show the authoritative real balance (not just the
-- derived one) whenever it's known from a real statement.
ALTER TABLE "MortgagePayment" ADD COLUMN "realBalance" INTEGER;
