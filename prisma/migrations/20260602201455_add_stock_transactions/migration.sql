-- DropForeignKey
ALTER TABLE "BudgetHistory" DROP CONSTRAINT "BudgetHistory_itemId_fkey";

-- DropForeignKey
ALTER TABLE "IncomeHistory" DROP CONSTRAINT "IncomeHistory_sourceId_fkey";

-- AlterTable
ALTER TABLE "ExpenseItem" ADD COLUMN     "isImportant" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StockTransaction" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceUnit" INTEGER NOT NULL,
    "commission" INTEGER NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentMetrics" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "totalInvested" INTEGER NOT NULL,
    "totalCommissions" INTEGER NOT NULL,
    "totalCost" INTEGER NOT NULL,
    "totalShares" INTEGER NOT NULL,
    "avgCostPerShare" INTEGER NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "InvestmentMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentMetrics_investmentId_key" ON "InvestmentMetrics"("investmentId");

-- AddForeignKey
ALTER TABLE "IncomeHistory" ADD CONSTRAINT "IncomeHistory_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IncomeSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetHistory" ADD CONSTRAINT "BudgetHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ExpenseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentMetrics" ADD CONSTRAINT "InvestmentMetrics_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentMetrics" ADD CONSTRAINT "InvestmentMetrics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
