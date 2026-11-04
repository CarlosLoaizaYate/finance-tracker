import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  color: z.string().optional(),
});

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const categories = await prisma.category.findMany({
      where: { userId: user.id },
      include: { items: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(categories);
  } catch (error) {
    return apiError("categories", "GET", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = createSchema.parse(await req.json());
    const category = await prisma.category.create({
      data: { name: body.name, color: body.color, userId: user.id },
    });
    return NextResponse.json(category);
  } catch (error) {
    return apiError("categories", "POST", error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = updateSchema.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (body.name  !== undefined) data.name  = body.name;
    if (body.color !== undefined) data.color = body.color;

    const category = await prisma.category.update({ where: { id: body.id, userId: user.id }, data });
    return NextResponse.json(category);
  } catch (error) {
    return apiError("categories", "PUT", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const category = await prisma.category.findFirst({ where: { id, userId: user.id }, include: { items: true } });
    if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (category.items.length > 0)
      return NextResponse.json({ error: "Cannot delete category with expense items" }, { status: 409 });

    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError("categories", "DELETE", error);
  }
}
