import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const logError = (step: string, error: unknown) => {
  console.error(`[stock-sales] ${step}:`, error);
};

// DELETE /api/stock-sales/:id
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

    const sale = await prisma.stockSale.findUnique({ where: { id } });
    if (!sale || sale.userId !== user.id) {
      return NextResponse.json(
        { error: "Sale not found or unauthorized" },
        { status: 404 }
      );
    }

    await prisma.stockSale.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("DELETE", error);
    return NextResponse.json(
      { error: "Failed to delete sale" },
      { status: 500 }
    );
  }
}
