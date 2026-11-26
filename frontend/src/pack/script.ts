// 1930 call script in the user's language, built only from confirmed facts at one revision.
// Who you are -> what happened -> each payment (time, amount, reference, receiver, your bank) -> suspects.
// No automatic loss total; a payment is called completed only when direction and status were confirmed.
import type { Lang } from "../i18n";
import { type Facts, isCompletedOutgoing } from "../case/model";
import { formatIst, formatPaise, spaceDigits } from "../lib/format";

interface ScriptText {
  locale: string;
  unknown: string;
  intro: string;
  general: string;
  me: (name: string, phone: string) => string;
  count: (n: number) => string;
  payment: (i: number, when: string, amount: string, ref: string, vpa: string, bank: string) => string;
  unsure: string;
  suspects: (list: string) => string;
  ack: (n: string) => string;
  close: string;
}

const TEXT: Record<Lang, ScriptText> = {
  en: {
    locale: "en-IN",
    unknown: "not known",
    intro: "Hello, I want to report a suspected cyber financial fraud.",
    general: "I do not have all the payment details yet. I will share what I know.",
    me: (name, phone) => `My name is ${name}. My mobile number is ${phone}.`,
    count: (n) => `There ${n === 1 ? "is 1 payment" : `are ${n} payments`} to report.`,
    payment: (i, when, amount, ref, vpa, bank) =>
      `Payment ${i}: ${when}, amount ${amount}. Reference number ${ref}. Sent to UPI ID ${vpa}. From my ${bank} account.`,
    unsure: "I am not sure this payment went through.",
    suspects: (list) => `The fraudster contacted me from: ${list}.`,
    ack: (n) => `My earlier acknowledgement number is ${n}.`,
    close: "Please register my complaint and send me the acknowledgement number.",
  },
  hi: {
    locale: "hi-IN",
    unknown: "पता नहीं",
    intro: "नमस्ते, मुझे साइबर वित्तीय ठगी की शिकायत दर्ज करानी है।",
    general: "मेरे पास अभी पेमेंट की पूरी जानकारी नहीं है। जो पता है, वह बताऊँगा।",
    me: (name, phone) => `मेरा नाम ${name} है। मेरा मोबाइल नंबर ${phone} है।`,
    count: (n) => `${n} पेमेंट की शिकायत करनी है।`,
    payment: (i, when, amount, ref, vpa, bank) =>
      `पेमेंट ${i}: ${when}, राशि ${amount}। रेफरेंस नंबर ${ref}। UPI ID ${vpa} पर भेजा। मेरे ${bank} खाते से।`,
    unsure: "मुझे पक्का नहीं पता कि यह पेमेंट पूरा हुआ या नहीं।",
    suspects: (list) => `ठग ने इन नंबरों से संपर्क किया: ${list}।`,
    ack: (n) => `मेरा पिछला एक्नॉलेजमेंट नंबर ${n} है।`,
    close: "कृपया मेरी शिकायत दर्ज करें और मुझे एक्नॉलेजमेंट नंबर भेजें।",
  },
  ta: {
    locale: "ta-IN",
    unknown: "தெரியவில்லை",
    intro: "வணக்கம், நான் ஒரு சைபர் நிதி மோசடியைப் புகார் செய்ய விரும்புகிறேன்.",
    general: "என்னிடம் இன்னும் முழு பணப்பரிமாற்ற விவரங்கள் இல்லை. தெரிந்ததைச் சொல்கிறேன்.",
    me: (name, phone) => `என் பெயர் ${name}. என் மொபைல் எண் ${phone}.`,
    count: (n) => `${n} பணப்பரிமாற்றத்தைப் புகார் செய்ய வேண்டும்.`,
    payment: (i, when, amount, ref, vpa, bank) =>
      `பணப்பரிமாற்றம் ${i}: ${when}, தொகை ${amount}. குறிப்பு எண் ${ref}. UPI ID ${vpa}-க்கு அனுப்பப்பட்டது. என் ${bank} கணக்கிலிருந்து.`,
    unsure: "இந்தப் பணம் உண்மையில் போனதா என்று எனக்கு உறுதியாகத் தெரியவில்லை.",
    suspects: (list) => `மோசடியாளர் இந்த எண்களிலிருந்து தொடர்புகொண்டார்: ${list}.`,
    ack: (n) => `என் முந்தைய ஒப்புகை எண் ${n}.`,
    close: "தயவுசெய்து என் புகாரைப் பதிவு செய்து, ஒப்புகை எண்ணை அனுப்புங்கள்.",
  },
};

export function build1930Script(f: Facts, lang: Lang, suspects: string[]): string {
  const t = TEXT[lang];
  const or = (v: string) => v.trim() || t.unknown;
  const lines = [t.intro];
  if (f.info.name || f.info.phone) lines.push(t.me(or(f.info.name), or(f.info.phone)));
  if (!f.txs.length) lines.push(t.general);
  else lines.push(t.count(f.txs.length));
  f.txs.forEach((tx, i) => {
    // 24-hour time in Hindi/Tamil ("15:42 बजे" reads better aloud than "3:42 pm बजे").
    const { date, time } = formatIst(tx.occurredAt, t.locale, lang === "en");
    const when = date ? `${date} ${time}` : t.unknown;
    const ref = tx.upiRef ? spaceDigits(tx.upiRef) : tx.bankRef || t.unknown;
    let line = t.payment(i + 1, when, or(formatPaise(tx.amountPaise)), ref, or(tx.receiverVpa), or(tx.bankName));
    if (!isCompletedOutgoing(tx)) line += ` ${t.unsure}`;
    lines.push(line);
  });
  if (suspects.length) lines.push(t.suspects(suspects.join(", ")));
  if (f.info.ack.trim()) lines.push(t.ack(f.info.ack.trim()));
  lines.push(t.close);
  return lines.join("\n\n");
}
