-- Drop InvestmentMetrics table (unused by frontend — data was 0 rows)
DROP TABLE IF EXISTS "InvestmentMetrics";

-- Drop InvestmentSnapshot table (legacy system replaced by StockTransaction/FundSnapshot/FixedDepositSnapshot)
-- Backup was saved to scripts/legacy-tables-backup.json (5 rows)
DROP TABLE IF EXISTS "InvestmentSnapshot";
