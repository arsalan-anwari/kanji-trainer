import { bundlesFromGlob, registerLocales, type Dict } from "kaizen-ui";

export const FALLBACK = "en";

export const locales = [{ tag: "en", name: "English" }] as const;

export type LocaleTag = (typeof locales)[number]["tag"];

registerLocales({
  bundles: bundlesFromGlob(
    import.meta.glob<Dict>("./assets/local/*/*.json", { eager: true, import: "default" })
  ),
  locales: [...locales],
  fallback: FALLBACK
});

export { i18n, n, resolveLocale, setLocale, t, type Params } from "kaizen-ui";
