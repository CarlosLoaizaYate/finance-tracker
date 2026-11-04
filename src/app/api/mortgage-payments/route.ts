import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const createSchema = z.object({
  mortgageId: z.string().min(1),
  date: z.string(),
  principalPaid: z.number(),
  interestPaid: z.number().optional(),
  interestCovered: z.number().optional(),
  insurancePaid: z.number().optional(),
  realBalance: z.number().nullish(),
  realBalanceDate: z.string().nullish(),
  isExtra: z.boolean().optional(),
  isEstimated: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const mortgageId = searchParams.get("mortgageId");

    const payments = await prisma.mortgagePayment.findMany({
      where: { userId: user.id, ...(mortgageId ? { mortgageId } : {}) },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(payments);
  } catch (error) {
    return apiError("mortgage-payments", "GET", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = createSchema.parse(await req.json());

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
        realBalanceDate: body.realBalanceDate ? new Date(body.realBalanceDate) : null,
        isExtra: !!body.isExtra,
        // A regular installment added without a real bank balance in hand is
        // presumed to be a same-day guess pending the extracto; abonos extra
        // are always exact amounts the client chose, never estimated.
        isEstimated: body.isEstimated !== undefined
          ? !!body.isEstimated
          : !body.isExtra && body.realBalance == null,
        notes: body.notes || "",
        userId: user.id,
      },
    });
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    return apiError("mortgage-payments", "POST", error);
  }
}
