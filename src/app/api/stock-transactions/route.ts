import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const logError = (step: string, error: unknown) => {
  console.error(`[stock-transactions] ${step}:`, error);
};

// GET /api/stock-transactions?investmentId=...
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const investmentId = searchParams.get("investmentId");

    const where: any = { userId: user.id };
    if (investmentId) {
      where.investmentId = investmentId;
    }

    const transactions = await prisma.stockTransaction.findMany({
      where,
      orderBy: { transactionDate: "desc" },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    logError("GET", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

// POST /api/stock-transactions
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { investmentId, quantity, priceUnit, commission, transactionDate, notes } = body;

    if (!investmentId || !quantity || !priceUnit || commission == null || !transactionDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify investment belongs to user
    const investment = await prisma.stock.findUnique({
      where: { id: investmentId },
    });

    if (!investment || investment.userId !== user.id) {
      return NextResponse.json(
        { error: "Investment not found or unauthorized" },
        { status: 404 }
      );
    }

    // Create transaction
    const transaction = await prisma.stockTransaction.create({
      data: {
        investmentId,
        quantity,
        priceUnit,
        commission,
        transactionDate: new Date(transactionDate),
        notes: notes || "",
        userId: user.id,
      },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    logError("POST", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}

