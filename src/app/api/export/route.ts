import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

// GET /api/export — a full backup of everything this user has entered, across every feature.
// Downloaded as a single JSON file; there's no restore path (yet), this is purely "don't lose it".
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = user.id;
    const [
      categories,
      expenseItems,
      expenseRecords,
      cardInstallments,
      stocks,
      investmentTypes,
      incomeSources,
      incomeHistory,
      budgetHistory,
      stockTransactions,
      stockSales,
      stockPriceSnapshots,
      funds,
      fundSnapshots,
      fixedDepositGroups,
      fixedDeposits,
      fixedDepositSnapshots,
      usdwPurchases,
      usdwSales,
      btcPurchases,
      solPurchases,
      btcSales,
      solSales,
      cryptoSnapshots,
      mortgages,
      mortgagePayments,
    ] = await Promise.all([
      prisma.category.findMany({ where: { userId } }),
      prisma.expenseItem.findMany({ where: { userId } }),
      prisma.expenseRecord.findMany({ where: { userId } }),
      prisma.cardInstallment.findMany({ where: { userId } }),
      prisma.stock.findMany({ where: { userId } }),
      prisma.investmentType.findMany({ where: { userId } }),
      prisma.incomeSource.findMany({ where: { userId } }),
      prisma.incomeHistory.findMany({ where: { userId } }),
      prisma.budgetHistory.findMany({ where: { userId } }),
      prisma.stockTransaction.findMany({ where: { userId } }),
      prisma.stockSale.findMany({ where: { userId } }),
      prisma.stockPriceSnapshot.findMany({ where: { userId } }),
      prisma.fund.findMany({ where: { userId } }),
      prisma.fundSnapshot.findMany({ where: { userId } }),
      prisma.fixedDepositGroup.findMany({ where: { userId } }),
      prisma.fixedDeposit.findMany({ where: { userId } }),
      prisma.fixedDepositSnapshot.findMany({ where: { userId } }),
      prisma.usdwPurchase.findMany({ where: { userId } }),
      prisma.usdwSale.findMany({ where: { userId } }),
      prisma.btcPurchase.findMany({ where: { userId } }),
      prisma.solPurchase.findMany({ where: { userId } }),
      prisma.btcSale.findMany({ where: { userId } }),
      prisma.solSale.findMany({ where: { userId } }),
      prisma.cryptoSnapshot.findMany({ where: { userId } }),
      prisma.mortgage.findMany({ where: { userId } }),
      prisma.mortgagePayment.findMany({ where: { userId } }),
    ]);

    const backup = {
      exportedAt: new Date().toISOString(),
      userEmail: user.email,
      settings: {
        cryptoSellCommission: user.cryptoSellCommission,
        cryptoCommissionRate: user.cryptoCommissionRate,
        btcTargetGrowthPct: user.btcTargetGrowthPct,
        solTargetGrowthPct: user.solTargetGrowthPct,
      },
      categories,
      expenseItems,
      expenseRecords,
      cardInstallments,
      stocks,
      investmentTypes,
      incomeSources,
      incomeHistory,
      budgetHistory,
      stockTransactions,
      stockSales,
      stockPriceSnapshots,
      funds,
      fundSnapshots,
      fixedDepositGroups,
      fixedDeposits,
      fixedDepositSnapshots,
      usdwPurchases,
      usdwSales,
      btcPurchases,
      solPurchases,
      btcSales,
      solSales,
      cryptoSnapshots,
      mortgages,
      mortgagePayments,
    };

    const filename = `finance-tracker-backup-${new Date().toISOString().split("T")[0]}.json`;
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return apiError("export", "GET", error);
  }
}
