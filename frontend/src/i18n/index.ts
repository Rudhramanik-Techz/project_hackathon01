import { createContext, useContext } from "react";
import bn from "./bn.json";
import en from "./en.json";
import hi from "./hi.json";
import kn from "./kn.json";
import ml from "./ml.json";
import mr from "./mr.json";
import ta from "./ta.json";
import te from "./te.json";

export type Lang = "en" | "hi" | "bn" | "mr" | "te" | "ta" | "kn" | "ml";
export type StringKey = keyof typeof en;

// Every language must define every English key; TypeScript fails the build otherwise.
const tables: Record<Lang, Record<StringKey, string>> = { en, hi, bn, mr, te, ta, kn, ml };

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "bn", label: "বাংলা" },
  { code: "mr", label: "मराठी" },
  { code: "te", label: "తెలుగు" },
  { code: "ta", label: "தமிழ்" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "ml", label: "മലയാളം" },
];

export function translate(lang: Lang, key: StringKey): string {
  return tables[lang][key] ?? tables.en[key];
}

/** For keys that only some language files carry (rule reasons "r.*", call script "sc.*"). */
export function raw(lang: Lang, key: string): string {
  return (tables[lang] as Record<string, string>)[key] ?? "";
}

/** Date and time wording for a language, always with 0-9 digits. */
export const dateLocale = (lang: Lang) => (lang === "en" ? "en-IN" : `${lang}-IN-u-nu-latn`);

export const LangContext = createContext<Lang>("en");

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang): Translate {
  return (key, vars) => {
    let s = translate(lang, key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

export function useT(): Translate {
  return makeT(useContext(LangContext));
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function isStringKey(key: string): key is StringKey {
  return key in en;
}

const STORAGE_KEY = "asli.lang";

export function loadLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const known = LANGS.find((l) => l.code === saved);
    if (known) return known.code;
  } catch {
    /* storage blocked (private mode): fall through */
  }
  return "en";
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}
