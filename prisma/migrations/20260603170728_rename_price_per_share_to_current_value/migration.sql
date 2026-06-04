/*
  Warnings:

  - You are about to drop the column `pricePerShare` on the `StockPriceSnapshot` table. All the data in the column will be lost.
  - Added the required column `currentValue` to the `StockPriceSnapshot` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StockPriceSnapshot" DROP COLUMN "pricePerShare",
ADD COLUMN     "currentValue" INTEGER NOT NULL;
