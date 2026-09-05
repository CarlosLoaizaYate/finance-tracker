import { readFile } from "fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Set DATABASE_URL env var before running.");
  process.exit(1);
}

const USER_EMAIL = "developeranalystman@gmail.com";

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) {
    console.error(`User with email ${USER_EMAIL} not found in this database. Aborting.`);
    process.exit(1);
  }
  const USER_ID = user.id;
  console.log(`Seeding mortgage for user ${user.id} (${user.email})`);

  const payments = JSON.parse(await readFile("/tmp/mortgage-payments-parsed.json", "utf8"));

  const existing = await prisma.mortgage.findFirst({
    where: { userId: USER_ID, entity: "Davivienda", principal: 77392365 },
  });
  if (existing) {
    console.error(`A Davivienda mortgage with principal 77,392,365 already exists (id ${existing.id}). Aborting to avoid duplicates.`);
    process.exit(1);
  }

  const mortgage = await prisma.mortgage.create({
    data: {
      name: "Crédito hipotecario",
      entity: "Davivienda",
      principal: 77392365,
      interestRate: 14.52,
      subsidizedRate: 12.00,
      subsidyRate: 4.00,
      subsidyEndDate: new Date("2026-11-15"),
      isUvrIndexed: false,
      termMonths: 180,
      startDate: new Date("2019-11-15"),
      notes: "No. crédito 570046210016790-1. Cobertura de tasa 'Mi Casa Ya' vigente primeros 7 años desde el desembolso.",
      userId: USER_ID,
    },
  });
  console.log(`Created mortgage ${mortgage.id}`);

  let count = 0;
  for (const p of payments) {
    await prisma.mortgagePayment.create({
      data: {
        mortgageId: mortgage.id,
        date: new Date(p.date),
        principalPaid: p.principalPaid,
        interestPaid: p.interestPaid,
        interestCovered: p.interestCovered,
        insurancePaid: p.insurancePaid,
        realBalance: p.balanceAtClose != null ? Math.round(p.balanceAtClose) : null,
        isExtra: false,
        notes: p.notes || `Período ${p.periodStart} → ${p.periodEnd}`,
        userId: USER_ID,
      },
    });
    count++;
  }
  console.log(`Created ${count} mortgage payments`);

  const totalPrincipalPaid = payments.reduce((s, p) => s + p.principalPaid, 0);
  console.log(`Outstanding balance (derived): ${(mortgage.principal - totalPrincipalPaid).toLocaleString()}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
