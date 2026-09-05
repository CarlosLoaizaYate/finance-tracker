-- Track the contractual rate separately from the subsidized rate actually
-- charged (e.g. Colombia's "Mi Casa Ya" rate-coverage benefit), plus the
-- interest amount covered by that subsidy per payment.
ALTER TABLE "Mortgage" ADD COLUMN "subsidizedRate" DOUBLE PRECISION;
ALTER TABLE "Mortgage" ADD COLUMN "subsidyRate" DOUBLE PRECISION;
ALTER TABLE "Mortgage" ADD COLUMN "subsidyEndDate" TIMESTAMP(3);

ALTER TABLE "MortgagePayment" ADD COLUMN "interestCovered" INTEGER NOT NULL DEFAULT 0;
