// 1930 call script in the user's language, built only from confirmed facts at one revision.
// Who you are -> what happened -> each payment (time, amount, reference, receiver, your bank) -> suspects.
// No automatic loss total; a payment is called completed only when direction and status were confirmed.
import { type Lang, raw } from "../i18n";
import { type Facts, isCompletedOutgoing } from "../case/model";
import { formatIst, formatPaise, spaceDigits } from "../lib/format";

/** One payment's confirmed details, already formatted. Empty means not confirmed, and is left unsaid. */
interface PaymentParts {
  when: string;
  amount: string;
  ref: string;
  vpa: string;
  bank: string;
  direction: string;
}

interface ScriptText {
  locale: string;
  intro: string;
  general: string;
  name: (name: string) => string;
  phone: (phone: string) => string;
  count: (n: number) => string;
  payment: (i: number, p: PaymentParts) => string;
  unsure: string;
  /** A confirmed failed, reversed or pending status, said plainly instead of "not sure". */
  status: Partial<Record<"failed" | "reversed" | "pending", string>>;
  suspects: (list: string) => string;
  ack: (n: string) => string;
  close: string;
}

const sentences = (...parts: (string | false)[]) => parts.filter(Boolean).join(" ");

const TEXT: Record<"en" | "hi" | "ta", ScriptText> = {
  en: {
    locale: "en-IN",
    intro: "Hello, I want to report a suspected cyber financial fraud.",
    general: "I do not have all the payment details yet. I will share what I know.",
    name: (name) => `My name is ${name}.`,
    phone: (phone) => `My mobile number is ${phone}.`,
    count: (n) => `There ${n === 1 ? "is 1 payment" : `are ${n} payments`} to report.`,
    payment: (i, p) => {
      const head = [p.when, p.amount && `amount ${p.amount}`].filter(Boolean).join(", ");
      return sentences(
        head ? `Payment ${i}: ${head}.` : `Payment ${i}.`,
        p.direction === "incoming" && "This was money received, not sent.",
        p.ref && `Reference number ${p.ref}.`,
        p.vpa && (p.direction === "outgoing" ? `Sent to UPI ID ${p.vpa}.` : p.direction === "incoming" ? `Received at UPI ID ${p.vpa}.` : `Receiving UPI ID ${p.vpa}.`),
        p.bank && (p.direction === "outgoing" ? `From my ${p.bank} account.` : p.direction === "incoming" ? `Into my ${p.bank} account.` : `My bank is ${p.bank}.`),
      );
    },
    unsure: "I am not sure this payment went through.",
    status: {
      failed: "My app shows this payment as failed.",
      reversed: "My app shows this payment as reversed.",
      pending: "My app shows this payment as pending.",
    },
    suspects: (list) => `The suspected fraudster contacted me from: ${list}.`,
    ack: (n) => `My earlier acknowledgement number is ${n}.`,
    close: "Please register my complaint and send me the acknowledgement number.",
  },
  hi: {
    locale: "hi-IN",
    intro: "नमस्ते, मुझे साइबर वित्तीय ठगी की शिकायत दर्ज करानी है।",
    general: "मेरे पास अभी पेमेंट की पूरी जानकारी नहीं है। जो पता है, वह बताऊँगा।",
    name: (name) => `मेरा नाम ${name} है।`,
    phone: (phone) => `मेरा मोबाइल नंबर ${phone} है।`,
    count: (n) => `${n} पेमेंट की शिकायत करनी है।`,
    payment: (i, p) => {
      const head = [p.when, p.amount && `राशि ${p.amount}`].filter(Boolean).join(", ");
      return sentences(
        head ? `पेमेंट ${i}: ${head}।` : `पेमेंट ${i}।`,
        p.direction === "incoming" && "यह पैसा मेरे पास आया था, मैंने भेजा नहीं था।",
        p.ref && `रेफरेंस नंबर ${p.ref}।`,
        p.vpa && (p.direction === "outgoing" ? `UPI ID ${p.vpa} पर भेजा।` : p.direction === "incoming" ? `UPI ID ${p.vpa} पर मिला।` : `पाने वाली UPI ID ${p.vpa}।`),
        p.bank && (p.direction === "outgoing" ? `मेरे ${p.bank} खाते से।` : p.direction === "incoming" ? `मेरे ${p.bank} खाते में।` : `मेरा बैंक ${p.bank} है।`),
      );
    },
    unsure: "मुझे पक्का नहीं पता कि यह पेमेंट पूरा हुआ या नहीं।",
    status: {
      failed: "मेरे ऐप में यह पेमेंट फेल दिख रहा है।",
      reversed: "मेरे ऐप में यह पेमेंट वापस (रिवर्स) हुआ दिख रहा है।",
      pending: "मेरे ऐप में यह पेमेंट पेंडिंग दिख रहा है।",
    },
    suspects: (list) => `संदिग्ध ठग ने इन नंबरों से संपर्क किया: ${list}।`,
    ack: (n) => `मेरा पिछला एक्नॉलेजमेंट नंबर ${n} है।`,
    close: "कृपया मेरी शिकायत दर्ज करें और मुझे एक्नॉलेजमेंट नंबर भेजें।",
  },
  ta: {
    locale: "ta-IN",
    intro: "வணக்கம், நான் ஒரு சைபர் நிதி மோசடியைப் புகார் செய்ய விரும்புகிறேன்.",
    general: "என்னிடம் இன்னும் முழு பணப்பரிமாற்ற விவரங்கள் இல்லை. தெரிந்ததைச் சொல்கிறேன்.",
    name: (name) => `என் பெயர் ${name}.`,
    phone: (phone) => `என் மொபைல் எண் ${phone}.`,
    count: (n) => `${n} பணப்பரிமாற்றத்தைப் புகார் செய்ய வேண்டும்.`,
    payment: (i, p) => {
      const head = [p.when, p.amount && `தொகை ${p.amount}`].filter(Boolean).join(", ");
      return sentences(
        head ? `பணப்பரிமாற்றம் ${i}: ${head}.` : `பணப்பரிமாற்றம் ${i}.`,
        p.direction === "incoming" && "இது எனக்கு வந்த பணம், நான் அனுப்பியது அல்ல.",
        p.ref && `குறிப்பு எண் ${p.ref}.`,
        p.vpa && (p.direction === "outgoing" ? `UPI ID ${p.vpa}-க்கு அனுப்பப்பட்டது.` : p.direction === "incoming" ? `UPI ID ${p.vpa}-இல் பெறப்பட்டது.` : `பெறுநர் UPI ID ${p.vpa}.`),
        p.bank && (p.direction === "outgoing" ? `என் ${p.bank} கணக்கிலிருந்து.` : p.direction === "incoming" ? `என் ${p.bank} கணக்கிற்கு.` : `என் வங்கி ${p.bank}.`),
      );
    },
    unsure: "இந்தப் பணம் உண்மையில் போனதா என்று எனக்கு உறுதியாகத் தெரியவில்லை.",
    status: {
      failed: "என் செயலியில் இந்தப் பணப்பரிமாற்றம் தோல்வியடைந்ததாகக் காட்டுகிறது.",
      reversed: "என் செயலியில் இந்தப் பணம் திரும்ப வந்ததாகக் காட்டுகிறது.",
      pending: "என் செயலியில் இந்தப் பணப்பரிமாற்றம் நிலுவையில் உள்ளதாகக் காட்டுகிறது.",
    },
    suspects: (list) => `சந்தேகிக்கப்படும் மோசடியாளர் இந்த எண்களிலிருந்து தொடர்புகொண்டார்: ${list}.`,
    ack: (n) => `என் முந்தைய ஒப்புகை எண் ${n}.`,
    close: "தயவுசெய்து என் புகாரைப் பதிவு செய்து, ஒப்புகை எண்ணை அனுப்புங்கள்.",
  },
};

