import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const createSchema = z.object({
  name: z.string().min(1),
  entity: z.string().min(1),
  capital: z.number(),
  interestRate: z.number(),
  term: z.number().optional(),
  termUnit: z.enum(["DAYS", "MONTHS"]).optional(),
  startDate: z.string(),
  endDate: z.string(),
});

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const groups = await prisma.fixedDepositGroup.findMany({
      where: { userId: user.id },
      include: { cycles: { orderBy: { startDate: "asc" }, include: { snapshots: { orderBy: [{ year: "asc" }, { month: "asc" }, { day: "asc" }] } } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(groups);
  } catch (error) {
    return apiError("fixed-deposit-groups", "GET", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = createSchema.parse(await req.json());
    const group = await prisma.fixedDepositGroup.create({
      data: {
        name: body.name,
        entity: body.entity,
        userId: user.id,
        cycles: {
          create: {
            capital: body.capital,
            capitalAdded: body.capital,
            interestRate: body.interestRate,
            term: body.term ?? 90,
            termUnit: body.termUnit ?? "DAYS",
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
            userId: user.id,
          },
        },
      },
      include: { cycles: { include: { snapshots: true } } },
    });
    return NextResponse.json(group);
  } catch (error) {
    return apiError("fixed-deposit-groups", "POST", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const group = await prisma.fixedDepositGroup.findFirst({ where: { id, userId: user.id } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.fixedDepositGroup.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError("fixed-deposit-groups", "DELETE", error);
  }
}
