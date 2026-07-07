-- AlterTable: track exact day so same-month start/end measurements don't collide
ALTER TABLE "FixedDepositSnapshot" ADD COLUMN "day" INTEGER NOT NULL DEFAULT 1;

-- Backfill: attribute existing rows to the deposit's start day when it falls in that month/year
UPDATE "FixedDepositSnapshot" s
SET "day" = EXTRACT(DAY FROM d."startDate")::int
FROM "FixedDeposit" d
WHERE d.id = s."depositId"
  AND EXTRACT(YEAR FROM d."startDate")::int = s."year"
  AND EXTRACT(MONTH FROM d."startDate")::int = s."month";

-- Backfill: end date takes priority (matches the app's previous "last point in month wins" display behavior)
UPDATE "FixedDepositSnapshot" s
SET "day" = EXTRACT(DAY FROM d."endDate")::int
FROM "FixedDeposit" d
WHERE d.id = s."depositId"
  AND EXTRACT(YEAR FROM d."endDate")::int = s."year"
  AND EXTRACT(MONTH FROM d."endDate")::int = s."month";

-- DropIndex
DROP INDEX "FixedDepositSnapshot_depositId_month_year_key";

-- CreateIndex
CREATE UNIQUE INDEX "FixedDepositSnapshot_depositId_day_month_year_key" ON "FixedDepositSnapshot"("depositId", "day", "month", "year");
