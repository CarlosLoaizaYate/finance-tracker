import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snapshots = await prisma.cryptoSnapshot.findMany({
    where: { userId: user.id },
    orderBy: [{ year: "asc" }, { month: "asc" }, { day: "asc" }],
  });
  return NextResponse.json(snapshots);
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const snapshot = await prisma.cryptoSnapshot.upsert({
    where: {
      userId_day_month_year: {
        userId: user.id,
        day: body.day,
        month: body.month,
        year: body.year,
      },
    },
    update: { usdCopRate: body.usdCopRate, btcPriceUsd: body.btcPriceUsd, usdwBalance: body.usdwBalance ?? null },
    create: {
      day: body.day,
      month: body.month,
      year: body.year,
      usdCopRate: body.usdCopRate,
      btcPriceUsd: body.btcPriceUsd,
      usdwBalance: body.usdwBalance ?? null,
      userId: user.id,
    },
  });
  return NextResponse.json(snapshot);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const day = searchParams.get("day");
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  if (!day || !month || !year) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  await prisma.cryptoSnapshot.deleteMany({
    where: { userId: user.id, day: Number(day), month: Number(month), year: Number(year) },
  });
  return NextResponse.json({ ok: true });
}
