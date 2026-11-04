import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const upsertSchema = z.object({
  day: z.number(),
  month: z.number(),
  year: z.number(),
  usdCopRate: z.number(),
  btcPriceUsd: z.number(),
  solPriceUsd: z.number().optional(),
  usdwBalance: z.number().nullable().optional(),
});

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const snapshots = await prisma.cryptoSnapshot.findMany({
      where: { userId: user.id },
      orderBy: [{ year: "asc" }, { month: "asc" }, { day: "asc" }],
    });
    return NextResponse.json(snapshots);
  } catch (error) {
    return apiError("crypto-snapshots", "GET", error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = upsertSchema.parse(await req.json());

    const snapshot = await prisma.cryptoSnapshot.upsert({
      where: {
        userId_day_month_year: {
          userId: user.id,
          day: body.day,
          month: body.month,
          year: body.year,
        },
      },
      update: { usdCopRate: body.usdCopRate, btcPriceUsd: body.btcPriceUsd, solPriceUsd: body.solPriceUsd ?? 0, usdwBalance: body.usdwBalance ?? null },
      create: {
        day: body.day,
        month: body.month,
        year: body.year,
        usdCopRate: body.usdCopRate,
        btcPriceUsd: body.btcPriceUsd,
        solPriceUsd: body.solPriceUsd ?? 0,
        usdwBalance: body.usdwBalance ?? null,
        userId: user.id,
      },
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return apiError("crypto-snapshots", "PUT", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const day = searchParams.get("day");
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    if (!day || !month || !year) return NextResponse.json({ error: "Missing params" }, { status: 400 });

    await prisma.cryptoSnapshot.deleteMany({
      where: { userId: user.id, day: Number(day), month: Number(month), year: Number(year) },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError("crypto-snapshots", "DELETE", error);
  }
}
