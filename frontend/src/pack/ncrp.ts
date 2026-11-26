// Copy fields for cybercrime.gov.in > Report Financial Fraud, in English (the portal's language).
// Only confirmed values; unknowns are left out, never copied as placeholders. No computed loss total.
// VERIFY the portal's current field names and order before Demo Day.
import { type Facts, isCompletedOutgoing } from "../case/model";
import { formatIst, formatPaise } from "../lib/format";

export interface NcrpField {
  label: string;
  value: string;
}

export interface NcrpCard {
  title: string;
  fields: NcrpField[];
}

export function buildDescription(f: Facts, suspects: string[], links: string[]): string {
  const first = f.txs.find((t) => t.occurredAt);
  const when = first ? formatIst(first.occurredAt, "en-IN") : null;
  const parts = [
    when ? `On ${when.date} at ${when.time} I was defrauded through UPI.` : "I was defrauded through UPI.",
    f.info.story.trim(),
    ...f.txs.map((t, i) => {
      const bits = [
        `Payment ${i + 1}`,
        t.amountPaise != null ? `of ${formatPaise(t.amountPaise)}` : "",
        t.receiverVpa ? `to ${t.receiverVpa}` : "",
        t.upiRef ? `(UTR ${t.upiRef})` : t.bankRef ? `(reference ${t.bankRef})` : "",
        isCompletedOutgoing(t) ? "" : "(status not confirmed)",
      ];
      return bits.filter(Boolean).join(" ") + ".";
    }),
    suspects.length ? `The fraudster contacted me from ${suspects.join(", ")}.` : "",
    links.length ? `Links or apps used: ${links.join(", ")}.` : "",
    f.info.evidence.trim() ? `Message received (redacted): "${f.info.evidence.trim().slice(0, 600)}"` : "",
    f.info.ack.trim() ? `Reported on 1930, acknowledgement number ${f.info.ack.trim()}.` : "",
    "I request that the beneficiary accounts be frozen.",
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
        { label: "Fraudster's UPI ID", value: t.receiverVpa },
      ],
    });
  });
  cards.push({
    title: "Suspect",
    fields: [
      { label: "Suspect mobile numbers", value: suspects.join(", ") },
      { label: "Suspect UPI IDs", value: [...new Set(f.txs.map((t) => t.receiverVpa).filter(Boolean))].join(", ") },
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
