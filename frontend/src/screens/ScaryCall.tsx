// Works with no network at all: static text plus a wa.me share link and tel: links.
import { AlertIcon, PhoneIcon, ShieldIcon, UsersIcon } from "../components/Icons";
import { useT } from "../i18n";

export function ScaryCall({ onDone }: { onDone: () => void }) {
  const t = useT();
  const wa = `https://wa.me/?text=${encodeURIComponent(t("scaryWaMessage"))}`;
  const lines = [
    [<ShieldIcon key="i" size={28} />, t("scaryLine1")],
    [<AlertIcon key="i" size={28} />, t("scaryLine2")],
    [<PhoneIcon key="i" size={28} />, t("scaryLine3")],
  ] as const;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-red-700 text-white">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-16">
        <h1 className="text-5xl font-black leading-tight text-white sm:text-6xl">{t("scaryTitle")}</h1>
        <ul className="space-y-5">
          {lines.map(([icon, text], i) => (
            <li key={i} className="flex items-start gap-4 text-2xl font-semibold leading-snug sm:text-3xl">
              <span className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto grid gap-3 sm:grid-cols-2">
          <a href={wa} target="_blank" rel="noreferrer noopener"
            className="flex min-h-16 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-center text-lg font-bold text-white sm:col-span-2">
            <UsersIcon />{t("scaryWhatsapp")}
          </a>
          <a href="tel:1930" className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-white px-4 text-center text-lg font-bold text-red-800">
            <PhoneIcon />{t("scaryCall1930")}
          </a>
          <button type="button" onClick={onDone} className="min-h-14 rounded-xl border-2 border-white/70 text-lg font-semibold text-white">
            {t("scaryDone")}
          </button>
        </div>
      </div>
    </div>
  );
}
