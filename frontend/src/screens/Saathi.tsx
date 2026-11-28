// Saathi drill: a young relative plays a fake scam call to a parent, then they repeat three rules.
// Audio is pre-generated (Polly Kajal for en/hi) or recorded (ta) and cached offline by the service worker.
// Other languages have the written script, which a device voice can read aloud.
import { useState } from "react";
import { useLang, useT } from "../i18n";
import type { Actions } from "../routes";
import { Panel, Rules } from "../ui/bits";
import { ReadButton } from "../ui/ReadButton";

const RECORDED = ["en", "hi", "ta"];

function Clip({ src, label }: { src: string; label: string }) {
  const t = useT();
  const [missing, setMissing] = useState(false);
  return (
    <div className="clip">
      <p><b>{label}</b></p>
      {missing ? (
        <p className="warnline">{t("saathiNoAudio")}</p>
      ) : (
        <audio controls preload="none" src={src} onError={() => setMissing(true)}>
          <track kind="captions" />
        </audio>
      )}
    </div>
  );
}

export function Saathi({ actions }: { actions: Actions }) {
  const t = useT();
  const lang = useLang();
  const recorded = RECORDED.includes(lang);
  return (
    <>
      <h1>{t("saathiTitle")}</h1>
      <p className="lead">{t("saathiIntro")}</p>
      <Panel title={t("saathiTranscriptTitle")}>
        <div className="pad">
          {recorded && <Clip key={lang} src={`/audio/${lang}/mock_call.mp3`} label={t("saathiPlay")} />}
          <blockquote id="src-drill">{t("saathiTranscript")}</blockquote>
          <div className="row">
            <ReadButton from={["src-drill"]} />
            <button type="button" className="btn sec sm" onClick={() => actions.go("quiz")}>{t("sQuiz")}</button>
          </div>
        </div>
      </Panel>
      <Panel title={t("saathiRulesTitle")}>
        <Rules id="src-rules" />
        <div className="pad">
          {recorded && <Clip key={lang} src={`/audio/${lang}/rules.mp3`} label={t("saathiRulesAudio")} />}
          <ReadButton from={["src-rules"]} />
        </div>
      </Panel>
    </>
  );
}
