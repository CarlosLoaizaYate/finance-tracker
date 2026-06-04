import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Verify group belongs to user
  const group = await prisma.fixedDepositGroup.findFirst({
    where: { id: body.groupId, userId: user.id },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cycle = await prisma.fixedDeposit.create({
    data: {
      groupId: body.groupId,
      capital: body.capital,
      capitalAdded: body.capitalAdded,
      interestRate: body.interestRate,
      term: body.term ?? 90,
      termUnit: body.termUnit ?? "DAYS",
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      notes: body.notes ?? "",
      userId: user.id,
    },
  });
  return NextResponse.json(cycle);
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const cycle = await prisma.fixedDeposit.findFirst({
    where: { id: body.id, userId: user.id },
  });
  if (!cycle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if ("earnedInterest" in body) data.earnedInterest = body.earnedInterest ?? null;
  if (body.endDate) data.endDate = new Date(body.endDate);

  const updated = await prisma.fixedDeposit.update({
    where: { id: body.id },
    data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const cycle = await prisma.fixedDeposit.findFirst({ where: { id, userId: user.id } });
  if (!cycle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.fixedDeposit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
