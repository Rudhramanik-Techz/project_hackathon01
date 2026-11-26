const inr = new Intl.NumberFormat("en-IN");

/** Exact rupee display from integer paise (no floating point). */
export function formatPaise(paise: bigint | null): string {
  if (paise == null) return "";
  const rupees = paise / 100n;
  const rest = paise % 100n;
  return `₹${inr.format(Number(rupees))}${rest ? "." + rest.toString().padStart(2, "0") : ""}`;
}

/** "012345678901" -> "0123 4567 8901": easier to read aloud. Copy always uses the ungrouped value. */
export function spaceDigits(value: string): string {
  return value.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO with +05:30 -> parts in IST, without inventing seconds the source did not have. */
export function formatIst(iso: string | null, locale: string, hour12 = true): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const opts = { timeZone: "Asia/Kolkata" } as const;
  const hasSeconds = /T\d{2}:\d{2}:\d{2}/.test(iso);
  return {
    date: d.toLocaleDateString(locale, { ...opts, day: "numeric", month: "long", year: "numeric" }),
    time: d.toLocaleTimeString(locale, { ...opts, hour: "numeric", minute: "2-digit", ...(hasSeconds ? { second: "2-digit" } : {}), hour12 }),
  };
}

/** Minutes between a confirmed payment time and "now" (a fixed scenario clock for synthetic demos). */
export function minutesSince(iso: string, now: number): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t > now + 5 * 60_000) return null; // future or broken clock: show no elapsed time
  return Math.floor((now - t) / 60_000);
}

export function splitList(value: string): string[] {
  return value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

export const nowLocalInput = () => {
  const d = new Date(Date.now() + 330 * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
