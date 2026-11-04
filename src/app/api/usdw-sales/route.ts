import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const logError = (step: string, error: unknown) => {
  console.error(`[usdw-sales] ${step}:`, error);
};

// GET /api/usdw-sales
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sales = await prisma.usdwSale.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(sales);
  } catch (error) {
    logError("GET", error);
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 });
  }
}

// POST /api/usdw-sales
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { date, usdwAmount, commissionCop, copReceived, notes } = body;

    if (!date || !usdwAmount || !copReceived) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sale = await prisma.usdwSale.create({
      data: {
        date: new Date(date),
        usdwAmount,
        commissionCop: commissionCop ?? 0,
        copReceived,
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
