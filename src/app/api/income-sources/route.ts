import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sources = await prisma.incomeSource.findMany({
    where: { userId: user.id },
    include: {
      history: { orderBy: [{ effectiveYear: "asc" }, { effectiveMonth: "asc" }] },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(sources);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const source = await prisma.incomeSource.create({
    data: {
      name: body.name,
      userId: user.id,
      history: {
        create: {
          amount: body.amount,
          effectiveMonth: body.effectiveMonth,
          effectiveYear: body.effectiveYear,
          userId: user.id,
        },
      },
    },
    include: {
      history: { orderBy: [{ effectiveYear: "asc" }, { effectiveMonth: "asc" }] },
    },
  });
  return NextResponse.json(source);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.incomeHistory.deleteMany({ where: { sourceId: id, userId: user.id } });
  await prisma.incomeSource.delete({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
