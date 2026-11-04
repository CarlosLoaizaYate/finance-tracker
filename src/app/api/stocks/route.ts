import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const createSchema = z.object({
  name: z.string().min(1),
  typeId: z.string().min(1),
  color: z.string().min(1),
  investedCapital: z.number().optional(),
  sellCommission: z.number().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  sellCommission: z.number().optional(),
});

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const stocks = await prisma.stock.findMany({
      where: { userId: user.id, active: true },
      include: { type: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(stocks);
  } catch (error) {
    return apiError("stocks", "GET", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = createSchema.parse(await req.json());
    const stock = await prisma.stock.create({
      data: {
        name: body.name,
        typeId: body.typeId,
        color: body.color,
        investedCapital: body.investedCapital ?? 0,
        sellCommission: body.sellCommission ?? 14875,
        userId: user.id,
      },
      include: { type: true },
    });
    return NextResponse.json(stock);
  } catch (error) {
    return apiError("stocks", "POST", error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = updateSchema.parse(await req.json());
    const existing = await prisma.stock.findFirst({ where: { id: body.id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const stock = await prisma.stock.update({
      where: { id: body.id },
      data: {
        ...(body.sellCommission !== undefined && { sellCommission: body.sellCommission }),
      },
      include: { type: true },
    });
    return NextResponse.json(stock);
  } catch (error) {
    return apiError("stocks", "PUT", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const result = await prisma.stock.updateMany({
      where: { id, userId: user.id },
      data: { active: false },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError("stocks", "DELETE", error);
  }
}
