import { useEffect, useState } from "react";

const EVENT = "asli:toast";

export const toast = (message: string) => window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));

export function Toast() {
  const [message, setMessage] = useState("");
  const [on, setOn] = useState(false);
  useEffect(() => {
    let timer = 0;
    const show = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      setOn(true);
      clearTimeout(timer);
      timer = window.setTimeout(() => setOn(false), 3500);
    };
    window.addEventListener(EVENT, show);
    return () => {
      window.removeEventListener(EVENT, show);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div id="toast" role="status" aria-live="polite" className={on ? "on" : ""}>
      {message}
    </div>
  );
}
