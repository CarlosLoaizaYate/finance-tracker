import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const logError = (step: string, error: unknown) => {
  console.error(`[stock-transactions] ${step}:`, error);
};

// DELETE /api/stock-transactions/:id
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

    const transaction = await prisma.stockTransaction.findUnique({ where: { id } });
    if (!transaction || transaction.userId !== user.id) {
      return NextResponse.json(
        { error: "Transaction not found or unauthorized" },
        { status: 404 }
      );
    }

    await prisma.stockTransaction.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("DELETE", error);
    return NextResponse.json(
      { error: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
