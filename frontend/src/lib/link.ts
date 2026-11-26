// Reads only the text of a web address. Nothing is opened or fetched, and no result ever means "safe".
const SHORT = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "ow.ly", "buff.ly", "shorturl.at", "t.ly", "tiny.cc", "rebrand.ly"];
const NAMES = /(sbi|hdfc|icici|axis|kotak|paytm|phonepe|gpay|bhim|npci|upi|rbi|uidai|aadhaar|aadhar|incometax|customs|police|cbi|cyber|gov|kyc|fedex|dhl|bluedart|indiapost|electricity)/;
export type LinkReport = { host: string; flags: string[]; gov: boolean };
export function inspectLink(input: string): LinkReport | null {
  const raw = input.trim().replace(/[.,;:!?)\]]+$/, "");
  if (!raw || /\s/.test(raw)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") return null;
  let u: URL;
  try { u = new URL(scheme ? raw : `https://${raw}`); } catch { return null; }
  const host = u.hostname.replace(/\.$/, "");
  const ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
  if (!ip && !/\.[a-z0-9-]{2,}$/.test(host)) return null;
  const gov = /(^|\.)(gov|nic)\.in$/.test(host);
  const typed = raw.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0]!;
  const flags: string[] = [];
  const labels = host.replace(/^www\./, "").split(".");
  if (u.username || u.password) flags.push("lkAt");
  if (ip) flags.push("lkIp");
  if (host.split(".").some((l) => l.startsWith("xn--")) || /[^\x00-\x7f]/.test(typed)) flags.push("lkLook");
  if (SHORT.some((s) => host === s || host === `www.${s}`)) flags.push("lkShort");
  if (/\.apk($|[?#])/i.test(u.pathname + u.search)) flags.push("lkApk");
  if (!gov && !ip && NAMES.test(host)) flags.push("lkName");
  if (!gov && !ip && (labels.length >= 4 || (host.match(/-/g)?.length ?? 0) >= 3 || host.length > 40)) flags.push("lkSub");
  if (scheme === "http") flags.push("lkHttp");
  return { host, flags, gov };
}
