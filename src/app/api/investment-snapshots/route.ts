import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "2025");

  const snapshots = await prisma.investmentSnapshot.findMany({
    where: { userId: user.id, year },
    orderBy: [{ month: "asc" }],
  });
  return NextResponse.json(snapshots);
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const snapshot = await prisma.investmentSnapshot.upsert({
    where: {
      investmentId_month_year: {
        investmentId: body.investmentId,
        month: body.month,
        year: body.year,
      },
    },
    update: { currentValue: body.currentValue, contribution: body.contribution },
    create: {
      investmentId: body.investmentId,
      month: body.month,
      year: body.year,
      currentValue: body.currentValue,
      contribution: body.contribution,
      userId: user.id,
    },
  });
  return NextResponse.json(snapshot);
}
