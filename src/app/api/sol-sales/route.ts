import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const logError = (step: string, error: unknown) => {
  console.error(`[sol-sales] ${step}:`, error);
};

// GET /api/sol-sales
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sales = await prisma.solSale.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(sales);
  } catch (error) {
    logError("GET", error);
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 });
  }
}

// POST /api/sol-sales
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { date, solAmount, commissionUsdw, solPriceUsdw, usdwReceived, notes } = body;

    if (!date || !solAmount || !solPriceUsdw || !usdwReceived) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sale = await prisma.solSale.create({
      data: {
        date: new Date(date),
        solAmount,
        commissionUsdw: commissionUsdw ?? 0,
        solPriceUsdw,
        usdwReceived,
        notes: notes || "",
        userId: user.id,
      },
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    logError("POST", error);
    return NextResponse.json({ error: "Failed to create sale" }, { status: 500 });
  }
}
