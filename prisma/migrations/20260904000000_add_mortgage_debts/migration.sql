-- CreateTable
CREATE TABLE "Mortgage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "principal" INTEGER NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "isUvrIndexed" BOOLEAN NOT NULL DEFAULT false,
    "termMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Mortgage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MortgagePayment" (
    "id" TEXT NOT NULL,
    "mortgageId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "principalPaid" INTEGER NOT NULL,
    "interestPaid" INTEGER NOT NULL DEFAULT 0,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "MortgagePayment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Mortgage" ADD CONSTRAINT "Mortgage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgagePayment" ADD CONSTRAINT "MortgagePayment_mortgageId_fkey" FOREIGN KEY ("mortgageId") REFERENCES "Mortgage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgagePayment" ADD CONSTRAINT "MortgagePayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
