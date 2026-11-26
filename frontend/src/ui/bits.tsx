import type { ReactNode } from "react";
import { useT } from "../i18n";

export function Panel({ title, extra, id, children }: { title: ReactNode; extra?: ReactNode; id?: string; children: ReactNode }) {
  return (
    <section className="panel" id={id}>
      <div className="ph">
        <h2>{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

export function Contacts() {
  const t = useT();
  return (
    <Panel title={t("contacts")}>
      <dl className="dl">
        <div>
          <dt>{t("cLost")}</dt>
          <dd><a href="tel:1930"><b>1930</b></a></dd>
        </div>
        <div>
          <dt>{t("cPortal")}</dt>
          <dd><Ext href="https://cybercrime.gov.in">cybercrime.gov.in</Ext></dd>
        </div>
        <div>
          <dt>{t("cChakshu")}</dt>
          <dd><Ext href="https://sancharsaathi.gov.in">sancharsaathi.gov.in</Ext></dd>
        </div>
        <div>
          <dt>{t("cBank")}</dt>
          <dd>{t("cBankV")}</dd>
        </div>
        <div>
          <dt>{t("cDanger")}</dt>
          <dd><a href="tel:112"><b>112</b></a></dd>
        </div>
      </dl>
    </Panel>
  );
}

export function NeverShare() {
  const t = useT();
  return (
    <Panel title={t("never")}>
      <ul className="never">
        {(["n1", "n2", "n3", "n4", "n5"] as const).map((k) => (
          <li key={k}>{t(k)}</li>
        ))}
      </ul>
    </Panel>
  );
}

export function Rules({ id }: { id?: string }) {
  const t = useT();
  return (
    <ol className="process" id={id}>
      {(["saathiRule1", "saathiRule2", "saathiRule3"] as const).map((k) => (
        <li key={k}><b>{t(k)}</b></li>
      ))}
    </ol>
  );
}

const ICONS: Record<string, string> = {
  paid: "M8 10h32v28H8zM8 18h32M15 28h10M34 28a3 3 0 100 6 3 3 0 100-6",
  "scary-call": "M13 7l7 9-4 5c3 6 6 9 12 12l5-4 8 6-5 7C21 42 7 25 7 12z",
  check: "M21 8a13 13 0 100 26 13 13 0 100-26M31 31l11 11M16 21l4 4 7-8",
  guide: "M24 12C19 8 12 8 6 10v28c6-2 13-2 18 2 5-4 12-4 18-2V10c-6-2-13-2-18 2zm0 0v28",
  quiz: "M24 6a18 18 0 100 36 18 18 0 100-36M18 19c0-8 13-8 13 0 0 5-7 5-7 10M24 35v1",
  saathi: "M10 20h8l12-10v28L18 28h-8zM35 17c4 4 4 10 0 14M39 12c7 7 7 17 0 24",
  family: "M16 9a6 6 0 100 12 6 6 0 100-12M34 14a5 5 0 100 10 5 5 0 100-10M5 40c0-16 22-16 22 0M27 40c0-12 16-12 16 0",
  steps: "M10 12h6v6h-6zM22 15h16M10 30h6v6h-6zM22 33h16",
  link: "M20 28l8-8M18 22l-6 6a8.5 8.5 0 0012 12l6-6M30 26l6-6a8.5 8.5 0 00-12-12l-6 6",
};

export function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}
