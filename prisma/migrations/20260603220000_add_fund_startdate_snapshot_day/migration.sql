-- Add startDate to Fund
ALTER TABLE "Fund" ADD COLUMN "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add day to FundSnapshot
ALTER TABLE "FundSnapshot" ADD COLUMN "day" INTEGER NOT NULL DEFAULT 1;

-- Drop old unique constraint
DROP INDEX "FundSnapshot_fundId_month_year_key";

-- Add new unique constraint including day
CREATE UNIQUE INDEX "FundSnapshot_fundId_year_month_day_key" ON "FundSnapshot"("fundId", "year", "month", "day");
