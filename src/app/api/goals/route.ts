import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const metricSchema = z.enum(["NET_WORTH", "INVESTMENTS_VALUE", "CUSTOM"]);

const createSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number(),
  targetDate: z.string().nullish(),
  metric: metricSchema.optional(),
  currentValue: z.number().nullish(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  targetAmount: z.number().optional(),
  targetDate: z.string().nullable().optional(),
  metric: metricSchema.optional(),
  currentValue: z.number().nullable().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const goals = await prisma.goal.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(goals);
  } catch (error) {
    return apiError("goals", "GET", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = createSchema.parse(await req.json());
    const goal = await prisma.goal.create({
      data: {
        name: body.name,
        targetAmount: body.targetAmount,
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
        metric: body.metric ?? "CUSTOM",
        currentValue: body.currentValue ?? null,
        notes: body.notes || "",
        userId: user.id,
      },
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    return apiError("goals", "POST", error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = updateSchema.parse(await req.json());
    const existing = await prisma.goal.findFirst({ where: { id: body.id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.targetAmount !== undefined) data.targetAmount = body.targetAmount;
    if (body.targetDate !== undefined) data.targetDate = body.targetDate ? new Date(body.targetDate) : null;
    if (body.metric !== undefined) data.metric = body.metric;
    if (body.currentValue !== undefined) data.currentValue = body.currentValue;
    if (body.notes !== undefined) data.notes = body.notes;

    const goal = await prisma.goal.update({ where: { id: body.id }, data });
    return NextResponse.json(goal);
  } catch (error) {
    return apiError("goals", "PUT", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const result = await prisma.goal.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError("goals", "DELETE", error);
  }
}
