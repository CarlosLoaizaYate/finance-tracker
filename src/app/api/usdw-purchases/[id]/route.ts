import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const logError = (step: string, error: unknown) => {
  console.error(`[usdw-purchases] ${step}:`, error);
};

// DELETE /api/usdw-purchases/:id
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const purchase = await prisma.usdwPurchase.findUnique({ where: { id } });
    if (!purchase || purchase.userId !== user.id) {
      return NextResponse.json({ error: "Purchase not found or unauthorized" }, { status: 404 });
    }

    await prisma.usdwPurchase.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("DELETE", error);
    return NextResponse.json({ error: "Failed to delete purchase" }, { status: 500 });
  }
}
