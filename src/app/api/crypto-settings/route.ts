import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const updateSchema = z.object({
  sellCommission: z.number().optional(),
  commissionRate: z.number().optional(),
  usdwSellCommission: z.number().optional(),
  btcSellCommission: z.number().optional(),
  solSellCommission: z.number().optional(),
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
      usdwSellCommission: user.cryptoUsdwSellCommission,
      btcSellCommission: user.cryptoBtcSellCommission,
      solSellCommission: user.cryptoSolSellCommission,
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
        ...(body.usdwSellCommission !== undefined && { cryptoUsdwSellCommission: body.usdwSellCommission }),
        ...(body.btcSellCommission !== undefined && { cryptoBtcSellCommission: body.btcSellCommission }),
        ...(body.solSellCommission !== undefined && { cryptoSolSellCommission: body.solSellCommission }),
        ...(body.btcTargetGrowthPct !== undefined && { btcTargetGrowthPct: body.btcTargetGrowthPct }),
        ...(body.solTargetGrowthPct !== undefined && { solTargetGrowthPct: body.solTargetGrowthPct }),
      },
    });

    return NextResponse.json({
      sellCommission: updated.cryptoSellCommission,
      commissionRate: updated.cryptoCommissionRate,
      usdwSellCommission: updated.cryptoUsdwSellCommission,
      btcSellCommission: updated.cryptoBtcSellCommission,
      solSellCommission: updated.cryptoSolSellCommission,
      btcTargetGrowthPct: updated.btcTargetGrowthPct,
      solTargetGrowthPct: updated.solTargetGrowthPct,
    });
  } catch (error) {
    return apiError("crypto-settings", "PUT", error);
  }
}
