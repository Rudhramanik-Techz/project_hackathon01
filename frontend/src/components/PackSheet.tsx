// The one-page English report pack. The same markup is shown as a preview in the "Printable" tab and, while
// printing, as the only thing on the page (see printPack). Values come from buildSheet: confirmed facts only.
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DASH, type Sheet } from "../pack/sheet";

function Line({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{value || <span className="blank">&nbsp;</span>}</td>
    </tr>
  );
}

export function PackSheet({ sheet, synthetic, printedAt }: { sheet: Sheet; synthetic: boolean; printedAt: string }) {
  return (
    <article className="sheet" lang="en">
      {synthetic && <p className="sheet-demo">DEMO: SYNTHETIC DATA, NOT A REAL CASE</p>}
      <header>
        <h2>Cyber fraud report pack</h2>
        <p>
          Prepared by the person reporting, using Asli Ya Nakli (not a government service). This is not a filed
          complaint. Revision {sheet.rev} · printed {printedAt} IST.
        </p>
      </header>

      <section>
        <h3>Person reporting</h3>
        <table>
          <tbody>
            <Line label="Name" value={sheet.name} />
            <Line label="Mobile" value={sheet.phone} />
            <Line label="1930 acknowledgement no." value={sheet.ack} />
          </tbody>
        </table>
      </section>

      <section>
        <h3>Payments (confirmed details only)</h3>
        {sheet.rows.length ? (
          <table className="sheet-pay">
            <thead>
              <tr><th>#</th><th>Date and time (IST)</th><th>Amount</th><th>Reference</th><th>To UPI ID</th><th>My bank</th><th>Status</th></tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => (
                <tr key={r.n}>
                  <td>{r.n}</td><td>{r.when}</td><td>{r.amount}</td><td className="mono">{r.ref}</td><td>{r.to}</td><td>{r.bank}</td><td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No payment details confirmed yet.</p>
        )}
      </section>

      <section>
        <h3>Suspect contacts</h3>
        <table>
          <tbody>
            <Line label="Phone numbers" value={sheet.suspects.join(", ") || DASH} />
            <Line label="Links or apps" value={sheet.links.join(", ") || DASH} />
          </tbody>
        </table>
      </section>

      <section>
        <h3>What happened (text for cybercrime.gov.in)</h3>
        <p className="sheet-desc">{sheet.description}</p>
      </section>

      <div className="sheet-foot">
        <table>
          <tbody>
            <Line label="Received by (police station / bank)" value="" />
            <Line label="Name, signature and stamp" value="" />
            <Line label="Date" value="" />
          </tbody>
        </table>
        <p>National cyber crime helpline 1930 · cybercrime.gov.in</p>
      </div>
    </article>
  );
}

const PRINTING = "printing-pack";

/**
 * Prints only the pack sheet: it is rendered into <body> for the print, the rest of the page is hidden by
 * print CSS, and the document title becomes the suggested PDF file name. Everything is restored afterwards.
 */
export function usePrintPack(): { printing: boolean; print: (title: string) => void } {
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    if (title === null) return;
    const before = document.title;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(later);
      document.documentElement.classList.remove(PRINTING);
      document.title = before;
      window.removeEventListener("afterprint", afterPrint);
      setTitle(null);
    };
    // Android Chrome can report "afterprint" before its print preview has captured the page: wait a little.
    let later = 0;
    const afterPrint = () => {
      later = window.setTimeout(finish, 800);
    };
    document.title = title;
    document.documentElement.classList.add(PRINTING);
    window.addEventListener("afterprint", afterPrint);
    // Wait one frame so the sheet is in the page before the print window opens.
    const id = requestAnimationFrame(() => {
      try {
        window.print();
      } catch {
        finish();
      }
    });
    return () => {
      cancelAnimationFrame(id);
      finish();
    };
  }, [title]);
  return { printing: title !== null, print: (t) => setTitle(t) };
}

/** The sheet as the only printed content, while printing. */
export function PrintPortal({ children, active }: { children: ReactNode; active: boolean }) {
  return active ? createPortal(<div id="packsheet">{children}</div>, document.body) : null;
}
