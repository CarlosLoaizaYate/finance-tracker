import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const existing = await prisma.mortgagePayment.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.principalPaid    !== undefined) data.principalPaid    = body.principalPaid;
  if (body.interestPaid     !== undefined) data.interestPaid     = body.interestPaid;
  if (body.interestCovered  !== undefined) data.interestCovered  = body.interestCovered;
  if (body.insurancePaid    !== undefined) data.insurancePaid    = body.insurancePaid;
  if (body.realBalance      !== undefined) data.realBalance      = body.realBalance;
  if (body.realBalanceDate  !== undefined) data.realBalanceDate  = body.realBalanceDate ? new Date(body.realBalanceDate) : null;
  if (body.previousBalance     !== undefined) data.previousBalance     = body.previousBalance;
  if (body.previousBalanceDate !== undefined) data.previousBalanceDate = body.previousBalanceDate ? new Date(body.previousBalanceDate) : null;
  if (body.notes            !== undefined) data.notes            = body.notes;
  if (body.isEstimated      !== undefined) data.isEstimated      = !!body.isEstimated;

  // Entering the bank's real balance is the signal that the real extracto
  // is now in hand — clear the estimated flag unless the caller explicitly
  // set it in this same request.
  if (body.realBalance !== undefined && body.realBalance !== null && body.isEstimated === undefined) {
    data.isEstimated = false;
  }

  const payment = await prisma.mortgagePayment.update({ where: { id }, data });
  return NextResponse.json(payment);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const payment = await prisma.mortgagePayment.findUnique({ where: { id } });
  if (!payment || payment.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.mortgagePayment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
