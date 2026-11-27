import { type StringKey, useT } from "../i18n";
import { type Actions, GROUPS, LABEL } from "../routes";
import { Contacts, Panel } from "../ui/bits";

export function Help() {
  const t = useT();
  const words = ["UPI ID", "UTR", "OTP"];
  return (
    <>
      <h1>{t("nHelp")}</h1>
      <div className="layout">
        <div>
          <Panel title={t("faqT")}>
            {[0, 1, 2, 3, 4].map((j) => (
              <details className="acc" key={j}>
                <summary>{t(`faq.${j}.q` as StringKey)}</summary>
                <p>{t(`faq.${j}.a` as StringKey)}</p>
              </details>
            ))}
          </Panel>
          <Panel title={t("words")}>
            <dl className="dl">
              {words.map((w, j) => (
                <div key={w}><dt>{w}</dt><dd>{t(`word.${j}` as StringKey)}</dd></div>
              ))}
            </dl>
          </Panel>
        </div>
        <aside><Contacts /></aside>
      </div>
    </>
  );
}

function Policy({ title, paragraphs }: { title: StringKey; paragraphs: StringKey[] }) {
  const t = useT();
  return (
    <>
      <h1>{t(title)}</h1>
      <Panel title={t("policies")}>
        <div className="pad prose">
          {paragraphs.map((p) => <p key={p}>{t(p)}</p>)}
        </div>
      </Panel>
    </>
  );
}

export const Privacy = () => <Policy title="pPrivacy" paragraphs={["checkLocalNote", "boloNote", "ghPrivacy", "trPrivacy", "aiPrivacy", "privView", "ticks"]} />;
export const Disclaimer = () => <Policy title="pDisc" paragraphs={["disc1", "disc2", "disc3"]} />;
export const Accessibility = () => <Policy title="pAcc" paragraphs={["acc1", "acc2"]} />;

export function Sitemap({ actions }: { actions: Actions }) {
  const t = useT();
  return (
    <>
      <h1>{t("sitemap")}</h1>
      <div className="smap">
        {GROUPS.map((g) => (
          <Panel key={g.key} title={t(g.key)}>
            <ul>
              {g.pages.map((p) => (
                <li key={p}><button type="button" onClick={() => (p === "paid" ? actions.openPaid() : actions.go(p))}>{t(LABEL[p])}</button></li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </>
  );
}
