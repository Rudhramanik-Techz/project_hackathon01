// Plain bank dispute draft in English. No recipient is inferred: the family chooses the bank's address.
import { canBeHeld, type Facts, paymentNote } from "../case/model";
import { formatIst, formatPaise } from "../lib/format";

export interface BankEmail {
  subject: string;
  body: string;
  mailto: string;
}

export function buildBankEmail(f: Facts): BankEmail {
  const refs = f.txs.map((t) => t.upiRef || t.bankRef).filter(Boolean);
  const hold = f.txs.some(canBeHeld);
  const subject = `URGENT: Suspected UPI fraud - request to ${hold ? "dispute and hold" : "review"}${
    refs.length ? ` - ref ${refs.join(", ")}` : ""
  }`;
  const rows = f.txs.flatMap((t) => {
    const { date, time } = formatIst(t.occurredAt, "en-IN");
    const incoming = t.direction === "incoming";
    const details = [
      formatPaise(t.amountPaise),
      date ? `on ${date} at ${time}` : "",
      t.upiRef ? `UTR ${t.upiRef}` : t.bankRef ? `reference ${t.bankRef}` : "",
      t.receiverVpa ? `${incoming ? "received at" : t.direction === "outgoing" ? "to" : "receiving"} UPI ID ${t.receiverVpa}` : "",
    ].filter(Boolean);
    if (!details.length) return [];
    return [[...details, paymentNote(t)].filter(Boolean).join(" ")];
  }).map((row, i) => `${i + 1}. ${row}`);
  const body = [
    "Dear Sir/Madam,",
    "",
    "I am reporting the following UPI transaction(s) on my account, which I suspect are linked to fraud:",
    "",
    ...(rows.length ? rows : ["(no payment details confirmed yet)"]),
    "",
    f.info.ack.trim()
      ? `I have reported this on the national cyber crime helpline 1930 (acknowledgement number ${f.info.ack.trim()}).`
      : "I am reporting this on the national cyber crime helpline 1930 and on cybercrime.gov.in.",
    "",
    ...(hold
      ? [
          "Please raise a fraud dispute for these transactions, ask the beneficiary bank to hold the amount, and",
          "confirm the action taken with a complaint reference number.",
        ]
      : ["Please review this matter, tell me what to do next, and share a complaint reference number."]),
    "",
    "Regards,",
    f.info.name || "",
    f.info.phone || "",
  ].join("\n");
  return { subject, body, mailto: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}
