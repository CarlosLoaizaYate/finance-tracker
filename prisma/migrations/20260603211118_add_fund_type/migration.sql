-- AlterTable
ALTER TABLE "Fund" ADD COLUMN     "typeId" TEXT;

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InvestmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
