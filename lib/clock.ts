/**
 * Break clock: punches, who is in what state, and hours worked.
 * Pure functions; storage is in clock-store.ts.
 */
export type PunchType = "in" | "break_start" | "break_end" | "out";
export type Punch = {
  id: string;
  teacherId: string;
  type: PunchType;
  at: string;                 // ISO instant (UTC)
  source: "kiosk-qr" | "kiosk-card" | "kiosk-tap" | "phone" | "admin";
  note?: string;
};
export type ClockState = "off" | "working" | "break";

export const PUNCH_LABEL: Record<PunchType, string> = {
  in: "Clocked in", break_start: "Break started", break_end: "Back from break", out: "Clocked out",
};
export const ACTION_LABEL: Record<PunchType, string> = {
  in: "Clock in", break_start: "Start break", break_end: "End break", out: "Clock out",
};

/** After this many hours without a clock-out, the shift is treated as forgotten. */
export const STALE_HOURS = 16;

export function sortPunches(punches: Punch[]): Punch[] {
  return [...punches].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

/** Current state from a person's punches (any range), ignoring a shift left open for too long. */
export function statusFor(punches: Punch[], now = new Date()): { state: ClockState; since: string | null; last: Punch | null; stale: boolean } {
  const list = sortPunches(punches);
  let state: ClockState = "off"; let since: string | null = null; let last: Punch | null = null;
  for (const p of list) {
    last = p;
    if (p.type === "in") { state = "working"; since = p.at; }
    else if (p.type === "break_start" && state === "working") { state = "break"; since = p.at; }
    else if (p.type === "break_end" && state === "break") { state = "working"; since = p.at; }
    else if (p.type === "out") { state = "off"; since = p.at; }
  }
  const stale = state !== "off" && !!since && now.getTime() - new Date(since).getTime() > STALE_HOURS * 3600_000;
  if (stale) return { state: "off", since, last, stale: true };
  return { state, since, last, stale: false };
}

export function allowedActions(state: ClockState): PunchType[] {
  if (state === "off") return ["in"];
  if (state === "working") return ["break_start", "out"];
  return ["break_end", "out"];
}

/** 'YYYY-MM-DD' for an instant in the school's time zone. */
export function localDate(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function localTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
export function monthKey(iso: string, tz: string): string { return localDate(iso, tz).slice(0, 7); }

export type DaySummary = {
  teacherId: string;
  date: string;              // local date
  firstIn: string | null;    // ISO
  lastOut: string | null;    // ISO
  workedMin: number;         // shift time minus breaks (closed shifts only)
  breakMin: number;
  breaks: number;
  punches: Punch[];
  issues: string[];
  open: boolean;             // still clocked in (or on break) at the end of the day's punches
};

function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

/** One summary per person per local day. */
export function summarizeDays(punches: Punch[], tz: string): DaySummary[] {
  const groups = new Map<string, Punch[]>();
  for (const p of sortPunches(punches)) {
    const k = `${p.teacherId}|${localDate(p.at, tz)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
  }
  const out: DaySummary[] = [];
  for (const [k, list] of groups) {
    const [teacherId, date] = k.split("|");
    const s: DaySummary = { teacherId, date, firstIn: null, lastOut: null, workedMin: 0, breakMin: 0, breaks: 0, punches: list, issues: [], open: false };
    let state: ClockState = "off"; let shiftStart: string | null = null; let breakStart: string | null = null; let shiftBreakMin = 0;
    for (const p of list) {
      if (p.type === "in") {
        if (state !== "off") { s.issues.push(`Clocked in again at ${localTime(p.at, tz)} without clocking out`); continue; }
        state = "working"; shiftStart = p.at; shiftBreakMin = 0; if (!s.firstIn) s.firstIn = p.at;
      } else if (p.type === "break_start") {
        if (state !== "working") { s.issues.push(`Break started at ${localTime(p.at, tz)} while ${state === "off" ? "not clocked in" : "already on break"}`); continue; }
        state = "break"; breakStart = p.at;
      } else if (p.type === "break_end") {
        if (state !== "break" || !breakStart) { s.issues.push(`Break ended at ${localTime(p.at, tz)} without a break start`); continue; }
        const m = minutesBetween(breakStart, p.at); shiftBreakMin += m; s.breakMin += m; s.breaks += 1; state = "working"; breakStart = null;
      } else if (p.type === "out") {
        if (state === "off" || !shiftStart) { s.issues.push(`Clocked out at ${localTime(p.at, tz)} without clocking in`); continue; }
        if (state === "break" && breakStart) { const m = minutesBetween(breakStart, p.at); shiftBreakMin += m; s.breakMin += m; s.breaks += 1; s.issues.push(`Clocked out at ${localTime(p.at, tz)} while on break; the break was counted until then`); breakStart = null; }
        s.workedMin += Math.max(0, minutesBetween(shiftStart, p.at) - shiftBreakMin);
        s.lastOut = p.at; state = "off"; shiftStart = null;
      }
    }
    if (state !== "off") { s.open = true; s.issues.push("No clock-out recorded"); }
    out.push(s);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.teacherId.localeCompare(b.teacherId));
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}:${m < 10 ? "0" : ""}${m}`;
}
export function hoursDecimal(min: number): string { return (min / 60).toFixed(2); }

/** Month keys ('YYYY-MM') covering an inclusive local-date range. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const end = to.slice(0, 7);
  for (let i = 0; i < 36; i++) {
    const k = `${y}-${m < 10 ? "0" : ""}${m}`;
    out.push(k);
    if (k >= end) break;
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function newPunchId(): string {
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
