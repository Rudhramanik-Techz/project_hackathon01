import { createContext, useContext } from "react";
import en from "./en.json";
import hi from "./hi.json";
import ta from "./ta.json";

export type Lang = "en" | "hi" | "ta";
export type StringKey = keyof typeof en;

// Hindi and Tamil must define every English key; TypeScript fails the build otherwise.
const tables: Record<Lang, Record<StringKey, string>> = { en, hi, ta };

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "hi", label: "हिं" },
  { code: "ta", label: "தமிழ்" },
];

export function translate(lang: Lang, key: StringKey): string {
  return tables[lang][key] ?? tables.en[key];
}

export const LangContext = createContext<Lang>("en");

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

export function useT(): Translate {
  const lang = useContext(LangContext);
  return (key, vars) => {
    let s = translate(lang, key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
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
    if (saved === "en" || saved === "hi" || saved === "ta") return saved;
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
