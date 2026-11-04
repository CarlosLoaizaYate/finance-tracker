import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const upsertSchema = z.object({
  sourceId: z.string().min(1),
  effectiveMonth: z.number(),
  effectiveYear: z.number(),
  amount: z.number(),
});

// POST: add a new history entry for an income source (effective from a given month/year)
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = upsertSchema.parse(await req.json());
    const entry = await prisma.incomeHistory.upsert({
      where: {
        sourceId_effectiveMonth_effectiveYear: {
          sourceId: body.sourceId,
          effectiveMonth: body.effectiveMonth,
          effectiveYear: body.effectiveYear,
        },
      },
      update: { amount: body.amount },
      create: {
        amount: body.amount,
        effectiveMonth: body.effectiveMonth,
        effectiveYear: body.effectiveYear,
        sourceId: body.sourceId,
        userId: user.id,
      },
    });
    return NextResponse.json(entry);
  } catch (error) {
    return apiError("income-history", "POST", error);
  }
}
