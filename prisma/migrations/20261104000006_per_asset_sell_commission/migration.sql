-- Additive: per-asset sell commission overrides for crypto (USDW/BTC/SOL), each defaulting
-- to 0 (meaning "use the default rate") so existing users and settings are unaffected.
ALTER TABLE "User" ADD COLUMN "cryptoUsdwSellCommission" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "cryptoBtcSellCommission" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "cryptoSolSellCommission" DOUBLE PRECISION NOT NULL DEFAULT 0;
