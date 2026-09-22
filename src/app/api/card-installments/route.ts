import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const installments = await prisma.cardInstallment.findMany({
    where: { userId: user.id },
    orderBy: [{ startYear: "desc" }, { startMonth: "desc" }],
  });
  return NextResponse.json(installments);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const installment = await prisma.cardInstallment.create({
    data: {
      name: body.name,
      totalAmount: body.totalAmount,
      installments: body.installments,
      startMonth: body.startMonth,
      startYear: body.startYear,
      categoryId: body.categoryId ?? null,
      notes: body.notes || "",
      userId: user.id,
    },
  });
  return NextResponse.json(installment, { status: 201 });
}
