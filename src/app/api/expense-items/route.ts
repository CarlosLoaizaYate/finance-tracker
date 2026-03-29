import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.expenseItem.findMany({
    where: { userId: user.id, active: true },
    include: { category: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const item = await prisma.expenseItem.create({
    data: {
      name: body.name,
      monthlyBudget: body.monthlyBudget,
      categoryId: body.categoryId,
      userId: user.id,
    },
    include: { category: true },
  });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const item = await prisma.expenseItem.update({
    where: { id: body.id },
    data: { name: body.name, monthlyBudget: body.monthlyBudget, active: body.active },
  });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Soft-delete: mark as inactive
  await prisma.expenseItem.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({ ok: true });
}
