import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const investmentTypes = await prisma.investmentType.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(investmentTypes);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  try {
    const investmentType = await prisma.investmentType.create({
      data: {
        name: body.name,
        userId: user.id,
      },
    });
    return NextResponse.json(investmentType);
  } catch (error: any) {
    if (error.code === 'P2002') {
       return NextResponse.json({ error: "Investment type already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Prevent deleting if there are active investments tied to this type
  const dependentInvestments = await prisma.investment.count({
    where: { typeId: id, active: true }
  });

  if (dependentInvestments > 0) {
    return NextResponse.json(
      { error: "Cannot delete type because there are active investments using it." },
      { status: 400 }
    );
  }

  await prisma.investmentType.delete({
    where: { id },
  });
  
  return NextResponse.json({ ok: true });
}
