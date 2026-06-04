import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const CATS_SEED: { name: string; color: string; items: string[] }[] = [
  {
    name: "Alimentación",
    color: "#f97316",
    items: [
      "Supermercado / Despensa",
      "Mercado / Frutas y verduras",
      "Restaurantes y comida fuera",
      "Delivery / Apps de comida",
      "Cafetería / Snacks",
    ],
  },
  {
    name: "Vivienda",
    color: "#6366f1",
    items: [
      "Renta / Hipoteca",
      "Mantenimiento y reparaciones",
      "Muebles y electrodomésticos",
      "Artículos de limpieza",
      "Decoración del hogar",
    ],
  },
  {
    name: "Transporte",
    color: "#3b82f6",
    items: [
      "Gasolina / Combustible",
      "Transporte público Metro",
      "Transporte público Bus",
      "Didi",
      "Taxi",
      "Uber",
      "Estacionamiento / Casetas",
    ],
  },
  {
    name: "Salud",
    color: "#10b981",
    items: [
      "Consultas médicas",
      "Medicamentos",
      "Dentista",
      "Óptica / Lentes",
      "Laboratorios / Estudios",
      "Psicología / Terapia",
      "Gimnasio / Bienestar",
    ],
  },
  {
    name: "Educación",
    color: "#8b5cf6",
    items: [
      "Colegiaturas / Cursos",
      "Libros y material escolar",
      "Cursos en línea / Plataformas",
      "Talleres y capacitaciones",
    ],
  },
  {
    name: "Entretenimiento",
    color: "#f59e0b",
    items: [
      "Cine / Teatro / Conciertos",
      "Viajes y vacaciones",
      "Hobbies / Deportes",
      "Juegos / Videojuegos",
      "Parques / Atracciones",
    ],
  },
  {
    name: "Ropa y Cuidado Personal",
    color: "#ec4899",
    items: [
      "Ropa y calzado",
      "Peluquería / Barbería",
      "Cosméticos y cuidado personal",
      "Spa / Masajes",
    ],
  },
  {
    name: "Servicios y Utilities",
    color: "#06b6d4",
    items: [
      "Electricidad / Luz",
      "Agua",
      "Gas",
      "Internet Hogar",
      "Internet Móvil",
    ],
  },
  {
    name: "Seguros",
    color: "#ef4444",
    items: [
      "Seguro de vida",
      "Seguro de gastos médicos",
      "Seguro del hogar",
      "Seguro vehicular",
      "Seguro de viaje",
    ],
  },
  {
    name: "Streaming y Suscripciones",
    color: "#a855f7",
    items: [
      "Netflix",
      "Crunchyroll",
      "Spotify",
      "Software / Apps (Adobe, Office)",
    ],
  },
  {
    name: "Crédito y Deudas",
    color: "#dc2626",
    items: [
      "Pago mínimo tarjeta de crédito",
      "Abono a capital tarjeta",
      "Crédito hipotecario",
    ],
  },
  {
    name: "Inversión y Ahorro",
    color: "#059669",
    items: ["Trii", "CDT"],
  },
  {
    name: "Regalos y Donaciones",
    color: "#e879f9",
    items: [
      "Regalos familiares",
      "Regalos amigos / Social",
      "Donaciones / Caridad",
    ],
  },
  {
    name: "Salidas y Ocio",
    color: "#d97706",
    items: [
      "Bares / Antros",
      "Eventos sociales",
      "Cumpleaños / Celebraciones",
    ],
  },
  {
    name: "Misceláneos",
    color: "#64748b",
    items: [
      "Gastos inesperados / Emergencias",
      "Impuestos / Trámites",
      "Otros no clasificados",
    ],
  },
];

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Delete in dependency order: records → budgetHistory → items → categories
  await prisma.expenseRecord.deleteMany({ where: { userId: user.id } });
  await prisma.budgetHistory.deleteMany({ where: { userId: user.id } });
  await prisma.expenseItem.deleteMany({ where: { userId: user.id } });
  await prisma.category.deleteMany({ where: { userId: user.id } });

  // Create new categories and their items
  for (const cat of CATS_SEED) {
    const created = await prisma.category.create({
      data: {
        name: cat.name,
        color: cat.color,
        userId: user.id,
        items: {
          create: cat.items.map((itemName) => ({
            name: itemName,
            monthlyBudget: 0,
            userId: user.id,
          })),
        },
      },
    });
    void created;
  }

  return NextResponse.json({ ok: true, message: "Categorías cargadas correctamente" });
}
