import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groups = await prisma.fixedDepositGroup.findMany({
    where: { userId: user.id },
    include: { cycles: { orderBy: { startDate: "asc" }, include: { snapshots: { orderBy: [{ year: "asc" }, { month: "asc" }] } } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const group = await prisma.fixedDepositGroup.create({
    data: {
      name: body.name,
      entity: body.entity,
      userId: user.id,
      cycles: {
        create: {
          capital: body.capital,
          capitalAdded: body.capital,
          interestRate: body.interestRate,
          term: body.term ?? 90,
          termUnit: body.termUnit ?? "DAYS",
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate),
          userId: user.id,
        },
      },
    },
    include: { cycles: { include: { snapshots: true } } },
  });
  return NextResponse.json(group);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const group = await prisma.fixedDepositGroup.findFirst({ where: { id, userId: user.id } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.fixedDepositGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
