import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const investments = await prisma.investment.findMany({
    where: { userId: user.id, active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(investments);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const investment = await prisma.investment.create({
    data: {
      name: body.name,
      type: body.type,
      color: body.color,
      investedCapital: body.investedCapital,
      userId: user.id,
    },
  });
  return NextResponse.json(investment);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.investment.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({ ok: true });
}
