-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeHistory" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "effectiveMonth" INTEGER NOT NULL,
    "effectiveYear" INTEGER NOT NULL,
    "sourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "IncomeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncomeSource_name_userId_key" ON "IncomeSource"("name", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeHistory_sourceId_effectiveMonth_effectiveYear_key" ON "IncomeHistory"("sourceId", "effectiveMonth", "effectiveYear");

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeHistory" ADD CONSTRAINT "IncomeHistory_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IncomeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeHistory" ADD CONSTRAINT "IncomeHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
