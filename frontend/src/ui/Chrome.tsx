// The frame around every page: top bar, masthead with search, menu, running safety line and footer.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { getHealth, type Health } from "../api";
import { SCAMS } from "../content";
import { type Lang, LANGS, type StringKey, useLang, useT } from "../i18n";
import type { View } from "../lib/view";
import { type Actions, GROUPS, LABEL, type Page } from "../routes";
import { Ext } from "./bits";
import { Logo } from "./Logo";

export function UtilBar({ actions, view, onView, onLang }: { actions: Actions; view: View; onView: (v: View) => void; onLang: (l: Lang) => void }) {
  const t = useT();
  const lang = useLang();
  const sizes: [View["size"], string, StringKey][] = [[90, "A−", "smaller"], [100, "A", "normalSize"], [118, "A+", "larger"]];
  return (
    <div className="util">
      <div className="wrap">
        <span className="push" />
        <button type="button" data-go="accessibility" onClick={() => actions.go("accessibility")}>{t("srAccess")}</button>
        <button type="button" data-go="sitemap" onClick={() => actions.go("sitemap")}>{t("sitemap")}</button>
        <span className="grp" role="group" aria-label={t("textSize")}>
          {sizes.map(([size, mark, label]) => (
            <button key={size} type="button" aria-label={t(label)} aria-pressed={view.size === size} onClick={() => onView({ ...view, size })}>{mark}</button>
          ))}
        </span>
        <button type="button" aria-pressed={view.hc} onClick={() => onView({ ...view, hc: !view.hc })}>{t("contrast")}</button>
        <button type="button" aria-pressed={view.easy} onClick={() => onView({ ...view, easy: !view.easy })}>{t("easy")}</button>
        <select id="lang" aria-label={t("language")} value={lang} onChange={(e) => onLang(e.target.value as Lang)}>
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Search({ actions }: { actions: Actions }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const has = (...keys: StringKey[]) => keys.some((k) => t(k).toLowerCase().includes(q));
  const results: { id: string; label: string; open: () => void }[] =
    q.length < 2
      ? []
      : [
          ...(Object.keys(LABEL) as Page[])
            .filter((p) => has(LABEL[p]))
            .map((p) => ({ id: p, label: t(LABEL[p]), open: () => (p === "paid" ? actions.openPaid() : actions.go(p)) })),
          ...SCAMS.map((id, j) => ({ id, j }))
            .filter(({ j }) => has(`scam.${j}.n` as StringKey, `scam.${j}.s` as StringKey, `scam.${j}.a` as StringKey))
            .map(({ id, j }) => ({ id: `s-${id}`, label: t(`scam.${j}.n` as StringKey), open: () => actions.openScam(id) })),
          ...[0, 1, 2, 3, 4]
            .filter((j) => has(`faq.${j}.q` as StringKey, `faq.${j}.a` as StringKey))
            .map((j) => ({ id: `f-${j}`, label: t(`faq.${j}.q` as StringKey), open: () => actions.go("help") })),
        ].slice(0, 8);
  return (
    <div className="find">
      <input id="q" type="search" autoComplete="off" placeholder={t("searchSite")} aria-label={t("searchSite")} value={query}
        onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQuery("")} />
      <div id="hits">
        {q.length >= 2 && (
          <ul>
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => (setQuery(""), r.open())}>{r.label}</button>
              </li>
            ))}
            {results.length === 0 && <li className="pad">{t("none")}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Masthead({ actions }: { actions: Actions }) {
  const t = useT();
  return (
    <header className="mast">
      <div className="wrap">
        <button type="button" className="brand" onClick={() => actions.go("home")}>
          <Logo />
          <span>
            <b lang="hi">असली या नकली</b>
            <strong>Asli Ya Nakli</strong>
            <small>{t("sub")}</small>
          </span>
        </button>
        <div className="helps">
          <Search actions={actions} />
          <a className="help" href="tel:1930"><span>{t("hl")}</span><b>1930</b></a>
        </div>
      </div>
    </header>
  );
}

function PageLinks({ pages, current, actions }: { pages: Page[]; current: Page; actions: Actions }) {
  const t = useT();
  return (
    <ul>
      {pages.map((p) => (
        <li key={p}>
          <button type="button" data-page={p} aria-current={p === current ? "page" : undefined} onClick={() => (p === "paid" ? actions.openPaid() : actions.go(p))}>
            {t(LABEL[p])}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Nav({ page, actions }: { page: Page; actions: Actions }) {
  const t = useT();
  const [open, setOpen] = useState<StringKey | null>(null);
  const [all, setAll] = useState(false); // the single Menu button on phones and tablets
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => (setOpen(null), setAll(false)), [page]);
  useEffect(() => {
    document.body.classList.toggle("menuopen", all);
  }, [all]);
  useEffect(() => {
    const outside = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) (setOpen(null), setAll(false));
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const focusId = open ? `m-${open}` : all ? "menubtn" : null;
      setOpen(null);
      setAll(false);
      if (focusId) document.getElementById(focusId)?.focus();
    };
    const wide = window.matchMedia("(min-width: 60.01rem)");
    const widen = () => setAll(false);
    document.addEventListener("click", outside);
    document.addEventListener("keydown", escape);
    wide.addEventListener("change", widen);
    return () => {
      document.removeEventListener("click", outside);
      document.removeEventListener("keydown", escape);
      wide.removeEventListener("change", widen);
    };
  }, [open, all]);
  const choose: Actions = { ...actions, go: (p) => (setOpen(null), setAll(false), actions.go(p)), openPaid: () => (setOpen(null), setAll(false), actions.openPaid()) };
  return (
    <nav className="mega" aria-label={t("mainMenu")}>
      <div className="wrap" ref={root}>
        <button type="button" id="menubtn" aria-expanded={all} aria-controls="nav" onClick={() => (setOpen(null), setAll(!all))}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          <span>{t("menuBtn")}</span>
        </button>
        <div id="nav">
          <button type="button" id="nav-home" className="top" aria-current={page === "home" ? "page" : undefined} onClick={() => choose.go("home")}>{t("mHome")}</button>
          {GROUPS.map((g) => (
            <div key={g.key} className={`menu ${g.pages.includes(page) ? "here" : ""}`}>
              <button type="button" className="top" id={`m-${g.key}`} aria-expanded={open === g.key} onClick={() => !all && setOpen(open === g.key ? null : g.key)}>
                {t(g.key)} <span aria-hidden="true">▾</span>
              </button>
              {(open === g.key || all) && <PageLinks pages={g.pages} current={page} actions={choose} />}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}

export function Ticker() {
  const t = useT();
  const items = (["al1", "al2", "al3"] as const).map((k) => <span key={k}>{t(k)}</span>);
  // The list is written twice so the line loops without a gap; the copy is hidden from screen readers.
  return (
    <div className="alertbar">
      <div className="wrap">
        <b>{t("alerts")}</b>
        <div className="tickwin">
          <div id="ticker">
            <div>{items}</div>
            <div aria-hidden="true">{items}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Inner pages: where you are, a print button, the section menu and the page itself. */
export function PageFrame({ page, group, actions, children }: { page: Page; group: (typeof GROUPS)[number] | undefined; actions: Actions; children: ReactNode }) {
  const t = useT();
  const full = page === "paid" || page === "scary-call";
  return (
    <>
      <div className="titleband">
        <div className="wrap">
          <p className="crumbs">
            <button type="button" className="link" onClick={() => actions.go("home")}>{t("mHome")}</button> › {group ? t(group.key) : ""} › {t(LABEL[page])}
          </p>
          <button type="button" className="ghost" onClick={() => window.print()}>{t("pageTools")}</button>
        </div>
      </div>
      <div className={`wrap pagebody ${full ? "full" : "withmenu"}`}>
        {!full && group && (
          <nav className="sidemenu" aria-label={t(group.key)}>
            <h2>{t(group.key)}</h2>
            <PageLinks pages={group.pages} current={page} actions={actions} />
          </nav>
        )}
        <div className="content">{children}</div>
      </div>
    </>
  );
}

export function Footer({ actions }: { actions: Actions }) {
  const t = useT();
  const [health, setHealth] = useState<Health | null | "down">(null);
  useEffect(() => {
    let live = true;
    void getHealth().then((h) => live && setHealth(h ?? "down"));
    return () => {
      live = false;
    };
  }, []);
  const status = health === null ? t("statusChecking") : health === "down" ? t("statusDown") : `${t("statusOk")} · ${health.region} · ${health.build}`;
  return (
    <footer>
      <div className="wrap fcols">
        <div>
          <h2>Asli Ya Nakli</h2>
          <p>{t("footerAbout")}</p>
        </div>
        <div>
          <h2>{t("policies")}</h2>
          {(["privacy", "disclaimer", "accessibility", "sitemap"] as const).map((p) => (
            <button key={p} type="button" onClick={() => actions.go(p)}>{t(LABEL[p])}</button>
          ))}
        </div>
        <div>
          <h2>{t("mHelp")}</h2>
          <a href="tel:1930">1930</a>
          <Ext href="https://cybercrime.gov.in">cybercrime.gov.in</Ext>
          <Ext href="https://sancharsaathi.gov.in">sancharsaathi.gov.in</Ext>
          <Ext href="/eval-report.md">{t("footerEval")}</Ext>
        </div>
      </div>
      <div className="legal">
        <div className="wrap">
          <span data-testid="health-status">
            <i className={`dot ${health === null ? "" : health === "down" ? "down" : "ok"}`} aria-hidden="true" />
            {status}
          </span>
          <button type="button" onClick={() => (window.scrollTo(0, 0), document.getElementById("view")?.focus({ preventScroll: true }))}>{t("toTop")}</button>
        </div>
      </div>
    </footer>
  );
}

export function MobileBar({ actions }: { actions: Actions }) {
  const t = useT();
  return (
    <div className="mobar">
      <a href="tel:1930">{t("call1930")}</a>
      <button type="button" onClick={actions.openPaid}>{t("alreadyPaid")}</button>
    </div>
  );
}
