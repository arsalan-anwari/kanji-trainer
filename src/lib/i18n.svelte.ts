import { bundlesFromGlob, registerLocales, type Dict } from "kaizen-ui";

export const FALLBACK = "en";

export const locales = [
  { tag: "en", name: "English" },
  { tag: "zh-CN", name: "简体中文" },
  { tag: "zh-TW", name: "繁體中文" },
  { tag: "ko", name: "한국어" },
  { tag: "es", name: "Español" },
  { tag: "pt-BR", name: "Português (BR)" },
  { tag: "id", name: "Bahasa Indonesia" },
  { tag: "vi", name: "Tiếng Việt" },
  { tag: "th", name: "ไทย" },
  { tag: "fr", name: "Français" },
  { tag: "de", name: "Deutsch" },
  { tag: "nl", name: "Nederlands" },
  { tag: "tr", name: "Türkçe" },
  { tag: "ru", name: "Русский" },
  { tag: "ar", name: "العربية" },
  { tag: "fa", name: "فارسی" },
  { tag: "he", name: "עברית" }
] as const;

export type LocaleTag = (typeof locales)[number]["tag"];

const bundles = bundlesFromGlob(
  import.meta.glob<Dict>("./assets/local/*/*.json", { eager: true, import: "default" })
);

registerLocales({ bundles, locales: [...locales], fallback: FALLBACK });

export { i18n, n, resolveLocale, setLocale, t, type Params } from "kaizen-ui";

function keysOf(dict: Dict, prefix = ""): string[] {
  return Object.entries(dict).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : keysOf(value, `${prefix}${key}.`)
  );
}

function placeholdersOf(dict: Dict): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: Dict, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string") out.set(`${prefix}${key}`, [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(","));
      else walk(value, `${prefix}${key}.`);
    }
  };
  walk(dict, "");
  return out;
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  describe("the interface translations", () => {
    const english = bundles[FALLBACK] ?? {};

    test.each(locales.map((locale) => locale.tag))("%s has exactly the English keys", (tag) => {
      expect(keysOf(bundles[tag] ?? {}).sort()).toEqual(keysOf(english).sort());
    });

    test.each(locales.map((locale) => locale.tag))("%s keeps every placeholder of the English string", (tag) => {
      expect(Object.fromEntries(placeholdersOf(bundles[tag] ?? {}))).toEqual(
        Object.fromEntries(placeholdersOf(english))
      );
    });
  });
}
