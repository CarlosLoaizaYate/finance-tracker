-- Drop the old unique index (no day column) if it still exists
DROP INDEX IF EXISTS "ExpenseRecord_itemId_month_year_key";

-- Ensure the correct unique index (with day) exists
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRecord_itemId_day_month_year_key"
  ON "ExpenseRecord"("itemId", "day", "month", "year");
