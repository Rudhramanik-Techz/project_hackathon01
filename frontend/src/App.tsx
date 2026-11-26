import { useEffect, useReducer, useState, type ReactNode } from "react";
import { getHealth, type Health } from "./api";
import { type Candidate, newCase, reducer } from "./case/model";
import { HeroArt } from "./components/HeroArt";
import { AsliYaNakliLogo } from "./components/Logo";
import {
  AlertIcon, ArrowLeftIcon, BeakerIcon, CameraIcon, CheckIcon, ChevronRightIcon, CloudIcon, ExternalIcon, FileIcon,
  LockIcon, PhoneIcon, SearchIcon, ShieldIcon, UsersIcon,
} from "./components/Icons";
import { LANGS, LangContext, loadLang, saveLang, useT, type Lang, type StringKey } from "./i18n";
import samples from "./samples/samples.json";
import { Check, type CheckSampleKey } from "./screens/Check";
import { Paid } from "./screens/Paid";
import { Saathi } from "./screens/Saathi";
import { ScaryCall } from "./screens/ScaryCall";

type Route = "home" | "paid" | "check" | "scary-call" | "saathi" | "demo-a" | "demo-b";
const ROUTES: Route[] = ["home", "paid", "check", "scary-call", "saathi", "demo-a", "demo-b"];

// History carries route labels only; case data never goes into URLs or history state.
function readRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, "");
  return (ROUTES as string[]).includes(r) ? (r as Route) : "home";
}

