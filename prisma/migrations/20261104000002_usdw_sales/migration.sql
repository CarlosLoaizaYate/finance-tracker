-- CreateTable
CREATE TABLE "UsdwSale" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "usdwAmount" DOUBLE PRECISION NOT NULL,
    "commissionCop" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "copReceived" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UsdwSale_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UsdwSale" ADD CONSTRAINT "UsdwSale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
