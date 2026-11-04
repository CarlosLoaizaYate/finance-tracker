import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const createSchema = z.object({
  groupId: z.string().min(1),
  capital: z.number(),
  capitalAdded: z.number(),
  interestRate: z.number(),
  term: z.number().optional(),
  termUnit: z.enum(["DAYS", "MONTHS"]).optional(),
  startDate: z.string(),
  endDate: z.string(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  earnedInterest: z.number().nullable().optional(),
  endDate: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = createSchema.parse(await req.json());

    // Verify group belongs to user
    const group = await prisma.fixedDepositGroup.findFirst({
      where: { id: body.groupId, userId: user.id },
    });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const cycle = await prisma.fixedDeposit.create({
      data: {
        groupId: body.groupId,
        capital: body.capital,
        capitalAdded: body.capitalAdded,
        interestRate: body.interestRate,
        term: body.term ?? 90,
        termUnit: body.termUnit ?? "DAYS",
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        notes: body.notes ?? "",
        userId: user.id,
      },
    });
    return NextResponse.json(cycle);
  } catch (error) {
    return apiError("fixed-deposits", "POST", error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = updateSchema.parse(await req.json());
    const cycle = await prisma.fixedDeposit.findFirst({
      where: { id: body.id, userId: user.id },
    });
    if (!cycle) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.earnedInterest !== undefined) data.earnedInterest = body.earnedInterest ?? null;
    if (body.endDate) data.endDate = new Date(body.endDate);

    const updated = await prisma.fixedDeposit.update({
      where: { id: body.id },
      data,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return apiError("fixed-deposits", "PUT", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const cycle = await prisma.fixedDeposit.findFirst({ where: { id, userId: user.id } });
    if (!cycle) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.fixedDeposit.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError("fixed-deposits", "DELETE", error);
  }
}
