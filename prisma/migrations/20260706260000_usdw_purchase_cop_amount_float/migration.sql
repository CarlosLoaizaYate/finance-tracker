-- AlterTable: allow decimal COP amounts on USDW purchases
ALTER TABLE "UsdwPurchase" ALTER COLUMN "copAmount" TYPE DOUBLE PRECISION;
