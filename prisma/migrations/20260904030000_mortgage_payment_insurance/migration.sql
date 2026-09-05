-- Track insurance premiums (life/property) paid alongside each mortgage
-- payment, so the app's totals reconcile with the amount actually
-- transferred to the bank each period.
ALTER TABLE "MortgagePayment" ADD COLUMN "insurancePaid" INTEGER NOT NULL DEFAULT 0;
