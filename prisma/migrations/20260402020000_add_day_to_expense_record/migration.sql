-- Add day column (default 1 keeps existing records valid)
ALTER TABLE "ExpenseRecord" ADD COLUMN "day" INTEGER NOT NULL DEFAULT 1;

-- Drop old unique constraint
ALTER TABLE "ExpenseRecord" DROP CONSTRAINT IF EXISTS "ExpenseRecord_itemId_month_year_key";

-- Add new unique constraint including day
CREATE UNIQUE INDEX "ExpenseRecord_itemId_day_month_year_key"
  ON "ExpenseRecord"("itemId", "day", "month", "year");
