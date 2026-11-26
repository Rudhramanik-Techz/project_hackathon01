// A calendar entry made on the device. It carries only fixed wording and the chosen time: no case details.

/** Calendar files need long lines folded, without splitting a character. */
function fold(line: string): string {
  let out = "";
  let n = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (n + size > 73) {
      out += "\r\n ";
      n = 1;
    }
    out += ch;
    n += size;
  }
  return out;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const escape = (v: string) => v.replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

export function reminderIcs(start: Date, title: string, note: string, now = new Date()): string {
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Asli Ya Nakli//EN",
      "BEGIN:VEVENT",
      `UID:${start.getTime()}-${now.getTime()}@asliyanakli`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(new Date(start.getTime() + 30 * 60_000))}`,
      `SUMMARY:${escape(title)}`,
      `DESCRIPTION:${escape(note)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escape(title)}`,
      "TRIGGER:PT0M",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
