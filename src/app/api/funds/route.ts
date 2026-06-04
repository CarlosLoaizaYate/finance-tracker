import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const funds = await prisma.fund.findMany({
      where: { userId: user.id },
      include: {
        snapshots: { orderBy: [{ year: "desc" }, { month: "desc" }] },
        type: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(funds);
  } catch (err) {
    console.error("[funds] GET:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, color, baseCapital, typeId, startDate } = await request.json();
    if (!name || !color || baseCapital == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const fund = await prisma.fund.create({
      data: {
        name, color, baseCapital: Math.round(baseCapital), userId: user.id,
        ...(typeId ? { typeId } : {}),
        ...(startDate ? { startDate: new Date(startDate) } : {}),
      },
      include: {
        snapshots: true,
        type: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(fund, { status: 201 });
  } catch (err) {
    console.error("[funds] POST:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const fund = await prisma.fund.findUnique({ where: { id } });
    if (!fund || fund.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.fund.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[funds] DELETE:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
