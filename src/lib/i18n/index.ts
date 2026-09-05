import { commonEn, commonEs } from "./common";
import { debtsEn, debtsEs } from "./debts";
import { cryptoEn, cryptoEs } from "./crypto";
import { expensesEn, expensesEs } from "./expenses";
import { fixedDepositsEn, fixedDepositsEs } from "./fixedDeposits";
import { fundsEn, fundsEs } from "./funds";
import { investmentsOverviewEn, investmentsOverviewEs } from "./investmentsOverview";
import { settingsEn, settingsEs } from "./settings";
import { stockTransactionsEn, stockTransactionsEs } from "./stockTransactions";
import { summaryEn, summaryEs } from "./summary";

export const translations = {
  en: {
    common: commonEn,
    debts: debtsEn,
    crypto: cryptoEn,
    expenses: expensesEn,
    fixedDeposits: fixedDepositsEn,
    funds: fundsEn,
    investmentsOverview: investmentsOverviewEn,
    settings: settingsEn,
    stockTransactions: stockTransactionsEn,
    summary: summaryEn,
  },
  es: {
    common: commonEs,
    debts: debtsEs,
    crypto: cryptoEs,
    expenses: expensesEs,
    fixedDeposits: fixedDepositsEs,
    funds: fundsEs,
    investmentsOverview: investmentsOverviewEs,
    settings: settingsEs,
    stockTransactions: stockTransactionsEs,
    summary: summaryEs,
  },
} as const;

export type TranslationDict = typeof translations.en;
