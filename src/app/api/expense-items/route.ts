import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const createSchema = z.object({
  name: z.string().min(1),
  monthlyBudget: z.number(),
  categoryId: z.string().min(1),
  isImportant: z.boolean().optional(),
  excludeFromTotal: z.boolean().optional(),
  defaultDay: z.number().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  monthlyBudget: z.number().optional(),
  categoryId: z.string().optional(),
  defaultDay: z.number().optional(),
  active: z.boolean().optional(),
  recurring: z.boolean().optional(),
  isImportant: z.boolean().optional(),
  excludeFromTotal: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const includeBudgetHistory = searchParams.has("includeBudgetHistory");

    const items = await prisma.expenseItem.findMany({
      where: { userId: user.id, active: true },
      include: {
        category: true,
        ...(includeBudgetHistory ? { budgetHistory: { orderBy: [{ effectiveYear: "asc" }, { effectiveMonth: "asc" }] } } : {}),
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(items);
  } catch (error) {
    return apiError("expense-items", "GET", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = createSchema.parse(await req.json());
    const item = await prisma.expenseItem.create({
      data: {
        name: body.name,
        monthlyBudget: body.monthlyBudget,
        categoryId: body.categoryId,
        isImportant: body.isImportant ?? false,
        excludeFromTotal: body.excludeFromTotal ?? false,
        defaultDay: body.defaultDay ?? 1,
        userId: user.id,
      },
      include: { category: true },
    });
    return NextResponse.json(item);
  } catch (error) {
    return apiError("expense-items", "POST", error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = updateSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (body.name          !== undefined) data.name          = body.name;
    if (body.monthlyBudget !== undefined) data.monthlyBudget = body.monthlyBudget;
    if (body.categoryId    !== undefined) data.categoryId    = body.categoryId;
    if (body.defaultDay    !== undefined) data.defaultDay    = body.defaultDay;
    if (body.active        !== undefined) data.active        = body.active;
    if (body.recurring     !== undefined) data.recurring     = body.recurring;
    if (body.isImportant   !== undefined) data.isImportant   = body.isImportant;
    if (body.excludeFromTotal !== undefined) data.excludeFromTotal = body.excludeFromTotal;

    const item = await prisma.expenseItem.update({ where: { id: body.id, userId: user.id }, data });
    return NextResponse.json(item);
  } catch (error) {
    return apiError("expense-items", "PUT", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Soft-delete: mark as inactive
    const result = await prisma.expenseItem.updateMany({
      where: { id, userId: user.id },
      data: { active: false },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError("expense-items", "DELETE", error);
  }
}
