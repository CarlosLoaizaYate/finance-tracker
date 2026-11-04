import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const logError = (step: string, error: unknown) => {
  console.error(`[stock-sales] ${step}:`, error);
};

// GET /api/stock-sales?investmentId=...
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const investmentId = searchParams.get("investmentId");

    const where: { userId: string; investmentId?: string } = { userId: user.id };
    if (investmentId) {
      where.investmentId = investmentId;
    }

    const sales = await prisma.stockSale.findMany({
      where,
      orderBy: { saleDate: "desc" },
    });

    return NextResponse.json(sales);
  } catch (error) {
    logError("GET", error);
    return NextResponse.json(
      { error: "Failed to fetch sales" },
      { status: 500 }
    );
  }
}

// POST /api/stock-sales
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { investmentId, quantity, priceUnit, commission, saleDate, notes } = body;

    if (!investmentId || !quantity || !priceUnit || commission == null || !saleDate) {
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

    const sale = await prisma.stockSale.create({
      data: {
        investmentId,
        quantity,
        priceUnit,
        commission,
        saleDate: new Date(saleDate),
        notes: notes || "",
        userId: user.id,
      },
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    logError("POST", error);
    return NextResponse.json(
      { error: "Failed to create sale" },
      { status: 500 }
    );
  }
}
