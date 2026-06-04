-- CreateTable
CREATE TABLE "FixedDepositSnapshot" (
    "id" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "gain" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "FixedDepositSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixedDepositSnapshot_depositId_month_year_key" ON "FixedDepositSnapshot"("depositId", "month", "year");

-- AddForeignKey
ALTER TABLE "FixedDepositSnapshot" ADD CONSTRAINT "FixedDepositSnapshot_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "FixedDeposit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedDepositSnapshot" ADD CONSTRAINT "FixedDepositSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
