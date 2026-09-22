ALTER TABLE "ExpenseRecord" ADD COLUMN "paidWithCard" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CardInstallment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "installments" INTEGER NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "categoryId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CardInstallment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CardInstallment" ADD CONSTRAINT "CardInstallment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardInstallment" ADD CONSTRAINT "CardInstallment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
