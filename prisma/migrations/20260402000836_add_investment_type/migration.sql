-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "typeId" TEXT;

-- CreateTable
CREATE TABLE "InvestmentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "InvestmentType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentType_name_userId_key" ON "InvestmentType"("name", "userId");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InvestmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentType" ADD CONSTRAINT "InvestmentType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
