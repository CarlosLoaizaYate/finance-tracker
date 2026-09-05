import { readFile, readdir, writeFile } from "fs/promises";
import { PDFParse } from "pdf-parse";

const DIR = "/tmp/davivienda-decrypted";

const MONTHS = {
  Ene: 1, Feb: 2, Mar: 3, Abr: 4, May: 5, Jun: 6,
  Jul: 7, Ago: 8, Sep: 9, Oct: 10, Nov: 11, Dic: 12,
};

function parseFechaCompact(day, mon3, year) {
  const m = MONTHS[mon3];
  return `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function money(s) {
  return Number(s.replace(/,/g, ""));
}

function parseFecha(mon, day, year) {
  const m = MONTHS[mon];
  return `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function extractText(file) {
  const buf = await readFile(file);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

function parseStatement(text, filename) {
  if (!text.includes("Extracto Crédito Hipotecario") || !text.includes("Comportamiento de su Crédito en el Periodo Anterior")) {
    return { skipped: true, reason: "not a monthly extracto", filename };
  }

  const principalPaidM = text.match(/^Abonos a Capital \$([\d,]+\.\d+)/m);
  const interestPaidM = text.match(/^Intereses Corrientes \$([\d,]+\.\d+)/m);
  const interestCoveredM = text.match(/^Int\. Cte Cobertura \$([\d,]+\.\d+)/m);
  const insurancePaidM = text.match(/\+\s*Seguros:\s*\$([\d,]+\.\d+)/);
  const closingM = text.match(/Saldo a la Fecha de Corte:\s*(\w+)\.\s*(\d+)\/(\d+)\s+\$([\d,]+\.\d+)/);
  const periodM = text.match(/de (\w+)\.\s*(\d+)\/(\d+)\s+a\s+(\w+)\.\s*(\d+)\/(\d+)/);
  const rateM = text.match(/Tasa\s+Interés\s+Cte\.\s+Pactada\s+([\d.]+)\s+Efectivo Anual/);
  const subsidizedRateM = text.match(/Tasa\s+Interés\s+Cte\.\s+Cobrada\s+([\d.]+)\s+Efectivo Anual/);
  const subsidyRateM = text.match(/Tasa\s+de\s+Cobertura\s+([\d.]+)\s+Efectivo Anual/);
  const cuotaNumM = text.match(/No\.\s*de\s*Cuota\s*que\s*se\s*Cancela\s+(\d+)/);
  const hasExtraordinario = /ABONO EXTRAORDI/.test(text);
  const transferM = text.match(/(\d{2})([A-Za-z]{3})(\d{4}) \$[\d,.]+ \d+ (TRANSFERENCIA|ABONO EXTRAORDI)/);
  const transferDate = transferM ? parseFechaCompact(transferM[1], transferM[2], transferM[3]) : null;

  if (!principalPaidM || !interestPaidM || !closingM || !periodM) {
    return { skipped: true, reason: "missing required fields", filename, has: {
      principal: !!principalPaidM, interest: !!interestPaidM, closing: !!closingM, period: !!periodM,
    } };
  }

  const closingDate = parseFecha(closingM[1], closingM[2], closingM[3]);
  const periodStart = parseFecha(periodM[1], periodM[2], periodM[3]);
  const periodEnd = parseFecha(periodM[4], periodM[5], periodM[6]);
  const date = transferDate || closingDate;

  return {
    skipped: false,
    filename,
    date,
    closingDate,
    periodStart,
    periodEnd,
    principalPaid: Math.round(money(principalPaidM[1])),
    interestPaid: Math.round(money(interestPaidM[1])),
    interestCovered: interestCoveredM ? Math.round(money(interestCoveredM[1])) : 0,
    insurancePaid: insurancePaidM ? Math.round(money(insurancePaidM[1])) : 0,
    balanceAtClose: money(closingM[4]),
    interestRate: rateM ? Number(rateM[1]) : null,
    subsidizedRate: subsidizedRateM ? Number(subsidizedRateM[1]) : null,
    subsidyRate: subsidyRateM ? Number(subsidyRateM[1]) : null,
    cuotaNum: cuotaNumM ? Number(cuotaNumM[1]) : null,
    hasExtraordinario,
    notes: hasExtraordinario ? "Incluye abono extraordinario" : "",
  };
}

async function main() {
  const files = (await readdir(DIR)).filter(f => f.endsWith(".pdf"));
  const results = [];
  const skipped = [];

  for (const f of files) {
    try {
      const text = await extractText(`${DIR}/${f}`);
      const parsed = parseStatement(text, f);
      if (parsed.skipped) skipped.push(parsed);
      else results.push(parsed);
    } catch (e) {
      skipped.push({ skipped: true, reason: String(e), filename: f });
    }
  }

  // Dedupe by periodEnd date (keep first occurrence)
  const byDate = new Map();
  const dupes = [];
  for (const r of results) {
    if (byDate.has(r.date)) {
      dupes.push(r);
    } else {
      byDate.set(r.date, r);
    }
  }
  const deduped = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  console.log(`Total files: ${files.length}`);
  console.log(`Parsed OK: ${results.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log(`Deduped (unique dates): ${deduped.length}`);
  console.log(`Duplicate dates dropped: ${dupes.length}`);
  console.log("\n--- Skipped files ---");
  for (const s of skipped) console.log(`  ${s.filename}: ${s.reason}`);
  console.log("\n--- Duplicate dates dropped ---");
  for (const d of dupes) console.log(`  ${d.filename} (date ${d.date})`);

  await writeFile("/tmp/mortgage-payments-parsed.json", JSON.stringify(deduped, null, 2));
  console.log("\nWrote /tmp/mortgage-payments-parsed.json");

  // Quick summary stats
  const totalPrincipal = deduped.reduce((s, p) => s + p.principalPaid, 0);
  const totalInterest = deduped.reduce((s, p) => s + p.interestPaid, 0);
  const totalCovered = deduped.reduce((s, p) => s + p.interestCovered, 0);
  console.log(`\nDate range: ${deduped[0]?.date} -> ${deduped[deduped.length - 1]?.date}`);
  console.log(`Total principal paid: ${totalPrincipal.toLocaleString()}`);
  console.log(`Total interest paid: ${totalInterest.toLocaleString()}`);
  console.log(`Total interest covered (benefit): ${totalCovered.toLocaleString()}`);
}

main();
