import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { fundId, day, month, year } = body;
    const currentValue = Number(body.currentValue);
    const contribution = Number(body.contribution ?? 0);
    if (!fundId || !day || !month || !year || isNaN(currentValue)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    console.log("[fund-snapshots] POST received:", { currentValue: body.currentValue, parsed: currentValue, contribution: body.contribution, parsedContrib: contribution });

    const fund = await prisma.fund.findUnique({ where: { id: fundId } });
    if (!fund || fund.userId !== user.id) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const snapshot = await prisma.fundSnapshot.create({
      data: { fundId, day, month, year, currentValue: Math.round(currentValue), contribution: Math.round(contribution), userId: user.id },
    });

    return NextResponse.json(snapshot, { status: 201 });
  } catch (err) {
    console.error("[fund-snapshots] POST:", err);
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

    const snap = await prisma.fundSnapshot.findUnique({ where: { id } });
    if (!snap || snap.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.fundSnapshot.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[fund-snapshots] DELETE:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
