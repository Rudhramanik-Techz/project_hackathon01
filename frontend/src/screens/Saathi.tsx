// Saathi drill: a young relative plays a fake scam call to a parent, then they repeat three rules.
// Audio is pre-generated (Polly Kajal for en/hi) or recorded (ta) and cached offline by the service worker.
import { useState } from "react";
import { useLang, useT } from "../i18n";

function Clip({ src, label }: { src: string; label: string }) {
  const t = useT();
  const [missing, setMissing] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 font-semibold">{label}</p>
      {missing ? (
        <p className="text-sm text-amber-800">{t("saathiNoAudio")}</p>
      ) : (
        <audio key={src} controls preload="none" src={src} onError={() => setMissing(true)} className="w-full">
          <track kind="captions" />
        </audio>
      )}
    </div>
  );
}

export function Saathi() {
  const t = useT();
  const lang = useLang();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("saathiTitle")}</h1>
        <p className="mt-1 text-slate-600">{t("saathiIntro")}</p>
      </div>
      <Clip src={`/audio/${lang}/mock_call.mp3`} label={t("saathiPlay")} />
      <details className="rounded-xl border border-slate-200 bg-white p-3">
        <summary className="min-h-10 cursor-pointer font-semibold">{t("saathiTranscriptTitle")}</summary>
        <p className="mt-2 italic text-slate-700">{t("saathiTranscript")}</p>
      </details>
      <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
        <h2 className="text-xl font-bold text-emerald-900">{t("saathiRulesTitle")}</h2>
        <ol className="mt-3 space-y-3">
          {[t("saathiRule1"), t("saathiRule2"), t("saathiRule3")].map((rule, i) => (
            <li key={i} className="flex items-start gap-3 text-lg text-emerald-950">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">{i + 1}</span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
      </section>
      <Clip src={`/audio/${lang}/rules.mp3`} label={t("saathiRulesAudio")} />
    </div>
  );
}
