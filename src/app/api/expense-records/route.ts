import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "2025");

  const records = await prisma.expenseRecord.findMany({
    where: { userId: user.id, year },
    orderBy: [{ month: "asc" }],
  });
  return NextResponse.json(records);
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const record = await prisma.expenseRecord.upsert({
    where: {
      itemId_month_year: {
        itemId: body.itemId,
        month: body.month,
        year: body.year,
      },
    },
    update: { realValue: body.realValue },
    create: {
      itemId: body.itemId,
      month: body.month,
      year: body.year,
      realValue: body.realValue,
      userId: user.id,
    },
  });
  return NextResponse.json(record);
}
