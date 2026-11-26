// Works with no network at all: static text plus a wa.me share link and tel: links.
import { useT } from "../i18n";
import { copyText } from "../lib/files";
import type { Actions } from "../routes";
import { ReadButton } from "../ui/ReadButton";
import { toast } from "../ui/toast";

export function ScaryCall({ actions }: { actions: Actions }) {
  const t = useT();
  const wa = `https://wa.me/?text=${encodeURIComponent(t("scaryWaMessage"))}`;
  return (
    <>
      <div className="stop" id="src-scary">
        <h1>{t("scaryTitle")}</h1>
        <p>{t("scaryLine1")}</p>
        <p>{t("scaryLine2")}</p>
        <p><strong>{t("scaryLine3")}</strong></p>
      </div>
      <div className="stopbar">
        <a className="btn red" href="tel:1930">{t("scaryCall1930")}</a>
        <a className="btn whatsapp" href={wa} target="_blank" rel="noreferrer noopener">{t("scaryWhatsapp")}</a>
        <button type="button" className="btn sec" onClick={async () => toast(t((await copyText(t("scaryWaMessage"))) ? "copied" : "copyFailed"))}>{t("famMsg")}</button>
        <ReadButton from={["src-scary"]} />
        <button type="button" className="btn sec" onClick={() => actions.go("home")}>{t("scaryDone")}</button>
      </div>
      <p>{t("danger")}</p>
    </>
  );
}
