import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

interface StockPriceSnapshotRow {
  id: string;
  investmentId: string;
  month: number;
  year: number;
  pricePerShare: number;
  createdAt: Date;
  userId: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const investmentId = searchParams.get("investmentId");

    // Use raw SQL to bypass any Prisma model-layer issues
    const snapshots = investmentId
      ? await prisma.$queryRaw<StockPriceSnapshotRow[]>`
          SELECT * FROM "StockPriceSnapshot"
          WHERE "userId" = ${user.id} AND "investmentId" = ${investmentId}
          ORDER BY "year" DESC, "month" DESC`
      : await prisma.$queryRaw<StockPriceSnapshotRow[]>`
          SELECT * FROM "StockPriceSnapshot"
          WHERE "userId" = ${user.id}
          ORDER BY "year" DESC, "month" DESC`;

    return NextResponse.json(snapshots);
  } catch (err) {
    console.error("[stock-price-snapshots] GET:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { investmentId, month, year, pricePerShare } = body;

    if (!investmentId || !month || !year || pricePerShare == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const investment = await prisma.stock.findUnique({ where: { id: investmentId } });
    if (!investment || investment.userId !== user.id) {
      return NextResponse.json({ error: "Investment not found" }, { status: 404 });
    }

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "StockPriceSnapshot"
      WHERE "investmentId" = ${investmentId} AND "month" = ${month} AND "year" = ${year}
      LIMIT 1`;

    let snapshot: StockPriceSnapshotRow[];
    if (existing.length > 0) {
      snapshot = await prisma.$queryRaw<StockPriceSnapshotRow[]>`
        UPDATE "StockPriceSnapshot"
        SET "pricePerShare" = ${pricePerShare}
        WHERE "id" = ${existing[0].id}
        RETURNING *`;
    } else {
      snapshot = await prisma.$queryRaw<StockPriceSnapshotRow[]>`
        INSERT INTO "StockPriceSnapshot" ("id", "investmentId", "month", "year", "pricePerShare", "createdAt", "userId")
        VALUES (gen_random_uuid(), ${investmentId}, ${month}, ${year}, ${pricePerShare}, NOW(), ${user.id})
        RETURNING *`;
    }

    return NextResponse.json(snapshot[0], { status: 201 });
  } catch (err) {
    console.error("[stock-price-snapshots] POST:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const rows = await prisma.$queryRaw<{ userId: string }[]>`
      SELECT "userId" FROM "StockPriceSnapshot" WHERE "id" = ${id} LIMIT 1`;
    if (!rows.length || rows[0].userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.$executeRaw`DELETE FROM "StockPriceSnapshot" WHERE "id" = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[stock-price-snapshots] DELETE:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
