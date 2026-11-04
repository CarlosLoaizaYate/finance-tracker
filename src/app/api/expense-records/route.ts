import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const initMonthSchema = z.object({
  month: z.number(),
  year: z.number(),
});

const upsertSchema = z.object({
  id: z.string().optional(),
  itemId: z.string().optional(),
  day: z.number().optional(),
  month: z.number().optional(),
  year: z.number().optional(),
  realValue: z.number().optional(),
  comment: z.string().optional(),
  paidWithCard: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);

    const fromYear  = parseInt(searchParams.get("fromYear")  ?? "");
    const fromMonth = parseInt(searchParams.get("fromMonth") ?? "");
    const toYear    = parseInt(searchParams.get("toYear")    ?? "");
    const toMonth   = parseInt(searchParams.get("toMonth")   ?? "");
    const hasRange  = !isNaN(fromYear) && !isNaN(fromMonth) && !isNaN(toYear) && !isNaN(toMonth);

    const records = await prisma.expenseRecord.findMany({
      where: hasRange
        ? {
            userId: user.id,
            AND: [
              { OR: [{ year: { gt: fromYear } }, { year: fromYear, month: { gte: fromMonth } }] },
              { OR: [{ year: { lt: toYear  } }, { year: toYear,   month: { lte: toMonth  } }] },
            ],
          }
        : { userId: user.id, year: parseInt(searchParams.get("year") ?? "2025") },
      orderBy: [{ year: "asc" }, { month: "asc" }, { day: "asc" }],
    });
    return NextResponse.json(records);
  } catch (error) {
    return apiError("expense-records", "GET", error);
  }
}

// Delete by record id
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await prisma.expenseRecord.deleteMany({ where: { id, userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError("expense-records", "DELETE", error);
  }
}

// Initialize a month with all recurring items (only creates missing records)
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { month, year } = initMonthSchema.parse(await req.json());

    const [recurringItems, existing] = await Promise.all([
      prisma.expenseItem.findMany({ where: { userId: user.id, active: true, recurring: true } }),
      prisma.expenseRecord.findMany({ where: { userId: user.id, month, year }, select: { itemId: true } }),
    ]);

    const existingIds = new Set(existing.map((r) => r.itemId));
    const toCreate = recurringItems.filter((it) => !existingIds.has(it.id));

    if (toCreate.length > 0) {
      await prisma.expenseRecord.createMany({
        data: toCreate.map((it) => ({
          itemId: it.id, day: it.defaultDay ?? 1, month, year,
          realValue: it.monthlyBudget, userId: user.id,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ created: toCreate.length });
  } catch (error) {
    return apiError("expense-records", "POST", error);
  }
}

// Create or update a record
// - body.id present  → update (day, realValue, comment)
// - body.id absent   → create new record
export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = upsertSchema.parse(await req.json());

    if (body.id) {
      const data: Record<string, unknown> = {};
      if (body.day       !== undefined) data.day       = body.day;
      if (body.realValue !== undefined) data.realValue = body.realValue;
      if (body.comment   !== undefined) data.comment   = body.comment;
      if (body.itemId    !== undefined) data.itemId    = body.itemId;
      if (body.paidWithCard !== undefined) data.paidWithCard = body.paidWithCard;
      const record = await prisma.expenseRecord.update({
        where: { id: body.id, userId: user.id },
        data,
      });
      return NextResponse.json(record);
    }

    if (!body.itemId || body.month === undefined || body.year === undefined || body.realValue === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const record = await prisma.expenseRecord.create({
      data: {
        itemId:    body.itemId,
        day:       body.day ?? 1,
        month:     body.month,
        year:      body.year,
        realValue: body.realValue,
        comment:   body.comment ?? "",
        paidWithCard: body.paidWithCard ?? false,
        userId:    user.id,
      },
    });
    return NextResponse.json(record);
  } catch (error) {
    return apiError("expense-records", "PUT", error);
  }
}
