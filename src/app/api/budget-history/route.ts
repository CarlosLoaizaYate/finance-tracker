import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const upsertSchema = z.object({
  itemId: z.string().min(1),
  effectiveMonth: z.number(),
  effectiveYear: z.number(),
  amount: z.number(),
});

// POST: add or update a budget history entry for an expense item
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = upsertSchema.parse(await req.json());
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
  } catch (error) {
    return apiError("budget-history", "POST", error);
  }
}
