import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mortgageId = searchParams.get("mortgageId");

  const payments = await prisma.mortgagePayment.findMany({
    where: { userId: user.id, ...(mortgageId ? { mortgageId } : {}) },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(payments);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const mortgage = await prisma.mortgage.findFirst({
    where: { id: body.mortgageId, userId: user.id },
  });
  if (!mortgage) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const payment = await prisma.mortgagePayment.create({
    data: {
      mortgageId: body.mortgageId,
      date: new Date(body.date),
      principalPaid: body.principalPaid,
      interestPaid: body.interestPaid ?? 0,
      interestCovered: body.interestCovered ?? 0,
      insurancePaid: body.insurancePaid ?? 0,
      realBalance: body.realBalance ?? null,
      isExtra: !!body.isExtra,
      notes: body.notes || "",
      userId: user.id,
    },
  });
  return NextResponse.json(payment, { status: 201 });
}
