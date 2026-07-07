import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const logError = (step: string, error: unknown) => {
  console.error(`[usdw-purchases] ${step}:`, error);
};

// GET /api/usdw-purchases
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const purchases = await prisma.usdwPurchase.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(purchases);
  } catch (error) {
    logError("GET", error);
    return NextResponse.json({ error: "Failed to fetch purchases" }, { status: 500 });
  }
}

// POST /api/usdw-purchases
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { date, copAmount, commissionCop, usdwAmount, notes } = body;

    if (!date || !copAmount || !usdwAmount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const purchase = await prisma.usdwPurchase.create({
      data: {
        date: new Date(date),
        copAmount,
        commissionCop: commissionCop ?? 0,
        usdwAmount,
        notes: notes || "",
        userId: user.id,
      },
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    logError("POST", error);
    return NextResponse.json({ error: "Failed to create purchase" }, { status: 500 });
  }
}
