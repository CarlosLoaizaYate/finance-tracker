import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const mortgage = await prisma.mortgage.findFirst({ where: { id, userId: user.id } });
  if (!mortgage) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.mortgage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
