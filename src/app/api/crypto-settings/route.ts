import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    sellCommission: user.cryptoSellCommission,
    commissionRate: user.cryptoCommissionRate,
  });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(body.sellCommission !== undefined && { cryptoSellCommission: body.sellCommission }),
      ...(body.commissionRate !== undefined && { cryptoCommissionRate: body.commissionRate }),
    },
  });

  return NextResponse.json({
    sellCommission: updated.cryptoSellCommission,
    commissionRate: updated.cryptoCommissionRate,
  });
}
