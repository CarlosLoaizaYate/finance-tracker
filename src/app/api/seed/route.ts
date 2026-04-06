import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const CATS_SEED = [
  { name: "streaming", color: "#ec4899" },
  { name: "telefonia", color: "#3b82f6" },
  { name: "vivienda",  color: "#6366f1" },
  { name: "credito",   color: "#ef4444" },
  { name: "salud",     color: "#10b981" },
  { name: "seguros",   color: "#f97316" },
  { name: "salidas",   color: "#f59e0b" },
];

const ITEMS_SEED = [
  { name: "Netflix",              cat: "streaming", budget: 40000,   recurring: true,  defaultDay: 1  },
  { name: "Spotify",              cat: "streaming", budget: 30000,   recurring: true,  defaultDay: 1  },
  { name: "Crunchyroll",          cat: "streaming", budget: 20000,   recurring: true,  defaultDay: 1  },
  { name: "Claro 1",              cat: "telefonia", budget: 55000,   recurring: true,  defaultDay: 5  },
  { name: "Movistar",             cat: "telefonia", budget: 150000,  recurring: true,  defaultDay: 5  },
  { name: "Apartamento",          cat: "vivienda",  budget: 770000,  recurring: false, defaultDay: 1  },
  { name: "Administración",       cat: "vivienda",  budget: 200000,  recurring: true,  defaultDay: 1  },
  { name: "Crédito Hipotecario",  cat: "vivienda",  budget: 1200000, recurring: true,  defaultDay: 5  },
  { name: "TC Nu",                cat: "credito",   budget: 1000000, recurring: true,  defaultDay: 15 },
  { name: "Seguro Moto",          cat: "seguros",   budget: 100000,  recurring: false, defaultDay: 1  },
  { name: "Compensar",            cat: "salud",     budget: 600000,  recurring: false, defaultDay: 1  },
  { name: "Salidas / Comidas",    cat: "salidas",   budget: 500000,  recurring: false, defaultDay: 1  },
];

const INV_SEED = [
  { name: "Nubank Bolsillos",           type: "Ahorro Digital",     color: "#7c3aed", invested: 1000000 },
  { name: "Trii – Acciones GEB",        type: "Renta Variable",     color: "#d97706", invested: 387810 },
  { name: "Accicuenta Mayor Riesgo",    type: "Fondo Mayor Riesgo", color: "#dc2626", invested: 600000 },
  { name: "Acciones Dinámico",          type: "Fondo Dinámico",     color: "#059669", invested: 600000 },
  { name: "Estructurado Potencial USA", type: "Moderado",           color: "#2563eb", invested: 1000000 },
];

const SNAP_SEED = [
  { inv: "Nubank Bolsillos",           month: 2, value: 1028257, contrib: 0 },
  { inv: "Trii – Acciones GEB",        month: 2, value: 387810,  contrib: 0 },
  { inv: "Accicuenta Mayor Riesgo",    month: 2, value: 644000,  contrib: 0 },
  { inv: "Acciones Dinámico",          month: 2, value: 585000,  contrib: 0 },
  { inv: "Estructurado Potencial USA", month: 2, value: 1000000, contrib: 0 },
];

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Create categories
  const catMap: Record<string, string> = {};
  for (const c of CATS_SEED) {
    const cat = await prisma.category.upsert({
      where: { name_userId: { name: c.name, userId: user.id } },
      update: { color: c.color },
      create: { name: c.name, color: c.color, userId: user.id },
    });
    catMap[c.name] = cat.id;
  }

  // Upsert expense items (updates recurring flag on existing items)
  for (const item of ITEMS_SEED) {
    const existing = await prisma.expenseItem.findFirst({
      where: { name: item.name, userId: user.id },
    });
    if (existing) {
      await prisma.expenseItem.update({
        where: { id: existing.id },
        data: { recurring: item.recurring, monthlyBudget: item.budget, defaultDay: item.defaultDay },
      });
    } else {
      await prisma.expenseItem.create({
        data: {
          name: item.name,
          monthlyBudget: item.budget,
          defaultDay: item.defaultDay,
          recurring: item.recurring,
          categoryId: catMap[item.cat],
          userId: user.id,
        },
      });
    }
  }

  // Create investments
  const invMap: Record<string, string> = {};
  for (const inv of INV_SEED) {
    const existing = await prisma.investment.findFirst({
      where: { name: inv.name, userId: user.id },
    });
    if (existing) {
      invMap[inv.name] = existing.id;
    } else {
      let invType = await prisma.investmentType.findUnique({
        where: { name_userId: { name: inv.type, userId: user.id } }
      });
      if (!invType) {
        invType = await prisma.investmentType.create({
          data: { name: inv.type, userId: user.id }
        });
      }

      const created = await prisma.investment.create({
        data: {
          name: inv.name,
          typeId: invType.id,
          color: inv.color,
          investedCapital: inv.invested,
          userId: user.id,
        },
      });
      invMap[inv.name] = created.id;
    }
  }

  // Create initial snapshots (March = month 2)
  for (const snap of SNAP_SEED) {
    const investmentId = invMap[snap.inv];
    if (investmentId) {
      await prisma.investmentSnapshot.upsert({
        where: {
          investmentId_month_year: {
            investmentId,
            month: snap.month,
            year: 2025,
          },
        },
        update: { currentValue: snap.value, contribution: snap.contrib },
        create: {
          investmentId,
          month: snap.month,
          year: 2025,
          currentValue: snap.value,
          contribution: snap.contrib,
          userId: user.id,
        },
      });
    }
  }

  return NextResponse.json({ ok: true, message: "Seed complete" });
}
