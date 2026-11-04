-- CreateTable
CREATE TABLE "StockSale" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceUnit" INTEGER NOT NULL,
    "commission" INTEGER NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StockSale_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StockSale" ADD CONSTRAINT "StockSale_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSale" ADD CONSTRAINT "StockSale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
