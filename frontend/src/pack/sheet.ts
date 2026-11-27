// One-page printable report pack (English, for a police station or bank visit), built only from confirmed facts
// at one revision, like every other output. Unknown values print as a dash: never a guess or a placeholder.
import type { Facts, FactsTx } from "../case/model";
import { formatIst, formatPaise } from "../lib/format";
import { buildDescription } from "./ncrp";

export const DASH = "—";

export interface SheetRow {
  n: number;
  when: string;
  amount: string;
  ref: string;
  to: string;
  bank: string;
  status: string;
}

const STATUS: Record<string, string> = { completed: "completed", pending: "pending", failed: "failed", reversed: "reversed" };

function statusText(t: FactsTx): string {
  const dir = t.direction === "outgoing" ? "Sent" : t.direction === "incoming" ? "Received" : "";
  const st = STATUS[t.paymentStatus] ?? "";
  if (dir && st) return `${dir}, ${st}`;
  if (dir || st) return `${dir || "Direction not confirmed"}, ${st || "status not confirmed"}`;
  return "Not confirmed";
}

/** Payments that carry at least one confirmed detail, in report order. */
export function sheetRows(f: Facts): SheetRow[] {
  return f.txs
    .filter((x) => x.amountPaise != null || x.occurredAt || x.upiRef || x.bankRef || x.receiverVpa || x.bankName.trim())
    .map((x, i) => {
      const { date, time } = formatIst(x.occurredAt, "en-IN");
      return {
        n: i + 1,
        when: date ? `${date}, ${time}` : DASH,
        amount: x.amountPaise != null ? formatPaise(x.amountPaise) : DASH,
        ref: x.upiRef ? `UTR ${x.upiRef}` : x.bankRef ? `Ref ${x.bankRef}` : DASH,
        to: x.receiverVpa || DASH,
        bank: x.bankName.trim() || DASH,
        status: statusText(x),
      };
    });
}

export interface Sheet {
  rev: number;
  name: string;
  phone: string;
  ack: string;
  rows: SheetRow[];
  suspects: string[];
  links: string[];
  description: string;
}

export function buildSheet(f: Facts, suspects: string[], links: string[]): Sheet {
  return {
    rev: f.rev,
    name: f.info.name.trim(),
    phone: f.info.phone.trim(),
    ack: f.info.ack.trim(),
    rows: sheetRows(f),
    suspects,
    links,
    description: buildDescription(f, suspects, links),
  };
}

/** File name the browser suggests for "Save as PDF" (it uses the document title). */
export const sheetTitle = (rev: number, synthetic: boolean) => `${synthetic ? "DEMO-" : ""}Asli-Ya-Nakli-report-rev-${rev}`;
