import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const createSchema = z.object({
  name: z.string().min(1),
  amount: z.number(),
  effectiveMonth: z.number(),
  effectiveYear: z.number(),
});

export async function GET() {
  try {
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
  } catch (error) {
    return apiError("income-sources", "GET", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = createSchema.parse(await req.json());
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
  } catch (error) {
    return apiError("income-sources", "POST", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await prisma.incomeHistory.deleteMany({ where: { sourceId: id, userId: user.id } });
    await prisma.incomeSource.delete({ where: { id, userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError("income-sources", "DELETE", error);
  }
}
