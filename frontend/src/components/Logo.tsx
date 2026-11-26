// Brand: "Asli Ya Nakli" (real or fake). Mark = a shield split into a navy half (asli / real) and a blue half
// (nakli / fake) with one verdict check crossing the split; a small amber notch is the accent.
// The wordmark stays in Latin script in every language (it is the brand); the tagline and the accessible
// label follow the selected language.
import { useId } from "react";
import { useT } from "../i18n";

const NAVY = "#0b2545";
const BLUE = "#1f6feb";
const AMBER = "#f59e0b";
const SHIELD = "M24 3 42 9.5V23c0 12.2-8 20.8-18 25-10-4.2-18-12.8-18-25V9.5Z";

/** The square badge mark alone (also the favicon/PWA icon shape). */
export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 48 52" className={className} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}-l`}><rect x="0" y="0" width="24" height="52" /></clipPath>
        <clipPath id={`${id}-r`}><rect x="24" y="0" width="24" height="52" /></clipPath>
      </defs>
      <path d={SHIELD} fill={NAVY} clipPath={`url(#${id}-l)`} />
      <path d={SHIELD} fill={BLUE} clipPath={`url(#${id}-r)`} />
      <path d="M24 3v45" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
      <path d="m14.5 25.5 6.5 6.5 13-14" fill="none" stroke="#ffffff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38.5 8.2 42 9.5v4.3l-3.5-1.3Z" fill={AMBER} />
    </svg>
  );
}

/** Mark + wordmark (+ optional tagline). Sizes scale from phone to desktop. */
export function AsliYaNakliLogo({ tagline = true, size = "md" }: { tagline?: boolean; size?: "sm" | "md" }) {
  const t = useT();
  const mark = size === "sm" ? "h-7 w-7" : "h-8 w-8 sm:h-9 sm:w-9 lg:h-10 lg:w-10";
  const word = size === "sm" ? "text-base" : "text-[15px] sm:text-xl lg:text-[1.375rem]";
  return (
    <span className="flex min-w-0 items-center gap-2 sm:gap-2.5" role="img" aria-label={`${t("appName")} — ${t("tagline")}`}>
      <LogoMark className={`${mark} shrink-0`} />
      <span className="min-w-0 overflow-hidden leading-none" aria-hidden="true">
        <span className={`block overflow-hidden text-ellipsis whitespace-nowrap font-extrabold tracking-tight text-slate-900 ${word}`}>
          Asli <span className="font-medium italic text-sky-800">ya</span> Nakli
        </span>
        {tagline && (
          <span className="mt-1 hidden truncate text-xs font-medium text-slate-500 sm:block">{t("tagline")}</span>
        )}
      </span>
    </span>
  );
}
