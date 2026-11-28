import { type ReactNode, useEffect, useRef } from "react";
import { SCAMS } from "../content";
import { type StringKey, useT } from "../i18n";
import { usePlace } from "../lib/session";
import type { Actions, Page } from "../routes";
import samples from "../samples/samples.json";
import { Contacts, Ext, Icon, NeverShare, Panel } from "../ui/bits";

const SERVICES: { page: Page; title: StringKey; keep: StringKey; urgent?: boolean }[] = [
  { page: "paid", title: "alreadyPaid", keep: "kPaid", urgent: true },
  { page: "scary-call", title: "scaryCall", keep: "kScary", urgent: true },
  { page: "steps", title: "sTri", keep: "kTri", urgent: true },
  { page: "check", title: "isThisScam", keep: "kCheck" },
  { page: "link", title: "sLink", keep: "kLink" },
  { page: "guide", title: "sGuide", keep: "kGuide" },
  { page: "quiz", title: "sQuiz", keep: "kQuiz" },
  { page: "saathi", title: "saathiTitle", keep: "kDrill" },
  { page: "family", title: "sFamily", keep: "kFamily" },
];

const open = (actions: Actions, page: Page) => (page === "paid" ? actions.openPaid() : actions.go(page));

// Flat drawings made for each slide. They carry no text, so they work in every language.
const ART: ReactNode[] = [
  <>
    <rect x="62" y="14" width="96" height="172" rx="12" className="s" /><path d="M96 28h28" className="l" /><circle cx="110" cy="92" r="42" className="a" />
    <path d="M90 78l12 13-7 8c5 11 11 17 22 22l8-7 13 11-8 11c-27 0-52-27-52-52z" className="d" /><circle cx="110" cy="158" r="13" className="r" /><path d="M104 158h12" className="w" />
  </>,
  <>
    <path d="M24 38h150v94H92l-34 30v-30H24z" className="s" /><path d="M46 62h106M46 84h106M46 106h62" className="l" /><circle cx="162" cy="132" r="34" className="a" />
    <path d="M186 156l24 24" className="k" /><path d="M162 116v20M162 148v1" className="k" />
  </>,
  <>
    <rect x="24" y="52" width="164" height="110" rx="6" className="s" /><path d="M24 78h164" className="l" /><circle cx="66" cy="112" r="14" className="d" />
    <path d="M42 146c0-26 48-26 48 0z" className="d" /><path d="M108 104h60M108 122h60M108 140h38" className="l" />
    <path d="M156 16l36 13v24c0 22-16 34-36 43-20-9-36-21-36-43V29z" className="a" /><path d="M141 52l11 11 21-23" className="k" />
  </>,
];

const SLIDES: { title: StringKey; text: StringKey; page: Page; label: StringKey }[] = [
  { title: "b1h", text: "b1p", page: "paid", label: "alreadyPaid" },
  { title: "b2h", text: "b2p", page: "check", label: "isThisScam" },
  { title: "b3h", text: "b3p", page: "family", label: "sFamily" },
];

const SLIDE_MS = 7000;

/**
 * Slides advance on their own. They wait while a mouse or keyboard is on them or the tab is hidden,
 * and stay still if the device asks for less motion.
 */
