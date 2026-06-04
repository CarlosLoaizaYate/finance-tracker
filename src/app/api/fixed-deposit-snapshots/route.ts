import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const depositId = searchParams.get("depositId");
  if (!depositId) return NextResponse.json({ error: "Missing depositId" }, { status: 400 });

  const snapshots = await prisma.fixedDepositSnapshot.findMany({
    where: { depositId, userId: user.id },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  return NextResponse.json(snapshots);
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Verify deposit belongs to user
  const deposit = await prisma.fixedDeposit.findFirst({
    where: { id: body.depositId, userId: user.id },
  });
  if (!deposit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snapshot = await prisma.fixedDepositSnapshot.upsert({
    where: { depositId_month_year: { depositId: body.depositId, month: body.month, year: body.year } },
    update: { gain: body.gain },
    create: {
      depositId: body.depositId,
      month: body.month,
      year: body.year,
      gain: body.gain,
      userId: user.id,
    },
  });
  return NextResponse.json(snapshot);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const depositId = searchParams.get("depositId");
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  if (!depositId || !month || !year) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  await prisma.fixedDepositSnapshot.deleteMany({
    where: { depositId, month: Number(month), year: Number(year), userId: user.id },
  });
  return NextResponse.json({ ok: true });
}