function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onChange = () => {
      setRoute(readRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return [route, (r) => (window.location.hash = r === "home" ? "" : `/${r}`)];
}

type SeedKey = keyof typeof samples.seeds;

export default function App() {
  const [lang, setLang] = useState<Lang>(loadLang);
  const [route, go] = useHashRoute();
  const [c, dispatch] = useReducer(reducer, undefined, () => newCase("personal", 0));
  const [checkSample, setCheckSample] = useState<CheckSampleKey | null>(null);
  const [checkKey, setCheckKey] = useState(0);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Bookmarkable demo entry points (#/demo-a, #/demo-b) for the stage: they only name a synthetic seed.
  useEffect(() => {
    if (route === "demo-a" || route === "demo-b") void openSeed(route === "demo-a" ? "A" : "B");
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCheck = (sample: CheckSampleKey | null) => {
    setCheckSample(sample);
    setCheckKey((k) => k + 1);
    go("check");
  };

  const openPaid = (evidence = "") => {
    if (c.origin === "synthetic") dispatch({ type: "reset", origin: "personal" }); // never mix demo into a real case
    if (evidence) dispatch({ type: "info", key: "evidence", value: evidence });
    go("paid");
  };

  /** Demo seeds: a separate synthetic case with a fixed clock; readings are labelled "precomputed". */
  const openSeed = async (key: SeedKey) => {
    const seed = samples.seeds[key];
    go("paid");
    const images = await Promise.all(
      seed.images.map(async (s) => {
        const blob = await (await fetch(s.file)).blob();
        return { id: crypto.randomUUID(), name: s.file.split("/").pop()!, url: URL.createObjectURL(blob), blob, width: s.width, height: s.height, candidates: s.candidates as Candidate[] };
      }),
    );
    dispatch({ type: "loadSeed", clock: seed.clock, images }); // one atomic action, safe to repeat
  };

  if (route === "scary-call") {
    return (
      <LangContext.Provider value={lang}>
        <ScaryCall onDone={() => go("home")} />
      </LangContext.Provider>
    );
  }

  const wide = route === "home" || route === "paid" || route === "demo-a" || route === "demo-b" || route === "check";
  return (
    <LangContext.Provider value={lang}>
      <div className="flex min-h-dvh flex-col">
        <TopBar lang={lang} onLang={(l) => (setLang(l), saveLang(l))} onHome={() => go("home")} showBack={route !== "home"} />
        <main className={`mx-auto w-full flex-1 pb-12 pt-6 lg:pt-10 ${wide ? `${CONTAINER} ${GUTTER}` : "max-w-2xl px-4 sm:px-6"}`}>
          {route === "home" && <Home openCheck={openCheck} openPaid={() => openPaid()} openSeed={openSeed} go={go} />}
          {route === "check" && <Check key={checkKey} sample={checkSample} onHandoff={openPaid} />}
          {(route === "paid" || route === "demo-a" || route === "demo-b") && <Paid c={c} dispatch={dispatch} />}
          {route === "saathi" && <Saathi />}
        </main>
        <Footer />
      </div>
    </LangContext.Provider>
  );
}

// ------------------------------------------------------------------------------------------------ chrome

// Wide content container + side padding shared by main and footer; the header spans the full width.
const CONTAINER = "max-w-[1440px]";
const GUTTER = "px-4 sm:px-6 md:px-10 lg:px-14";

function TopBar({ lang, onLang, onHome, showBack }: { lang: Lang; onLang: (l: Lang) => void; onHome: () => void; showBack: boolean }) {
  const t = useT();
  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="flex h-16 w-full items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:h-[4.5rem] lg:px-12">
        {showBack && (
          <button type="button" onClick={onHome} aria-label={t("back")}
            className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-900 hover:bg-slate-100">
            <ArrowLeftIcon />
          </button>
        )}
        <button type="button" onClick={onHome} className="flex min-w-0 items-center text-left">
          <AsliYaNakliLogo />
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div role="group" aria-label={t("language")} className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {LANGS.map(({ code, label }) => (
              <button key={code} type="button" onClick={() => onLang(code)} aria-pressed={lang === code}
                className={`min-h-9 min-w-7 rounded-md px-1 text-xs font-medium sm:min-w-10 sm:px-2 sm:text-sm ${lang === code ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>
                {label}
              </button>
            ))}
          </div>
          <a href="tel:1930" className="flex min-h-10 items-center gap-1.5 rounded-lg bg-red-700 px-2.5 text-sm font-semibold text-white sm:gap-2 sm:px-3">
            <PhoneIcon size={16} />
            <span className="hidden sm:inline">{t("navCall")}</span>
            <span className="sm:hidden">1930</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  const t = useT();
  const [health, setHealth] = useState<Health | null | "down">(null);
  useEffect(() => {
    let live = true;
    void getHealth().then((h) => live && setHealth(h ?? "down"));
    return () => {
      live = false;
    };
  }, []);
  const ok = health !== null && health !== "down";
  const status = health === null ? t("statusChecking") : health === "down" ? t("statusDown") : `${t("statusOk")} · ${health.region} · ${health.build}`;
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className={`mx-auto grid ${CONTAINER} gap-6 py-8 text-sm ${GUTTER} md:grid-cols-[2fr_1fr_1fr]`}>
        <div>
          <AsliYaNakliLogo size="sm" tagline={false} />
          <p className="mt-2 max-w-md text-slate-500">{t("footerAbout")}</p>
        </div>
        <div className="space-y-2">
          <a href="tel:1930" className="flex items-center gap-2 font-semibold"><PhoneIcon size={16} />{t("helpline")}</a>
          <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer noopener" className="flex items-center gap-2">
            <ExternalIcon size={16} />cybercrime.gov.in
          </a>
          <a href="/eval-report.md" target="_blank" rel="noopener" className="flex items-center gap-2"><FileIcon size={16} />{t("footerEval")}</a>
        </div>
        <p className="flex items-start gap-2 text-slate-500" data-testid="health-status">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-green-600" : health === "down" ? "bg-amber-500" : "bg-slate-300"}`} />
          {status}
        </p>
      </div>
    </footer>
  );
}

// -------------------------------------------------------------------------------------------------- home

type Opener = {
  openCheck: (s: CheckSampleKey | null) => void;
  openPaid: () => void;
  openSeed: (k: SeedKey) => void;
  go: (r: Route) => void;
};

function Home({ openCheck, openPaid, openSeed, go }: Opener) {
  const t = useT();
  return (
    <div className="flex flex-col gap-12 lg:gap-16">
      {/* hero */}
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800">
            <ShieldIcon size={14} />{t("heroEyebrow")}
          </p>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-slate-950 sm:text-4xl lg:text-5xl xl:text-[3.5rem]">{t("heroTitle")}</h1>
          <p className="mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">{t("heroSub")}</p>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            {(["trust1", "trust2", "trust3"] as StringKey[]).map((k, i) => (
              <li key={k} className="flex items-center gap-1.5">
                {i === 0 ? <LockIcon size={16} className="text-sky-800" /> : i === 1 ? <ShieldIcon size={16} className="text-sky-800" /> : <CloudIcon size={16} className="text-sky-800" />}
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden justify-center lg:flex xl:justify-end"><HeroArt /></div>
      </section>

      {/* primary actions */}
      <section className="grid gap-4 md:grid-cols-3 lg:gap-6">
        <ActionCard onClick={openPaid} tone="primary" icon={<FileIcon size={22} />} title={t("alreadyPaid")} sub={t("alreadyPaidSub")} />
        <ActionCard onClick={() => openCheck(null)} tone="neutral" icon={<SearchIcon size={22} />} title={t("isThisScam")} sub={t("isThisScamSub")} />
        <ActionCard onClick={() => go("scary-call")} tone="danger" icon={<AlertIcon size={22} />} title={t("scaryCall")} sub={t("scaryCallSub")} />
      </section>

      {/* how it works */}
      <section aria-labelledby="how-h">
        <h2 id="how-h" className="text-xl font-bold sm:text-2xl">{t("howTitle")}</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3 lg:gap-6">
          {([
            ["how1Title", "how1Body", <PhoneIcon key="i" />],
            ["how2Title", "how2Body", <CameraIcon key="i" />],
            ["how3Title", "how3Body", <CheckIcon key="i" />],
          ] as [StringKey, StringKey, ReactNode][]).map(([title, body, icon], i) => (
            <li key={title} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-800">{icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("stepLabel", { n: i + 1 })}</span>
              </div>
              <h3 className="mt-3 font-semibold">{t(title)}</h3>
              <p className="mt-1 text-sm text-slate-600">{t(body)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* demos + saathi */}
      <section aria-labelledby="demo-h" className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 id="demo-h" className="flex items-center gap-2 text-lg font-bold"><BeakerIcon className="text-sky-800" />{t("samplesTitle")}</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <DemoGroup title={t("demoGroupPaid")} items={[["sampleSeedA", () => openSeed("A")], ["sampleSeedB", () => openSeed("B")]]} />
            <DemoGroup title={t("demoGroupCheck")} items={[
              ["sampleDigitalArrest", () => openCheck("digitalArrest")],
              ["sampleCourier", () => openCheck("courier")],
              ["sampleGenuine", () => openCheck("genuine")],
            ]} />
          </div>
        </div>
        <button type="button" onClick={() => go("saathi")}
          className="flex flex-col items-start rounded-xl border border-slate-200 bg-white p-5 text-left sm:p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><UsersIcon /></span>
          <span className="mt-3 text-lg font-bold text-slate-950">{t("saathiTitle")}</span>
          <span className="mt-1 text-sm text-slate-600">{t("saathiCardSub")}</span>
          <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-semibold text-sky-800">{t("saathiLink")}<ChevronRightIcon size={16} /></span>
        </button>
      </section>
    </div>
  );
}

function ActionCard({ title, sub, onClick, icon, tone }: { title: string; sub: string; onClick: () => void; icon: ReactNode; tone: "primary" | "neutral" | "danger" }) {
  const styles = {
    primary: "bg-slate-900 text-white border-transparent",
    neutral: "bg-white text-slate-950 border-slate-200",
    danger: "bg-red-700 text-white border-transparent",
  }[tone];
  const iconBox = tone === "neutral" ? "bg-sky-50 text-sky-800" : "bg-white/15 text-white";
  return (
    <button type="button" onClick={onClick}
      className={`group flex min-h-40 flex-col rounded-xl border p-5 text-left shadow-sm sm:p-6 ${styles}`}>
      <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${iconBox}`}>{icon}</span>
      <span className="mt-4 text-xl font-bold leading-snug">{title}</span>
      <span className="mt-1 text-sm opacity-90">{sub}</span>
      <ChevronRightIcon className="mt-auto self-end opacity-70 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function DemoGroup({ title, items }: { title: string; items: [StringKey, () => void][] }) {
  const t = useT();
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
        {items.map(([key, onClick]) => (
          <li key={key}>
            <button type="button" onClick={onClick}
              className="flex min-h-12 w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-slate-950">
              {t(key)}<ChevronRightIcon size={16} className="shrink-0 text-slate-500" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
