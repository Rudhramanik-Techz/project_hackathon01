import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { type Candidate, hasDraft, newCase, reducer } from "./case/model";
import { LangContext, loadLang, makeT, saveLang, type Lang } from "./i18n";
import { before, savePlace } from "./lib/session";
import { type Actions, GROUPS, LABEL, type Page, pageOf, type Route, ROUTES } from "./routes";
import samples from "./samples/samples.json";
import { Check, useCheckState } from "./screens/Check";
import { Home } from "./screens/Home";
import { Accessibility, Disclaimer, Help, Privacy, Sitemap } from "./screens/Info";
import { Family, Guide, Quiz } from "./screens/Learn";
import { LinkCheck } from "./screens/LinkCheck";
import { Paid } from "./screens/Paid";
import { Saathi } from "./screens/Saathi";
import { ScaryCall } from "./screens/ScaryCall";
import { Steps } from "./screens/Steps";
import { Footer, MobileBar, Masthead, Nav, PageFrame, Ticker, UtilBar } from "./ui/Chrome";
import { stopReading } from "./ui/ReadButton";
import { Toast } from "./ui/toast";
import { applyView, loadView, saveView, type View } from "./lib/view";

function readRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, "");
  return (ROUTES as readonly string[]).includes(r) ? (r as Route) : "home";
}

// Read once, before anything is drawn: where this tab was when it was last loaded.
const startRoute = readRoute();
const samePlace = before.page === pageOf(startRoute);
const startY = samePlace ? Number(before.y) || 0 : 0;
const lostDraft = samePlace && startRoute === "paid" && before.draft === true;

function focusView() {
  document.getElementById("view")?.focus({ preventScroll: true });
}

type SeedKey = keyof typeof samples.seeds;

export default function App() {
  const [lang, setLang] = useState<Lang>(loadLang);
  const [view, setView] = useState<View>(loadView);
  const [route, setRoute] = useState<Route>(startRoute);
  const [c, dispatch] = useReducer(reducer, undefined, () => newCase("personal", 0));
  const [lost, setLost] = useState(lostDraft);
  const check = useCheckState();
  const [scam, setScam] = useState<string | null>(null); // a scam to show opened in the guide
  const shown = useCallback(() => setScam(null), []);
  const page = pageOf(route);
  const t = makeT(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${page === "home" ? "" : `${makeT(lang)(LABEL[page])} | `}Asli Ya Nakli`;
  }, [lang, page]);
  useEffect(() => applyView(view), [view]);

  const routeRef = useRef(route);
  const arrive = useCallback((next: Route) => {
    if (next === routeRef.current) return;
    routeRef.current = next;
    stopReading();
    setLost(false);
    setRoute(next);
    savePlace({ page: pageOf(next), y: 0 });
  }, []);

  useEffect(() => {
    const onChange = () => arrive(readRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, [arrive]);

  // A new page starts at the top; a refreshed page returns to where it was.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return;
    window.scrollTo(0, 0);
    focusView();
  }, [route]);

  useEffect(() => {
    first.current = false;
    history.scrollRestoration = "manual";
    savePlace({ page });
    if (startY) requestAnimationFrame(() => window.scrollTo(0, startY));
    let timer = 0;
    const remember = () => savePlace({ y: Math.round(window.scrollY) });
    const onScroll = () => {
      clearTimeout(timer);
      timer = window.setTimeout(remember, 200);
    };
    const onHide = () => document.hidden && remember();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", remember);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", remember);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only whether something was typed is remembered, so a refresh can explain why it is gone.
  const draft = hasDraft(c);
  useEffect(() => {
    if (lost && !draft) return; // keep the record, so a second refresh still explains
    savePlace({ draft });
    if (!draft) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, lost]);

  const go = (next: Page) => {
    const hash = next === "home" ? "" : `#/${next}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    if (next === routeRef.current) {
      window.scrollTo(0, 0);
      focusView();
    } else arrive(next);
  };

  /** Demo seeds: a separate synthetic case with a fixed clock; readings are labelled "precomputed". */
  const openSeed = async (key: SeedKey) => {
    const seed = samples.seeds[key];
    // A demo replaces the whole case, so a real one is only replaced when the person agrees.
    const keep = hasDraft(c) && !window.confirm(t("demoReplaceConfirm"));
    go("paid");
    if (keep) return;
    const images = await Promise.all(
      seed.images.map(async (s) => {
        const blob = await (await fetch(s.file)).blob();
        return { id: crypto.randomUUID(), name: s.file.split("/").pop()!, url: URL.createObjectURL(blob), blob, width: s.width, height: s.height, candidates: s.candidates as Candidate[] };
      }),
    );
    dispatch({ type: "loadSeed", clock: seed.clock, images }); // one atomic action, safe to repeat
  };

  // Bookmarkable demo entry points (#/demo-a, #/demo-b) for the stage: they only name a synthetic seed.
  useEffect(() => {
    if (route !== "demo-a" && route !== "demo-b") return;
    void openSeed(route === "demo-a" ? "A" : "B");
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  const actions: Actions = {
    go,
    openPaid: () => {
      if (c.origin === "synthetic") dispatch({ type: "reset", origin: "personal" }); // never mix demo into a real case
      go("paid");
    },
    openSeed: (k) => void openSeed(k),
    openCheck: (message) => {
      check.run(message);
      go("check");
    },
    openScam: (id) => {
      setScam(id);
      go("guide");
    },
  };

  const screen = () => {
    switch (page) {
      case "home": return <Home actions={actions} easy={view.easy} />;
      case "paid": return <Paid c={c} dispatch={dispatch} lost={lost} actions={actions} />;
      case "scary-call": return <ScaryCall actions={actions} />;
      case "steps": return <Steps actions={actions} />;
      case "check": return <Check state={check} c={c} dispatch={dispatch} actions={actions} />;
      case "link": return <LinkCheck />;
      case "guide": return <Guide open={scam} onShown={shown} />;
      case "quiz": return <Quiz actions={actions} />;
      case "saathi": return <Saathi actions={actions} />;
      case "family": return <Family />;
      case "help": return <Help />;
      case "privacy": return <Privacy />;
      case "disclaimer": return <Disclaimer />;
      case "accessibility": return <Accessibility />;
      case "sitemap": return <Sitemap actions={actions} />;
    }
  };

  const group = GROUPS.find((g) => g.pages.includes(page));

  return (
    <LangContext.Provider value={lang}>
      <a className="skip" href="#view" onClick={(e) => (e.preventDefault(), focusView())}>{t("skip")}</a>
      <UtilBar
        actions={actions}
        view={view}
        onView={(v) => {
          const easyChanged = v.easy !== view.easy;
          setView(v);
          saveView(v);
          if (easyChanged) go("home");
        }}
        onLang={(l) => {
          stopReading();
          setLang(l);
          saveLang(l);
        }}
      />
      <Masthead actions={actions} />
      <Nav page={page} actions={actions} />
      <Ticker />
      <main id="view" tabIndex={-1}>
        {page === "home" ? screen() : <PageFrame page={page} group={group} actions={actions}>{screen()}</PageFrame>}
      </main>
      <Footer actions={actions} />
      <MobileBar actions={actions} />
      <Toast />
    </LangContext.Provider>
  );
}
