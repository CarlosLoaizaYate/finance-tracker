import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const createSchema = z.object({
  name: z.string().min(1),
  entity: z.string().min(1),
  principal: z.number(),
  interestRate: z.number(),
  subsidizedRate: z.number().nullish(),
  subsidyRate: z.number().nullish(),
  subsidyEndDate: z.string().nullish(),
  isUvrIndexed: z.boolean().optional(),
  termMonths: z.number(),
  startDate: z.string(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const mortgages = await prisma.mortgage.findMany({
      where: { userId: user.id },
      include: { payments: { orderBy: { date: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(mortgages);
  } catch (error) {
    return apiError("mortgages", "GET", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = createSchema.parse(await req.json());
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
  } catch (error) {
    return apiError("mortgages", "POST", error);
  }
}
