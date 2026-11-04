import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const createSchema = z.object({
  name: z.string().min(1),
  totalAmount: z.number(),
  installments: z.number(),
  startMonth: z.number(),
  startYear: z.number(),
  categoryId: z.string().nullish(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const installments = await prisma.cardInstallment.findMany({
      where: { userId: user.id },
      orderBy: [{ startYear: "desc" }, { startMonth: "desc" }],
    });
    return NextResponse.json(installments);
  } catch (error) {
    return apiError("card-installments", "GET", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = createSchema.parse(await req.json());
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
  } catch (error) {
    return apiError("card-installments", "POST", error);
  }
}
