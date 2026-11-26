// Remembers where the visitor was, for this tab only, so a refresh does not lose their place.
// Only the choices listed in Place are ever written: never case details, pasted messages, links or names.
import { useCallback, useEffect, useState } from "react";

interface Place {
  page: string;
  y: number;
  draft: boolean; // true when a case had been typed (its contents are not stored)
  tab: "script" | "portal" | "bank" | "print";
  htab: "adv" | "how" | "down";
  slide: number;
  triage: number;
  search: string;
  quiz: { i: number; score: number; pick: boolean | null };
}

const KEY = "asli.place";

function read(): Partial<Place> {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    return v && typeof v === "object" ? (v as Partial<Place>) : {};
  } catch {
    return {};
  }
}

/** What was stored before this load, captured before anything is written again. */
export const before: Partial<Place> = read();
const place: Partial<Place> = { ...before };

export function savePlace(change: Partial<Place>): void {
  Object.assign(place, change);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(place));
  } catch {
    /* storage unavailable: a refresh starts at the top */
  }
}

/** State that survives page changes and refresh. `valid` rejects anything unexpected in storage. */
export function usePlace<K extends keyof Place>(key: K, initial: Place[K], valid: (v: unknown) => boolean) {
  const [value, setValue] = useState<Place[K]>(() => (place[key] !== undefined && valid(place[key]) ? (place[key] as Place[K]) : initial));
  const set = useCallback(
    (next: Place[K]) => {
      savePlace({ [key]: next });
      setValue(next);
    },
    [key],
  );
  return [value, set] as const;
}

const kept = new Map<string, unknown>();

/** State that survives page changes but is held in memory only, so a refresh clears it. */
export function useKept<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => (kept.has(key) ? (kept.get(key) as T) : initial));
  useEffect(() => {
    kept.set(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}