/** The other languages keep their sentences in the language files (keys "sc.*", with {v} for the value). */
function fromTable(lang: Lang): ScriptText {
  const k = (n: string) => raw(lang, `sc.${n}`);
  const fill = (n: string, v: string | number) => k(n).replace("{v}", () => String(v));
  return {
    locale: `${lang}-IN-u-nu-latn`,
    intro: k("intro"),
    general: k("general"),
    name: (v) => fill("name", v),
    phone: (v) => fill("phone", v),
    count: (v) => fill("count", v),
    payment: (i, p) => {
      const head = [p.when, p.amount && fill("amount", p.amount)].filter(Boolean).join(", ");
      const way = p.direction === "outgoing" ? "Out" : p.direction === "incoming" ? "In" : "";
      return sentences(
        `${fill("pay", i)}${head ? `: ${head}` : ""}.`,
        p.direction === "incoming" && k("incoming"),
        !!p.ref && fill("ref", p.ref),
        !!p.vpa && fill(`vpa${way}`, p.vpa),
        !!p.bank && fill(`bank${way}`, p.bank),
      );
    },
    unsure: k("unsure"),
    status: { failed: k("failed") || undefined, reversed: k("reversed") || undefined, pending: k("pending") || undefined },
    suspects: (v) => fill("suspects", v),
    ack: (v) => fill("ack", v),
    close: k("close"),
  };
}

export function build1930Script(f: Facts, lang: Lang, suspects: string[]): string {
  const t = lang === "en" || lang === "hi" || lang === "ta" ? TEXT[lang] : fromTable(lang);
  const lines = [t.intro];
  const name = f.info.name.trim();
  const phone = f.info.phone.trim();
  if (name || phone) lines.push(sentences(!!name && t.name(name), !!phone && t.phone(phone)));
  // A payment row with nothing confirmed in it is not a payment to report.
  const txs = f.txs.filter((x) => x.amountPaise != null || x.occurredAt || x.upiRef || x.bankRef || x.receiverVpa || x.bankName.trim());
  if (!txs.length) lines.push(t.general);
  else lines.push(t.count(txs.length));
  txs.forEach((tx, i) => {
    // 24-hour time in Hindi/Tamil ("15:42 बजे" reads better aloud than "3:42 pm बजे").
    const { date, time } = formatIst(tx.occurredAt, t.locale, lang === "en");
    let line = t.payment(i + 1, {
      when: date ? `${date} ${time}` : "",
      amount: formatPaise(tx.amountPaise),
      ref: tx.upiRef ? spaceDigits(tx.upiRef) : tx.bankRef,
      vpa: tx.receiverVpa,
      bank: tx.bankName.trim(),
      direction: tx.direction,
    });
    const settled = tx.direction === "incoming" ? tx.paymentStatus === "completed" : isCompletedOutgoing(tx);
    const said = t.status[tx.paymentStatus as "failed" | "reversed" | "pending"];
    if (said) line += ` ${said}`;
    else if (!settled) line += ` ${t.unsure}`;
    lines.push(line);
  });
  if (suspects.length) lines.push(t.suspects(suspects.join(", ")));
  if (f.info.ack.trim()) lines.push(t.ack(f.info.ack.trim()));
  lines.push(t.close);
  return lines.join("\n\n");
}
