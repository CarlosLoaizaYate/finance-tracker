-- CreateTable
CREATE TABLE "BudgetHistory" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "effectiveMonth" INTEGER NOT NULL,
    "effectiveYear" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "BudgetHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetHistory_itemId_effectiveMonth_effectiveYear_key" ON "BudgetHistory"("itemId", "effectiveMonth", "effectiveYear");

-- AddForeignKey
ALTER TABLE "BudgetHistory" ADD CONSTRAINT "BudgetHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ExpenseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetHistory" ADD CONSTRAINT "BudgetHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
