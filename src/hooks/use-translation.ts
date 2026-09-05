import { useLanguageStore } from "@/stores/language-store";
import { translations } from "@/lib/i18n";

function getPath(obj: unknown, path: string[]): unknown {
  let value: unknown = obj;
  for (const key of path) {
    if (value == null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function useTranslation() {
  const language = useLanguageStore(s => s.language);
  const setLanguage = useLanguageStore(s => s.setLanguage);

  function t(key: string, vars?: Record<string, string | number>): string {
    const value = getPath(translations[language], key.split("."));
    if (typeof value !== "string") return key;
    if (!vars) return value;
    return value.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ""));
  }

  return { t, language, setLanguage };
}
