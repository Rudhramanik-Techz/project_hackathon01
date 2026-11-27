// "Bolo" voice input and the spoken verdict, using only what the browser already has (no library, no server).
// Speech-to-text is the browser's own service: in Chrome the audio goes to the browser maker to be turned into
// text. Speaking the verdict uses only voices installed on the device, like the "Read aloud" button.

/** The part of the Web Speech API this app uses (TypeScript's DOM types do not include the recognizer). */
export interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type RecognizerCtor = new () => Recognizer;

export function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** BCP 47 tag for the app language: en-IN, hi-IN, ta-IN, bn-IN, mr-IN, te-IN, kn-IN, ml-IN. */
export const speechTag = (lang: string) => `${lang}-IN`;

/** What went wrong, as a string key the screen can show. */
export function recognitionErrorKey(error: string): "boloDenied" | "boloNoSpeech" | "boloError" | null {
  if (error === "not-allowed" || error === "service-not-allowed") return "boloDenied";
  if (error === "no-speech") return "boloNoSpeech";
  if (error === "aborted") return null; // stopped on purpose
  return "boloError";
}

/** Runs `fn` once the browser's voice list is loaded (Chrome fills it late), or after 1.5 s. Returns a cancel. */
export function whenVoicesReady(fn: () => void): () => void {
  const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
  if (!synth) return () => {};
  if (synth.getVoices().length) {
    fn();
    return () => {};
  }
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    synth.removeEventListener("voiceschanged", go);
    fn();
  };
  synth.addEventListener("voiceschanged", go);
  const timer = setTimeout(go, 1500);
  return () => {
    done = true;
    clearTimeout(timer);
    synth.removeEventListener("voiceschanged", go);
  };
}

/** Speaks `text` with an on-device voice for `lang`. Returns false (and stays silent) when there is none. */
export function speakLocal(text: string, lang: string): boolean {
  const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
  if (!synth || !text.trim()) return false;
  const voice = synth.getVoices().find((v) => v.localService && v.lang.toLowerCase().startsWith(lang));
  if (!voice) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.9;
  synth.speak(u);
  return true;
}
