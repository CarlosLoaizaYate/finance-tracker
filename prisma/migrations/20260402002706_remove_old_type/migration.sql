/*
  Warnings:

  - You are about to drop the column `type` on the `Investment` table. All the data in the column will be lost.
  - Made the column `typeId` on table `Investment` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Investment" DROP CONSTRAINT "Investment_typeId_fkey";

-- AlterTable
ALTER TABLE "Investment" DROP COLUMN "type",
ALTER COLUMN "typeId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InvestmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
