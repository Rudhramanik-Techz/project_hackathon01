import { useState } from "react";
import { useT } from "../i18n";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Copies the exact text captured at click time. Success is shown only after the write actually succeeded. */
export function CopyButton({ text, label, big = false }: { text: string; label?: string; big?: boolean }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <span className={big ? "block" : "inline-flex shrink-0 flex-col items-end"}>
      <button
        type="button"
        disabled={!text}
        onClick={async () => {
          const snapshot = text;
          setState((await copyText(snapshot)) ? "copied" : "failed");
          setTimeout(() => setState("idle"), 2000);
        }}
        className={`rounded-lg font-semibold disabled:opacity-40 ${
          big ? "min-h-12 w-full bg-slate-900 px-4 text-white" : "min-h-10 border border-slate-300 bg-white px-3 text-sm text-slate-800"
        }`}
      >
        {state === "copied" ? `✓ ${t("copied")}` : (label ?? t("copy"))}
      </button>
      {state === "failed" && (
        <span role="alert" className="mt-1 max-w-48 text-xs text-red-700">
          {t("copyFailed")}
        </span>
      )}
    </span>
  );
}
