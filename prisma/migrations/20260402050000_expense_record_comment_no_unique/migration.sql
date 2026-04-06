-- Remove unique constraint (allow multiple records for same item/day)
DROP INDEX IF EXISTS "ExpenseRecord_itemId_day_month_year_key";

-- Add comment field
ALTER TABLE "ExpenseRecord" ADD COLUMN "comment" TEXT NOT NULL DEFAULT '';
