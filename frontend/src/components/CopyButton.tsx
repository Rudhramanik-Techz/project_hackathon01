import { useState } from "react";
import { useT } from "../i18n";
import { copyText } from "../lib/files";

/** Copies the exact text captured at click time. Success is shown only after the write actually succeeded. */
export function CopyButton({ text, label, name }: { text: string; label?: string; name?: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <span className="copy">
      <button
        type="button"
        className="btn sec sm"
        disabled={!text}
        aria-label={name ? `${t("copy")} ${name}` : undefined}
        onClick={async () => {
          const snapshot = text;
          setState((await copyText(snapshot)) ? "copied" : "failed");
          setTimeout(() => setState("idle"), 2000);
        }}
      >
        {state === "copied" ? `✓ ${t("copied")}` : (label ?? t("copy"))}
      </button>
      {state === "failed" && (
        <span role="alert" className="err">
          {t("copyFailed")}
        </span>
      )}
    </span>
  );
}
