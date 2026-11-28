// Read aloud with a voice installed on the device. A network voice would send the text, which may be
// personal, to a server, so only voices marked local are used.
import { useEffect, useState } from "react";
import { useLang, useT } from "../i18n";
import { toast } from "./toast";

const STOP = "asli:stop-reading";

export function stopReading(): void {
  window.speechSynthesis?.cancel();
  window.dispatchEvent(new Event(STOP));
}

/** `from` lists element ids whose text is read in order. */
export function ReadButton({ from }: { from: string[] }) {
  const t = useT();
  const lang = useLang();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    window.speechSynthesis?.getVoices(); // some browsers load the list only after the first request
    const off = () => setSpeaking(false);
    window.addEventListener(STOP, off);
    return () => window.removeEventListener(STOP, off);
  }, []);
  // Leaving the page or changing the text or language ends the reading.
  const key = `${lang}:${from.join()}`;
  useEffect(() => () => stopReading(), [key]);

  const toggle = () => {
    if (speaking) return stopReading();
    stopReading();
    const synth = window.speechSynthesis;
    const voice = synth?.getVoices().find((v) => v.localService && v.lang.toLowerCase().startsWith(lang));
    if (!voice) return toast(t("noVoice"));
    const utterance = new SpeechSynthesisUtterance(from.map((id) => document.getElementById(id)?.textContent ?? "").join(". "));
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.9;
    utterance.onend = utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  };
  return (
    <button type="button" className="btn sec sm" onClick={toggle} aria-pressed={speaking}>
      {t(speaking ? "stop" : "read")}
    </button>
  );
}
