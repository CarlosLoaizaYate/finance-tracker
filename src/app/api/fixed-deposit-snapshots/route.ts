import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const upsertSchema = z.object({
  depositId: z.string().min(1),
  day: z.number(),
  month: z.number(),
  year: z.number(),
  gain: z.number(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const depositId = searchParams.get("depositId");
    if (!depositId) return NextResponse.json({ error: "Missing depositId" }, { status: 400 });

    const snapshots = await prisma.fixedDepositSnapshot.findMany({
      where: { depositId, userId: user.id },
      orderBy: [{ year: "asc" }, { month: "asc" }, { day: "asc" }],
    });
    return NextResponse.json(snapshots);
  } catch (error) {
    return apiError("fixed-deposit-snapshots", "GET", error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = upsertSchema.parse(await req.json());

    // Verify deposit belongs to user
    const deposit = await prisma.fixedDeposit.findFirst({
      where: { id: body.depositId, userId: user.id },
    });
    if (!deposit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const snapshot = await prisma.fixedDepositSnapshot.upsert({
      where: {
        depositId_day_month_year: {
          depositId: body.depositId,
          day: body.day,
          month: body.month,
          year: body.year,
        },
      },
      update: { gain: body.gain },
      create: {
        depositId: body.depositId,
        day: body.day,
        month: body.month,
        year: body.year,
        gain: body.gain,
        userId: user.id,
      },
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return apiError("fixed-deposit-snapshots", "PUT", error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const depositId = searchParams.get("depositId");
    const day = searchParams.get("day");
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    if (!depositId || !day || !month || !year) return NextResponse.json({ error: "Missing params" }, { status: 400 });

    await prisma.fixedDepositSnapshot.deleteMany({
      where: { depositId, day: Number(day), month: Number(month), year: Number(year), userId: user.id },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError("fixed-deposit-snapshots", "DELETE", error);
  }
}
