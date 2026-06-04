/*
  Warnings:

  - You are about to drop the column `currentValue` on the `StockPriceSnapshot` table. All the data in the column will be lost.
  - Added the required column `pricePerShare` to the `StockPriceSnapshot` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StockPriceSnapshot" DROP COLUMN "currentValue",
ADD COLUMN     "pricePerShare" INTEGER NOT NULL;