function Slides({ actions }: { actions: Actions }) {
  const t = useT();
  const [slide, setSlide] = usePlace("slide", 0, (v) => typeof v === "number" && v >= 0 && v < SLIDES.length);
  const banner = useRef<HTMLElement>(null);
  const mouse = useRef(false);
  const touch = useRef({ x: 0, y: 0 });
  const show = (n: number) => setSlide((n + SLIDES.length) % SLIDES.length);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let since = Date.now();
    const timer = setInterval(() => {
      if (document.hidden || still.matches || mouse.current || banner.current?.querySelector(":focus-visible")) since = Date.now();
      else if (Date.now() - since >= SLIDE_MS) setSlide((slide + 1) % SLIDES.length);
    }, 500);
    return () => clearInterval(timer);
  }, [slide, setSlide]);

  return (
    <section
      className="banner"
      id="banner"
      ref={banner}
      onPointerEnter={(e) => e.pointerType === "mouse" && (mouse.current = true)}
      onPointerLeave={() => (mouse.current = false)}
      onTouchStart={(e) => (touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0]!.clientX - touch.current.x;
        const dy = e.changedTouches[0]!.clientY - touch.current.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(slide + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="slides">
        {SLIDES.map((s, i) => (
          <div key={s.title} className={`slide ${i === slide ? "on" : ""}`} aria-hidden={i !== slide} ref={(el) => void el?.toggleAttribute("inert", i !== slide)}>
            <div className="wrap bn">
              <div>
                <h1>{t(s.title)}</h1>
                <p>{t(s.text)}</p>
                <div className="row">
                  {i === 0 && <a className="btn gold" href="tel:1930">{t("call1930")}</a>}
                  <button type="button" className={`btn ${i === 0 ? "light" : "gold"}`} onClick={() => open(actions, s.page)}>{t(s.label)}</button>
                </div>
              </div>
              <svg className="art" viewBox="0 0 220 200" aria-hidden="true">{ART[i]}</svg>
            </div>
          </div>
        ))}
      </div>
      <div className="bnctl">
        <button type="button" data-slide="prev" aria-label={t("prevS")} onClick={() => show(slide - 1)}>‹</button>
        {SLIDES.map((s, i) => (
          <button key={s.title} type="button" className="dot" aria-label={String(i + 1)} aria-current={i === slide ? "true" : undefined} onClick={() => show(i)} />
        ))}
        <button type="button" data-slide="next" aria-label={t("nextS")} onClick={() => show(slide + 1)}>›</button>
      </div>
    </section>
  );
}

const TABS = [["adv", "tAdv"], ["how", "tHow"], ["down", "tDown"]] as const;

function HomeTabs({ actions }: { actions: Actions }) {
  const t = useT();
  const [tab, setTab] = usePlace("htab", "adv", (v) => TABS.some(([k]) => k === v));
  return (
    <section className="box">
      <div className="htabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`h-${k}`} aria-selected={tab === k} onClick={() => setTab(k)}>{t(label)}</button>
        ))}
      </div>
      <div className="hbody" role="tabpanel">
        {tab === "adv" && (
          <>
            <ul className="news">
              {SCAMS.slice(0, 5).map((id, j) => (
                <li key={id}>
                  <button type="button" className="link" onClick={() => actions.openScam(id)}>
                    <b>{t(`scam.${j}.n` as StringKey)}</b> {t(`scam.${j}.a` as StringKey)}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="link more" onClick={() => actions.go("guide")}>{t("viewAll")}</button>
          </>
        )}
        {tab === "how" && (
          <ol className="news">
            {([["how1Title", "how1Body"], ["how2Title", "how2Body"], ["how3Title", "how3Body"], ["s4t", "s4b"]] as const).map(([a, b]) => (
              <li key={a}><b>{t(a)}.</b> {t(b)}</li>
            ))}
          </ol>
        )}
        {tab === "down" && (
          <ul className="news">
            {([["family", "cardT"], ["paid", "sum"], ["paid", "secE"]] as const).map(([page, label]) => (
              <li key={label}><button type="button" className="link" onClick={() => actions.go(page)}>{t(label)}</button></li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Made-up cases and messages, so anyone can try the whole flow without real data. */
function Demos({ actions }: { actions: Actions }) {
  const t = useT();
  const checks: [keyof typeof samples.check, StringKey][] = [["digitalArrest", "sampleDigitalArrest"], ["courier", "sampleCourier"], ["genuine", "sampleGenuine"]];
  return (
    <Panel title={t("samplesTitle")} id="demos">
      <div className="demos">
        <div>
          <h3>{t("demoGroupPaid")}</h3>
          <ul>
            <li><button type="button" className="link" onClick={() => actions.openSeed("A")}>{t("sampleSeedA")}</button></li>
            <li><button type="button" className="link" onClick={() => actions.openSeed("B")}>{t("sampleSeedB")}</button></li>
          </ul>
        </div>
        <div>
          <h3>{t("demoGroupCheck")}</h3>
          <ul>
            {checks.map(([key, label]) => (
              <li key={key}><button type="button" className="link" onClick={() => actions.openCheck(samples.check[key])}>{t(label)}</button></li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function Official() {
  const t = useT();
  const sites = [["oPortal", "cybercrime.gov.in", "https://cybercrime.gov.in"], ["oSaathi", "sancharsaathi.gov.in", "https://sancharsaathi.gov.in"], ["oRbi", "rbi.org.in", "https://www.rbi.org.in"]] as const;
  return (
    <section className="official">
      <div className="wrap">
        <h2>{t("official")}</h2>
        <ul>
          {sites.map(([label, domain, href]) => (
            <li key={domain}><Ext href={href}><b>{t(label)}</b><span>{domain}</span></Ext></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Home({ actions, easy }: { actions: Actions; easy: boolean }) {
  const t = useT();
  if (easy)
    return (
      <div className="wrap pagebody">
        <h1>{t("need")}</h1>
        <p className="lead">{t("easyHelp")}</p>
        <div className="tiles">
          {SERVICES.filter((s) => ["paid", "scary-call", "check"].includes(s.page)).map((s) => (
            <button key={s.page} type="button" className={`tile ${s.urgent ? "u" : ""}`} onClick={() => open(actions, s.page)}>{t(s.title)}</button>
          ))}
          <a className="tile u" href="tel:1930">{t("call1930")}</a>
        </div>
      </div>
    );
  return (
    <>
      <Slides actions={actions} />
      <div className="wrap">
        <h2 className="sect">{t("mServices")}</h2>
        <ul className="services">
          {SERVICES.map((s) => (
            <li key={s.page}>
              <button type="button" data-page={s.page} className={s.urgent ? "u" : ""} onClick={() => open(actions, s.page)}>
                <span className="ic"><Icon name={s.page} /></span>
                <b>{t(s.title)}</b>
                <small>{t("keep")}: {t(s.keep)}</small>
              </button>
            </li>
          ))}
        </ul>
        <div className="layout">
          <div>
            <HomeTabs actions={actions} />
            <Demos actions={actions} />
          </div>
          <aside><Contacts /></aside>
        </div>
        <div className="cols">
          <NeverShare />
          <Panel title={t("faqT")} extra={<button type="button" className="link" onClick={() => actions.go("help")}>{t("viewAll")}</button>}>
            {[0, 1, 2].map((j) => (
              <details className="acc" key={j}>
                <summary>{t(`faq.${j}.q` as StringKey)}</summary>
                <p>{t(`faq.${j}.a` as StringKey)}</p>
              </details>
            ))}
          </Panel>
        </div>
      </div>
      <Official />
    </>
  );
}
