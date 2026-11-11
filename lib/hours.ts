import { summarizeDays, type DaySummary, type Punch } from "./clock";

/** Range helpers and grouping for the hours report. */
export function isoDate(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
/** Monday of the week containing the date. */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
}
export const isISODate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export type PersonHours = { teacherId: string; days: DaySummary[]; workedMin: number; breakMin: number; issues: number };

export function groupByPerson(punches: Punch[], tz: string): PersonHours[] {
  const days = summarizeDays(punches, tz);
  const m = new Map<string, PersonHours>();
  for (const d of days) {
    const e = m.get(d.teacherId) ?? { teacherId: d.teacherId, days: [], workedMin: 0, breakMin: 0, issues: 0 };
    e.days.push(d); e.workedMin += d.workedMin; e.breakMin += d.breakMin; e.issues += d.issues.length;
    m.set(d.teacherId, e);
  }
  return [...m.values()];
}

export function toCsv(people: PersonHours[], names: Map<string, string>, tz: string): string {
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const time = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "");
  const rows = [["name", "date", "clock_in", "clock_out", "breaks", "break_minutes", "worked_minutes", "worked_hours", "issues"].join(",")];
  for (const p of people) for (const d of p.days) {
    rows.push([names.get(p.teacherId) || p.teacherId, d.date, time(d.firstIn), time(d.lastOut), d.breaks, d.breakMin, d.workedMin, (d.workedMin / 60).toFixed(2), d.issues.join("; ")].map(esc).join(","));
  }
  return rows.join("\n") + "\n";
}
