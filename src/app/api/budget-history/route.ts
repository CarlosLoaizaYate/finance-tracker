import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// POST: add or update a budget history entry for an expense item
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const entry = await prisma.budgetHistory.upsert({
    where: {
      itemId_effectiveMonth_effectiveYear: {
        itemId: body.itemId,
        effectiveMonth: body.effectiveMonth,
        effectiveYear: body.effectiveYear,
      },
    },
    update: { amount: body.amount },
    create: {
      amount: body.amount,
      effectiveMonth: body.effectiveMonth,
      effectiveYear: body.effectiveYear,
      itemId: body.itemId,
      userId: user.id,
    },
  });
  return NextResponse.json(entry);
}
