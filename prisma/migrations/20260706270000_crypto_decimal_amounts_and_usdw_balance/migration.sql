-- AlterTable: allow decimal values for crypto money fields
ALTER TABLE "User" ALTER COLUMN "cryptoSellCommission" TYPE DOUBLE PRECISION;
ALTER TABLE "UsdwPurchase" ALTER COLUMN "commissionCop" TYPE DOUBLE PRECISION;

-- AlterTable: optional manually-entered USDW balance (to track interest earned over time)
ALTER TABLE "CryptoSnapshot" ADD COLUMN "usdwBalance" DOUBLE PRECISION;
