import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mortgages = await prisma.mortgage.findMany({
    where: { userId: user.id },
    include: { payments: { orderBy: { date: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(mortgages);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const mortgage = await prisma.mortgage.create({
    data: {
      name: body.name,
      entity: body.entity,
      principal: body.principal,
      interestRate: body.interestRate,
      subsidizedRate: body.subsidizedRate ?? null,
      subsidyRate: body.subsidyRate ?? null,
      subsidyEndDate: body.subsidyEndDate ? new Date(body.subsidyEndDate) : null,
      isUvrIndexed: !!body.isUvrIndexed,
      termMonths: body.termMonths,
      startDate: new Date(body.startDate),
      notes: body.notes || "",
      userId: user.id,
    },
    include: { payments: true },
  });
  return NextResponse.json(mortgage, { status: 201 });
}
