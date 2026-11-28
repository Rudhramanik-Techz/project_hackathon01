import type { StringKey } from "./i18n";

// History carries route labels only; case data never goes into URLs or history state.
export const ROUTES = [
  "home", "paid", "scary-call", "steps", "check", "link", "guide", "quiz", "saathi", "family",
  "help", "privacy", "disclaimer", "accessibility", "sitemap", "demo-a", "demo-b",
] as const;
export type Route = (typeof ROUTES)[number];
export type Page = Exclude<Route, "demo-a" | "demo-b">;

export const GROUPS: { key: StringKey; pages: Page[] }[] = [
  { key: "mServices", pages: ["paid", "scary-call", "steps", "check", "link"] },
  { key: "mLearn", pages: ["guide", "quiz", "saathi", "family"] },
  { key: "mHelp", pages: ["help", "privacy", "disclaimer", "accessibility", "sitemap"] },
];

export const LABEL: Record<Page, StringKey> = {
  home: "mHome", paid: "nPaid", "scary-call": "scaryCall", steps: "nTri", check: "nCheck", link: "nLink",
  guide: "nGuide", quiz: "nQuiz", saathi: "saathiTitle", family: "nFamily", help: "faqT", privacy: "pPrivacy",
  disclaimer: "pDisc", accessibility: "pAcc", sitemap: "sitemap",
};

export const pageOf = (r: Route): Page => (r === "demo-a" || r === "demo-b" ? "paid" : r);

/** Everything a screen needs in order to send the visitor somewhere else. */
export interface Actions {
  go: (page: Page) => void;
  openPaid: () => void;
  openSeed: (key: "A" | "B") => void;
  openCheck: (message: string) => void;
  openScam: (id: string) => void;
}
