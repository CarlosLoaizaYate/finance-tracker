/*
  Warnings:

  - You are about to drop the column `termMonths` on the `FixedDeposit` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FixedDeposit" DROP COLUMN "termMonths",
ADD COLUMN     "term" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "termUnit" TEXT NOT NULL DEFAULT 'DAYS';
