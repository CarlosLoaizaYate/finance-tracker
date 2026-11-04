import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const updateSchema = z.object({
  sellCommission: z.number().optional(),
  commissionRate: z.number().optional(),
  btcTargetGrowthPct: z.number().nullable().optional(),
  solTargetGrowthPct: z.number().nullable().optional(),
});

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    return NextResponse.json({
      sellCommission: user.cryptoSellCommission,
      commissionRate: user.cryptoCommissionRate,
      btcTargetGrowthPct: user.btcTargetGrowthPct,
      solTargetGrowthPct: user.solTargetGrowthPct,
    });
  } catch (error) {
    return apiError("crypto-settings", "GET", error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = updateSchema.parse(await req.json());
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.sellCommission !== undefined && { cryptoSellCommission: body.sellCommission }),
        ...(body.commissionRate !== undefined && { cryptoCommissionRate: body.commissionRate }),
        ...(body.btcTargetGrowthPct !== undefined && { btcTargetGrowthPct: body.btcTargetGrowthPct }),
        ...(body.solTargetGrowthPct !== undefined && { solTargetGrowthPct: body.solTargetGrowthPct }),
      },
    });

    return NextResponse.json({
      sellCommission: updated.cryptoSellCommission,
      commissionRate: updated.cryptoCommissionRate,
      btcTargetGrowthPct: updated.btcTargetGrowthPct,
      solTargetGrowthPct: updated.solTargetGrowthPct,
    });
  } catch (error) {
    return apiError("crypto-settings", "PUT", error);
  }
}
