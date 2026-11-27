// Copy fields for cybercrime.gov.in > Report Financial Fraud, in English (the portal's language).
// Only confirmed values; unknowns are left out, never copied as placeholders. No computed loss total.
// VERIFY the portal's current field names and order before Demo Day.
import { canBeHeld, type Facts, paymentNote } from "../case/model";
import { formatIst, formatPaise } from "../lib/format";

export interface NcrpField {
  label: string;
  value: string;
}

export interface NcrpCard {
  title: string;
  fields: NcrpField[];
}

const EXCERPT_BUDGET = 600; // keeps the portal description short; whole excerpts are kept, never cut mid-way

/** The chosen message excerpts, whole, in the order added. Any left out are said to be left out. */
function messageExcerpts(excerpts: string[]): string {
  const kept: string[] = [];
  let used = 0;
  for (const e of excerpts) {
    if (used + e.length > EXCERPT_BUDGET && kept.length) break;
    kept.push(e.length > EXCERPT_BUDGET ? `${e.slice(0, EXCERPT_BUDGET)}…` : e);
    used += e.length;
  }
  if (!kept.length) return "";
  const more = excerpts.length - kept.length;
  return `Messages received (numbers hidden): ${kept.map((e) => `"${e}"`).join(" ")}${more ? ` (${more} more kept in my records)` : ""}`;
}

export function buildDescription(f: Facts, suspects: string[], links: string[]): string {
  const first = f.txs.find((t) => t.occurredAt);
  const when = first ? formatIst(first.occurredAt, "en-IN") : null;
  const payments = f.txs.map((t, i) => {
    const ref = t.upiRef ? `(UTR ${t.upiRef})` : t.bankRef ? `(reference ${t.bankRef})` : "";
    const incoming = t.direction === "incoming";
    const details = [
      t.amountPaise != null ? `of ${formatPaise(t.amountPaise)}` : "",
      t.receiverVpa ? `${incoming ? "received at" : t.direction === "outgoing" ? "to" : "with receiving UPI ID"} ${t.receiverVpa}` : "",
      ref,
    ].filter(Boolean);
    if (!details.length) return "";
    const note = paymentNote(t);
    return [`Payment ${i + 1}`, ...details, note].filter(Boolean).join(" ") + ".";
  });
  const parts = [
    "I want to report a suspected UPI fraud.",
    when ? `The earliest payment listed here was on ${when.date} at ${when.time}.` : "",
    f.info.story.trim(),
    ...payments,
    suspects.length ? `The suspected fraudster contacted me from ${suspects.join(", ")}.` : "",
    links.length ? `Links or apps used: ${links.join(", ")}.` : "",
    messageExcerpts(f.excerpts),
    f.info.ack.trim() ? `Reported on 1930, acknowledgement number ${f.info.ack.trim()}.` : "",
    // Asked only when there is a confirmed payment the bank could trace.
    f.txs.some(canBeHeld) ? "I request that the beneficiary account be traced and the amount held, if possible." : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function buildNcrpCards(f: Facts, suspects: string[], links: string[]): NcrpCard[] {
  const cards: NcrpCard[] = [
    {
      title: "Incident",
      fields: [
        { label: "Category", value: "Online Financial Fraud" },
        { label: "Incident details (description)", value: buildDescription(f, suspects, links) },
      ],
    },
  ];
  f.txs.forEach((t, i) => {
    const { date, time } = formatIst(t.occurredAt, "en-IN");
    cards.push({
      title: `Transaction ${i + 1}`,
      fields: [
        { label: "Bank / Wallet", value: t.bankName },
        { label: "UTR / UPI reference", value: t.upiRef },
        { label: "Bank / app transaction ID", value: t.bankRef },
        { label: "Amount (₹)", value: t.amountPaise != null ? toRupeeString(t.amountPaise) : "" },
        { label: "Date", value: date },
        { label: "Time", value: time },
        { label: t.direction === "outgoing" ? "Suspect's UPI ID" : t.direction === "incoming" ? "Receiving UPI ID (mine)" : "Receiving UPI ID (direction not confirmed)", value: t.receiverVpa },
      ],
    });
  });
  cards.push({
    title: "Suspect",
    fields: [
      { label: "Suspect mobile numbers", value: suspects.join(", ") },
      { label: "Suspect UPI IDs", value: [...new Set(f.txs.filter((t) => t.direction === "outgoing").map((t) => t.receiverVpa).filter(Boolean))].join(", ") },
      { label: "Suspect URLs / apps", value: links.join(", ") },
    ],
  });
  cards.push({
    title: "You",
    fields: [
      { label: "Name", value: f.info.name },
      { label: "Mobile number", value: f.info.phone },
      { label: "1930 acknowledgement number", value: f.info.ack },
    ],
  });
  return cards.map((c) => ({ ...c, fields: c.fields.filter((x) => x.value.trim()) })).filter((c) => c.fields.length);
}

/** Exact decimal rupees for form fields: 100050 paise -> "1000.50". */
export function toRupeeString(paise: bigint): string {
  const r = paise % 100n;
  return `${paise / 100n}${r ? "." + r.toString().padStart(2, "0") : ""}`;
}
