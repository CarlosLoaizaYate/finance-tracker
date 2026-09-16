import { readFile } from "fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("Set DATABASE_URL env var before running."); process.exit(1); }

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const parsed = JSON.parse(await readFile("/tmp/mortgage-payments-parsed.json", "utf8"));
const mortgage = await prisma.mortgage.findFirst({ where: { entity: "Davivienda" } });
if (!mortgage) { console.error("Mortgage not found"); process.exit(1); }

const dbPayments = await prisma.mortgagePayment.findMany({ where: { mortgageId: mortgage.id } });
const byDate = new Map(dbPayments.map(p => [p.date.toISOString().slice(0, 10), p]));

let updated = 0, skippedNoMatch = 0, skippedNoPrevious = 0, skippedRealBalanceMismatch = 0;
for (const s of parsed) {
  const row = byDate.get(s.date);
  if (!row) { skippedNoMatch++; continue; }
  const pdfRealBalance = Math.round(s.balanceAtClose);
  if (row.realBalance !== pdfRealBalance) { skippedRealBalanceMismatch++; continue; }
  if (s.previousBalance == null) { skippedNoPrevious++; continue; }
  await prisma.mortgagePayment.update({
    where: { id: row.id },
    data: {
      previousBalance: Math.round(s.previousBalance),
      previousBalanceDate: new Date(s.previousDate),
    },
  });
  updated++;
}

console.log(`Updated: ${updated}`);
console.log(`Skipped (no matching DB row): ${skippedNoMatch}`);
console.log(`Skipped (no "Saldo Anterior" on statement): ${skippedNoPrevious}`);
console.log(`Skipped (realBalance mismatch, needs review): ${skippedRealBalanceMismatch}`);

await prisma.$disconnect();
