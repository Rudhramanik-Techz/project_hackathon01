// Plain bank dispute draft in English. No recipient is inferred: the family chooses the bank's address.
import { type Facts, isCompletedOutgoing } from "../case/model";
import { formatIst, formatPaise } from "../lib/format";

export interface BankEmail {
  subject: string;
  body: string;
  mailto: string;
}

export function buildBankEmail(f: Facts): BankEmail {
  const refs = f.txs.map((t) => t.upiRef || t.bankRef).filter(Boolean);
  const subject = `URGENT: Suspected fraudulent UPI payment${f.txs.length === 1 ? "" : "s"} - request to dispute and hold${
    refs.length ? ` - ref ${refs.join(", ")}` : ""
  }`;
  const rows = f.txs.map((t, i) => {
    const { date, time } = formatIst(t.occurredAt, "en-IN");
    return [
      `${i + 1}.`,
      formatPaise(t.amountPaise) || "amount not known",
      date ? `on ${date} at ${time}` : "",
      t.upiRef ? `UTR ${t.upiRef}` : t.bankRef ? `reference ${t.bankRef}` : "",
      t.receiverVpa ? `to UPI ID ${t.receiverVpa}` : "",
      isCompletedOutgoing(t) ? "" : "(status not confirmed)",
    ]
      .filter(Boolean)
      .join(" ");
  });
  const body = [
    "Dear Sir/Madam,",
    "",
    "I am reporting the following UPI payment(s) from my account, which I believe were made to a fraudster:",
    "",
    ...(rows.length ? rows : ["(payment details to be added)"]),
    "",
    f.info.ack.trim()
      ? `I have reported this on the national cyber crime helpline 1930 (acknowledgement number ${f.info.ack.trim()}).`
      : "I am reporting this on the national cyber crime helpline 1930 and on cybercrime.gov.in.",
    "",
    "Please raise a fraud dispute for these transactions, ask the beneficiary bank to hold the amount, and",
    "confirm the action taken with a complaint reference number.",
    "",
    "Regards,",
    f.info.name || "",
    f.info.phone || "",
  ].join("\n");
  return { subject, body, mailto: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}
