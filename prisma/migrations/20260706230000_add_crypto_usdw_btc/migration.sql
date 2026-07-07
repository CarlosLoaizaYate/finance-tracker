-- CreateTable
CREATE TABLE "UsdwPurchase" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "copAmount" INTEGER NOT NULL,
    "commissionCop" INTEGER NOT NULL DEFAULT 0,
    "usdwAmount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UsdwPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BtcPurchase" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "usdwAmount" DOUBLE PRECISION NOT NULL,
    "commissionUsdw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "btcPriceUsdw" DOUBLE PRECISION NOT NULL,
    "btcAmount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "BtcPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoSnapshot" (
    "id" TEXT NOT NULL,
    "day" INTEGER NOT NULL DEFAULT 1,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "usdCopRate" DOUBLE PRECISION NOT NULL,
    "btcPriceUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CryptoSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CryptoSnapshot_userId_day_month_year_key" ON "CryptoSnapshot"("userId", "day", "month", "year");

-- AddForeignKey
ALTER TABLE "UsdwPurchase" ADD CONSTRAINT "UsdwPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BtcPurchase" ADD CONSTRAINT "BtcPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoSnapshot" ADD CONSTRAINT "CryptoSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
