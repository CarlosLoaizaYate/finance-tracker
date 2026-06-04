-- CreateTable
CREATE TABLE "StockPriceSnapshot" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "pricePerShare" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StockPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockPriceSnapshot_investmentId_month_year_key" ON "StockPriceSnapshot"("investmentId", "month", "year");

-- AddForeignKey
ALTER TABLE "StockPriceSnapshot" ADD CONSTRAINT "StockPriceSnapshot_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPriceSnapshot" ADD CONSTRAINT "StockPriceSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
