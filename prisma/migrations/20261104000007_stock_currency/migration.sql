-- Additive: lets a Stock be denominated in USD instead of COP, so US stocks don't get stored
-- as if their dollar price were pesos. Existing stocks default to "COP" (unchanged behavior).
ALTER TABLE "Stock" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'COP';

-- Type widen Int -> Float on money fields that previously only needed whole pesos, so USD
-- prices/commissions (which need cents, e.g. $150.25) can be stored precisely. Existing integer
-- values convert losslessly to the equivalent double.
ALTER TABLE "Stock" ALTER COLUMN "investedCapital" TYPE DOUBLE PRECISION;
ALTER TABLE "Stock" ALTER COLUMN "sellCommission" TYPE DOUBLE PRECISION;
ALTER TABLE "StockTransaction" ALTER COLUMN "priceUnit" TYPE DOUBLE PRECISION;
ALTER TABLE "StockTransaction" ALTER COLUMN "commission" TYPE DOUBLE PRECISION;
ALTER TABLE "StockSale" ALTER COLUMN "priceUnit" TYPE DOUBLE PRECISION;
ALTER TABLE "StockSale" ALTER COLUMN "commission" TYPE DOUBLE PRECISION;
ALTER TABLE "StockPriceSnapshot" ALTER COLUMN "pricePerShare" TYPE DOUBLE PRECISION;
